import { Injectable } from "@nestjs/common";
import { AgentService } from "../agent/agent.service";
import { MLModelService } from "./ml-model.service";
import { FeedbackService } from "./feedback.service";
import { RecommendationAuditService } from "./recommendation-audit.service";
import { RecommendationResponseDto } from "./dto/recommendation-response.dto";
import { InteractionType } from "./entities/recommendation-interaction.entity";

@Injectable()
export class RecommendationService {
  private readonly PERFORMANCE_WEIGHT = 0.7;
  private readonly USAGE_WEIGHT = 0.3;

  constructor(
    private readonly agentService: AgentService,
    private readonly mlModelService: MLModelService,
    private readonly feedbackService: FeedbackService,
    private readonly auditService: RecommendationAuditService,
  ) {}

  async getRecommendations(options?: {
    userId?: string | null;
    capabilities?: string[];
    limit?: number;
    sessionId?: string;
  }): Promise<RecommendationResponseDto[]> {
    const userId = options?.userId || null;
    const requestedCapabilities = options?.capabilities || [];
    const limit = options?.limit || 10;
    const sessionId = options?.sessionId;

    // Log the request for audit
    const requestId = await this.auditService.logRecommendationRequest(userId, {
      capabilities: requestedCapabilities,
      limit,
      sessionId,
    });

    try {
      let agents = this.agentService.findAll();

      // Filter by capabilities if provided
      if (requestedCapabilities.length > 0) {
        agents = agents.filter((agent) =>
          requestedCapabilities.some((cap) => agent.capabilities.includes(cap)),
        );
      }

      if (agents.length === 0) return [];

      // Score each agent using ML model
      const scoredAgents = await Promise.all(
        agents.map(async (agent) => {
          const mlScore = await this.mlModelService.predictScore(
            userId,
            agent,
            requestedCapabilities,
          );

          // Also calculate traditional score for comparison/hybrid approach
          const maxUsage = Math.max(...agents.map((a) => a.usageCount), 1);
          const normalizedUsage = (agent.usageCount / maxUsage) * 100;
          const traditionalScore =
            agent.performanceScore * this.PERFORMANCE_WEIGHT +
            normalizedUsage * this.USAGE_WEIGHT;

          // Combine ML score with traditional score (ML gets higher weight)
          const combinedScore = mlScore * 0.7 + (traditionalScore / 100) * 0.3;

          return {
            agentId: agent.id,
            name: agent.name,
            totalScore: parseFloat(combinedScore.toFixed(4)),
            mlScore: parseFloat(mlScore.toFixed(4)),
            traditionalScore: parseFloat(traditionalScore.toFixed(2)),
            explanation: {
              performanceScore: agent.performanceScore,
              usageScore: parseFloat(normalizedUsage.toFixed(2)),
              performanceWeight: this.PERFORMANCE_WEIGHT,
              usageWeight: this.USAGE_WEIGHT,
              mlFeatures: await this.mlModelService.extractFeatures(
                userId,
                agent,
                requestedCapabilities,
              ),
            },
          };
        }),
      );

      // Sort by combined score descending
      const sorted = scoredAgents.sort((a, b) => b.totalScore - a.totalScore);

      // Track impressions for analytics
      if (sessionId || userId) {
        sorted.slice(0, limit).forEach((rec, index) => {
          this.feedbackService
            .recordInteraction({
              userId: userId || undefined,
              agentId: rec.agentId,
              interactionType: InteractionType.IMPRESSION,
              position: index + 1,
              sessionId,
              context: { capabilities: requestedCapabilities },
            })
            .catch((err) => console.error("Failed to track impression:", err));
        });
      }

      // Log the response for audit
      await this.auditService.logRecommendationResponse(
        requestId,
        sorted.slice(0, limit).map((rec, idx) => ({
          agentId: rec.agentId,
          score: rec.totalScore,
          position: idx + 1,
        })),
        userId || undefined,
      );

      // Limit results
      return sorted.slice(0, limit);
    } catch (error) {
      // Log any errors
      await this.auditService.logError(
        userId,
        "getRecommendations",
        error.message,
        { options },
      );
      throw error;
    }
  }
}
