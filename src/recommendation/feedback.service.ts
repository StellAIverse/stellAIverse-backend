import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Between } from "typeorm";
import {
  RecommendationFeedback,
  FeedbackType,
} from "./entities/recommendation-feedback.entity";
import {
  RecommendationInteraction,
  InteractionType,
} from "./entities/recommendation-interaction.entity";
import { MLModelService } from "./ml-model.service";

/**
 * DTO for submitting feedback
 */
export interface SubmitFeedbackDto {
  userId?: string;
  agentId: string;
  feedbackType: FeedbackType;
  rating?: number;
  metadata?: Record<string, any>;
  sessionId?: string;
}

/**
 * DTO for recording interactions
 */
export interface RecordInteractionDto {
  userId?: string;
  agentId: string;
  interactionType: InteractionType;
  position?: number;
  sessionId?: string;
  context?: Record<string, any>;
  viewDurationMs?: number;
}

/**
 * Service for collecting and managing user feedback and interactions
 */
@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    @InjectRepository(RecommendationFeedback)
    private readonly feedbackRepository: Repository<RecommendationFeedback>,
    @InjectRepository(RecommendationInteraction)
    private readonly interactionRepository: Repository<RecommendationInteraction>,
    private readonly mlModelService: MLModelService,
  ) {}

  /**
   * Submit explicit or implicit feedback
   */
  async submitFeedback(
    dto: SubmitFeedbackDto,
  ): Promise<RecommendationFeedback> {
    // Validate rating if provided
    if (dto.rating !== undefined && dto.rating !== null) {
      if (dto.rating < 1 || dto.rating > 5) {
        throw new Error("Rating must be between 1 and 5");
      }
    }

    const feedback = this.feedbackRepository.create({
      userId: dto.userId || null,
      agentId: dto.agentId,
      feedbackType: dto.feedbackType,
      rating: dto.rating,
      metadata: dto.metadata,
      sessionId: dto.sessionId,
    });

    await this.feedbackRepository.save(feedback);

    this.logger.log(
      `Feedback received: ${dto.feedbackType} for agent ${dto.agentId}` +
        (dto.userId ? ` from user ${dto.userId}` : ""),
    );

    // Trigger model retraining periodically (every 100 feedback items)
    const feedbackCount = await this.feedbackRepository.count();
    if (feedbackCount % 100 === 0) {
      this.logger.log("Triggering periodic model retraining...");
      this.mlModelService
        .trainModel()
        .catch((err) => this.logger.error("Failed to train model", err));
    }

    return feedback;
  }

  /**
   * Record a user interaction with a recommendation
   */
  async recordInteraction(
    dto: RecordInteractionDto,
  ): Promise<RecommendationInteraction> {
    const interaction = this.interactionRepository.create({
      userId: dto.userId || null,
      agentId: dto.agentId,
      interactionType: dto.interactionType,
      position: dto.position,
      sessionId: dto.sessionId,
      context: dto.context,
      viewDurationMs: dto.viewDurationMs,
    });

    await this.interactionRepository.save(interaction);

    this.logger.log(
      `Interaction recorded: ${dto.interactionType} for agent ${dto.agentId}` +
        (dto.userId ? ` from user ${dto.userId}` : ""),
    );

    return interaction;
  }

  /**
   * Get feedback statistics for an agent
   */
  async getAgentFeedbackStats(agentId: string): Promise<{
    totalFeedback: number;
    averageRating: number;
    distribution: Record<number, number>;
    positiveCount: number;
    negativeCount: number;
  }> {
    const feedbackList = await this.feedbackRepository.find({
      where: { agentId },
    });

    const ratings = feedbackList
      .filter(
        (f) => f.feedbackType === FeedbackType.EXPLICIT_RATING && f.rating,
      )
      .map((f) => f.rating!);

    const distribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    ratings.forEach((r) => distribution[r]++);

    const averageRating =
      ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : 0;

    const positiveCount = feedbackList.filter(
      (f) =>
        f.feedbackType === FeedbackType.USAGE ||
        (f.feedbackType === FeedbackType.EXPLICIT_RATING &&
          (f.rating ?? 0) >= 4),
    ).length;

    const negativeCount = feedbackList.filter(
      (f) =>
        f.feedbackType === FeedbackType.DISMISS ||
        (f.feedbackType === FeedbackType.EXPLICIT_RATING &&
          (f.rating ?? 0) <= 2),
    ).length;

    return {
      totalFeedback: feedbackList.length,
      averageRating,
      distribution,
      positiveCount,
      negativeCount,
    };
  }

  /**
   * Get user's feedback history
   */
  async getUserFeedbackHistory(
    userId: string,
    limit = 50,
  ): Promise<RecommendationFeedback[]> {
    return this.feedbackRepository.find({
      where: { userId },
      order: { createdAt: "DESC" },
      take: limit,
    });
  }

  /**
   * Get interaction history for a user or session
   */
  async getInteractionHistory(
    userId?: string,
    sessionId?: string,
    limit = 100,
  ): Promise<RecommendationInteraction[]> {
    const where: any = {};

    if (userId) {
      where.userId = userId;
    } else if (sessionId) {
      where.sessionId = sessionId;
    }

    return this.interactionRepository.find({
      where,
      order: { createdAt: "DESC" },
      take: limit,
    });
  }

  /**
   * Get recent feedback for analytics
   */
  async getRecentFeedback(hours = 24): Promise<RecommendationFeedback[]> {
    const now = new Date();
    const past = new Date(now.getTime() - hours * 60 * 60 * 1000);

    return this.feedbackRepository.find({
      where: {
        createdAt: Between(past, now),
      },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Get recent interactions for analytics
   */
  async getRecentInteractions(
    hours = 24,
  ): Promise<RecommendationInteraction[]> {
    const now = new Date();
    const past = new Date(now.getTime() - hours * 60 * 60 * 1000);

    return this.interactionRepository.find({
      where: {
        createdAt: Between(past, now),
      },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Delete feedback by ID
   */
  async deleteFeedback(id: string): Promise<void> {
    await this.feedbackRepository.delete(id);
    this.logger.log(`Feedback ${id} deleted`);
  }

  /**
   * Clear old data (for maintenance)
   */
  async clearOldData(daysOld = 90): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // This is a simplified example - in production, you'd want to batch delete
    this.logger.log(`Clearing data older than ${daysOld} days...`);

    // Note: TypeORM doesn't support bulk delete with date conditions easily
    // You might need to implement this differently based on your needs
  }
}
