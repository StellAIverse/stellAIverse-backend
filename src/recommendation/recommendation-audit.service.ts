import { Injectable, Logger } from "@nestjs/common";
import { ProvenanceService } from "../audit/provenance.service";
import {
  ProvenanceAction,
  ProvenanceStatus,
} from "../audit/entities/provenance-record.entity";

/**
 * Audit logging service for recommendation system
 * Ensures all recommendation requests and responses are logged for auditability
 */
@Injectable()
export class RecommendationAuditService {
  private readonly logger = new Logger(RecommendationAuditService.name);

  constructor(private readonly provenanceService: ProvenanceService) {}

  /**
   * Log a recommendation request
   */
  async logRecommendationRequest(
    userId: string | null,
    context?: {
      capabilities?: string[];
      limit?: number;
      sessionId?: string;
    },
  ): Promise<string> {
    const record = await this.provenanceService.createProvenanceRecord({
      agentId: "recommendation-system",
      userId: userId || undefined,
      action: ProvenanceAction.REQUEST_RECEIVED,
      input: {
        type: "recommendation_request",
        capabilities: context?.capabilities,
        limit: context?.limit,
        sessionId: context?.sessionId,
      },
      status: ProvenanceStatus.SUCCESS,
      metadata: {
        event: "recommendation_request_logged",
        timestamp: new Date().toISOString(),
      },
    });

    this.logger.log(
      `Logged recommendation request for user ${userId || "anonymous"}`,
    );
    return record.id;
  }

  /**
   * Log a recommendation response
   */
  async logRecommendationResponse(
    requestId: string,
    recommendations: Array<{
      agentId: string;
      score: number;
      position: number;
    }>,
    userId?: string,
  ): Promise<string> {
    const record = await this.provenanceService.updateProvenanceRecord(
      requestId,
      {
        output: {
          type: "recommendation_response",
          recommendations,
          count: recommendations.length,
        },
      },
    );

    this.logger.log(
      `Logged recommendation response: ${recommendations.length} agents recommended`,
    );

    return requestId;
  }

  /**
   * Log feedback submission
   */
  async logFeedbackSubmission(
    userId: string | null,
    feedbackData: {
      agentId: string;
      feedbackType: string;
      rating?: number;
      sessionId?: string;
    },
  ): Promise<string> {
    const record = await this.provenanceService.createProvenanceRecord({
      agentId: "recommendation-system",
      userId: userId || undefined,
      action: ProvenanceAction.SUBMISSION,
      input: {
        type: "feedback_submission",
        ...feedbackData,
      },
      status: ProvenanceStatus.SUCCESS,
      metadata: {
        event: "feedback_logged",
        timestamp: new Date().toISOString(),
      },
    });

    this.logger.log(
      `Logged feedback: ${feedbackData.feedbackType} for agent ${feedbackData.agentId}`,
    );

    return record.id;
  }

  /**
   * Log model training event
   */
  async logModelTraining(
    userId: string | null,
    metrics: {
      trainingExamples: number;
      iterations?: number;
      triggeredBy?: string;
    },
  ): Promise<string> {
    const record = await this.provenanceService.createProvenanceRecord({
      agentId: "ml-model-service",
      userId: userId || undefined,
      action: ProvenanceAction.RESULT_NORMALIZATION,
      input: {
        type: "model_training",
        ...metrics,
      },
      status: ProvenanceStatus.SUCCESS,
      metadata: {
        event: "model_training_completed",
        timestamp: new Date().toISOString(),
      },
    });

    this.logger.log(
      `Logged model training: ${metrics.trainingExamples} examples processed`,
    );

    return record.id;
  }

  /**
   * Log error in recommendation system
   */
  async logError(
    userId: string | null,
    action: string,
    error: string,
    context?: Record<string, any>,
  ): Promise<string> {
    const record = await this.provenanceService.createProvenanceRecord({
      agentId: "recommendation-system",
      userId: userId || undefined,
      action: ProvenanceAction.PROVIDER_CALL, // Using closest match
      input: {
        type: "error",
        action,
        context,
      },
      status: ProvenanceStatus.FAILED,
      error,
      metadata: {
        event: "recommendation_error",
        timestamp: new Date().toISOString(),
      },
    });

    this.logger.error(`Logged error: ${error} during ${action}`);

    return record.id;
  }
}
