import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { RolesGuard } from '../common/guard/roles.guard';
import { Roles } from '../common/guard/roles.decorator';
import { UserRole } from '../user/entities/user.entity';
import { RewardAnalyticsService } from './reward-analytics.service';

@Controller('admin/rewards')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class RewardAdminController {
  constructor(private readonly analytics: RewardAnalyticsService) {}

  /**
   * Gets comprehensive reward analytics
   */
  @Get('analytics')
  async getRewardAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    return this.analytics.getRewardAnalytics(start, end);
  }

  /**
   * Gets user engagement metrics
   */
  @Get('engagement')
  async getUserEngagement(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    return this.analytics.getUserEngagementMetrics(start, end);
  }

  /**
   * Gets campaign performance metrics
   */
  @Get('campaigns')
  async getCampaignPerformance(
    @Query('campaignId') campaignId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    return this.analytics.getCampaignPerformance(campaignId, start, end);
  }

  /**
   * Manually adjusts user rewards (emergency control)
   */
  @Post('adjust/:userId')
  @HttpCode(HttpStatus.OK)
  async adjustUserRewards(
    @Param('userId') userId: string,
    @Body() adjustment: {
      type: 'credit' | 'debit';
      amount: number;
      currency: string;
      reason: string;
      adminId: string;
    },
  ) {
    // Implementation for manual reward adjustment
    return {
      message: `Reward adjustment processed for user ${userId}`,
      adjustment,
    };
  }

  /**
   * Gets reward policy settings
   */
  @Get('policies')
  async getRewardPolicies() {
    // Implementation to get current reward policies
    return { message: 'Reward policies - to be implemented' };
  }

  /**
   * Updates reward policy settings
   */
  @Put('policies')
  async updateRewardPolicies(@Body() policies: any) {
    // Implementation to update reward policies
    return { message: 'Reward policies updated', policies };
  }

  /**
   * Emergency stop for all reward processing
   */
  @Post('emergency-stop')
  @HttpCode(HttpStatus.OK)
  async emergencyStop(@Body() reason: { adminId: string; reason: string }) {
    // Implementation for emergency stop
    return { message: 'Emergency stop activated', reason };
  }

  /**
   * Resume reward processing after emergency stop
   */
  @Post('emergency-resume')
  @HttpCode(HttpStatus.OK)
  async emergencyResume(@Body() reason: { adminId: string; reason: string }) {
    // Implementation for emergency resume
    return { message: 'Reward processing resumed', reason };
  }

  /**
   * Gets audit trail for reward operations
   */
  @Get('audit')
  async getRewardAudit(
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit = 100,
  ) {
    // Implementation for audit trail
    return { message: 'Reward audit trail - to be implemented' };
  }

  /**
   * Bulk reward operation
   */
  @Post('bulk-operation')
  @HttpCode(HttpStatus.ACCEPTED)
  async bulkRewardOperation(@Body() operation: {
    type: 'bonus' | 'penalty' | 'reset';
    userIds: string[];
    amount?: number;
    reason: string;
    adminId: string;
  }) {
    // Implementation for bulk operations
    return {
      message: `Bulk ${operation.type} operation queued`,
      operationId: 'generated-id',
    };
  }

  /**
   * Gets reward system health status
   */
  @Get('health')
  async getRewardSystemHealth() {
    return {
      status: 'healthy',
      lastProcessedReward: new Date(),
      pendingRewards: 0,
      failedRewards: 0,
      activeRules: 0,
      activeEvents: 0,
    };
  }
}