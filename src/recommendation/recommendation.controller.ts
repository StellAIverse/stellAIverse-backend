import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Query, 
  Param, 
  Delete,
  Headers,
  Logger,
} from "@nestjs/common";
import { RecommendationService } from "./recommendation.service";
import { FeedbackService, SubmitFeedbackDto } from "./feedback.service";
import { MLModelService } from "./ml-model.service";
import { RecommendationResponseDto } from "./dto/recommendation-response.dto";
import { FeedbackType } from "./entities/recommendation-feedback.entity";
import { InteractionType } from "./entities/recommendation-interaction.entity";

@Controller("recommendations")
export class RecommendationController {
  private readonly logger = new Logger(RecommendationController.name);

  constructor(
    private readonly recommendationService: RecommendationService,
    private readonly feedbackService: FeedbackService,
    private readonly mlModelService: MLModelService,
  ) {}

  @Get()
  async getRecommendations(
    @Query('userId') userId?: string,
    @Query('capabilities') capabilities?: string,
    @Query('limit') limit?: number,
    @Query('sessionId') sessionId?: string,
    @Headers() headers?: any,
  ): Promise<RecommendationResponseDto[]> {
    const capabilityList = capabilities ? capabilities.split(',') : [];
    const parsedLimit = limit ? parseInt(limit.toString(), 10) : undefined;

    // Try to get user ID from session if not provided
    const effectiveUserId = userId || (headers?.['x-user-id'] as string) || null;
    const effectiveSessionId = sessionId || headers?.['x-session-id'] as string;

    this.logger.log(
      `Getting recommendations for user ${effectiveUserId || 'anonymous'} ` +
      `with capabilities: ${capabilityList.join(', ') || 'none'}`,
    );

    return this.recommendationService.getRecommendations({
      userId: effectiveUserId,
      capabilities: capabilityList,
      limit: parsedLimit,
      sessionId: effectiveSessionId,
    });
  }

  /**
   * Submit feedback on a recommendation
   */
  @Post('feedback')
  async submitFeedback(@Body() body: any): Promise<any> {
    const dto: SubmitFeedbackDto = {
      userId: body.userId,
      agentId: body.agentId,
      feedbackType: body.feedbackType as FeedbackType,
      rating: body.rating,
      metadata: body.metadata,
      sessionId: body.sessionId,
    };

    const feedback = await this.feedbackService.submitFeedback(dto);
    
    this.logger.log(
      `Feedback received: ${dto.feedbackType} for agent ${dto.agentId}`,
    );

    return {
      success: true,
      data: feedback,
      message: 'Feedback recorded successfully',
    };
  }

  /**
   * Record an interaction with a recommendation
   */
  @Post('interactions')
  async recordInteraction(@Body() body: any): Promise<any> {
    const dto = {
      userId: body.userId,
      agentId: body.agentId,
      interactionType: body.interactionType as InteractionType,
      position: body.position,
      sessionId: body.sessionId,
      context: body.context,
      viewDurationMs: body.viewDurationMs,
    };

    const interaction = await this.feedbackService.recordInteraction(dto);

    this.logger.log(
      `Interaction recorded: ${dto.interactionType} for agent ${dto.agentId}`,
    );

    return {
      success: true,
      data: interaction,
      message: 'Interaction recorded successfully',
    };
  }

  /**
   * Get feedback statistics for an agent
   */
  @Get('agents/:agentId/stats')
  async getAgentStats(@Param('agentId') agentId: string): Promise<any> {
    const stats = await this.feedbackService.getAgentFeedbackStats(agentId);
    
    return {
      success: true,
      data: stats,
    };
  }

  /**
   * Get user's feedback history
   */
  @Get('users/:userId/feedback')
  async getUserFeedback(
    @Param('userId') userId: string,
    @Query('limit') limit?: number,
  ): Promise<any> {
    const parsedLimit = limit ? parseInt(limit.toString(), 10) : 50;
    const feedback = await this.feedbackService.getUserFeedbackHistory(
      userId,
      parsedLimit,
    );

    return {
      success: true,
      data: feedback,
      count: feedback.length,
    };
  }

  /**
   * Train the ML model manually (admin endpoint)
   */
  @Post('train')
  async trainModel(): Promise<any> {
    this.logger.log('Manual model training triggered');
    
    await this.mlModelService.trainModel();
    
    const weights = this.mlModelService.getModelWeights();
    const importance = this.mlModelService.getFeatureImportance();

    return {
      success: true,
      data: {
        weights,
        featureImportance: importance,
      },
      message: 'Model trained successfully',
    };
  }

  /**
   * Get current model information (for debugging/auditing)
   */
  @Get('model/info')
  async getModelInfo(): Promise<any> {
    const weights = this.mlModelService.getModelWeights();
    const importance = this.mlModelService.getFeatureImportance();

    return {
      success: true,
      data: {
        modelType: 'Logistic Regression',
        weights,
        featureImportance: importance,
        description: 'ML-based ranking system for agent recommendations',
      },
    };
  }

  /**
   * Quick feedback endpoints for common actions
   */
  @Post(':agentId/click')
  async recordClick(
    @Param('agentId') agentId: string,
    @Body() body: any,
  ): Promise<any> {
    await this.feedbackService.recordInteraction({
      userId: body.userId,
      agentId,
      interactionType: InteractionType.CLICK,
      sessionId: body.sessionId,
    });

    return { success: true, message: 'Click recorded' };
  }

  @Post(':agentId/dismiss')
  async recordDismiss(
    @Param('agentId') agentId: string,
    @Body() body: any,
  ): Promise<any> {
    await this.feedbackService.recordInteraction({
      userId: body.userId,
      agentId,
      interactionType: InteractionType.DISMISS,
      sessionId: body.sessionId,
    });

    return { success: true, message: 'Dismissal recorded' };
  }

  @Post(':agentId/use')
  async recordUsage(
    @Param('agentId') agentId: string,
    @Body() body: any,
  ): Promise<any> {
    await this.feedbackService.submitFeedback({
      userId: body.userId,
      agentId,
      feedbackType: FeedbackType.USAGE,
      sessionId: body.sessionId,
    });

    return { success: true, message: 'Usage recorded' };
  }
}
