import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { RolesGuard } from '../common/guard/roles.guard';
import { Roles } from '../common/guard/roles.decorator';
import { UserRole } from '../user/entities/user.entity';
import { AlertRule, AnalyticsDashboardService } from './analytics-dashboard.service';
import { MetricsService } from './metrics.service';
import { DynamicRateLimitScalingService } from '../quota/dynamic-rate-limit-scaling.service';
import { PremiumFeatureBonusService } from '../quota/premium-feature-bonus.service';
import { RewardAnalyticsService } from './reward-analytics.service';

@Controller('admin/analytics')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATOR)
export class AnalyticsDashboardController {
  constructor(
    private readonly analytics: AnalyticsDashboardService,
    private readonly metrics: MetricsService,
    private readonly dynamicScaling: DynamicRateLimitScalingService,
    private readonly premiumBonus: PremiumFeatureBonusService,
    private readonly rewardAnalytics: RewardAnalyticsService,
  ) {}

  /**
   * Gets current metrics snapshot
   */
  @Get('metrics')
  async getCurrentMetrics() {
    const metricsData = await this.metrics.getMetrics();
    return {
      timestamp: new Date(),
      metrics: metricsData,
    };
  }

  /**
   * Gets historical trends with time/granularity options
   */
  @Get('trends')
  async getHistoricalTrends(
    @Query('metric') metric: string,
    @Query('granularity') granularity: 'hour' | 'day' | 'week' = 'day',
    @Query('days') days = '30',
  ) {
    const parsedDays = Math.max(1, Math.min(365, Number(days) || 30));
    return this.analytics.getHistoricalTrends(metric || 'hits', granularity, parsedDays);
  }

  /**
   * Gets per-user analytics and insights
   */
  @Get('users')
  async getUserAnalytics(
    @Query('userId') userId?: string,
    @Query('segment') segment?: string,
    @Query('limit') limit = '100',
  ) {
    const parsedLimit = Math.max(1, Math.min(1000, Number(limit) || 100));
    return this.analytics.getUserAnalytics(userId, segment, parsedLimit);
  }

  /**
   * Gets predictive insights and recommendations
   */
  @Get('predictions')
  async getPredictiveInsights() {
    return this.analytics.getPredictiveInsights();
  }

  /**
   * Gets alerts history and configuration
   */
  @Get('alerts')
  async getAlerts(
    @Query('severity') severity?: 'low' | 'medium' | 'high' | 'critical',
    @Query('acknowledged') acknowledged?: string,
  ) {
    const ack =
      typeof acknowledged === 'string'
        ? acknowledged.toLowerCase() === 'true'
        : undefined;
    return this.analytics.getAlerts(severity, ack);
  }

  @Get('alerts/summary')
  async getAlertSummary() {
    return this.analytics.getAlertSummary();
  }

  @Get('alerts/rules')
  async getAlertRules() {
    return this.analytics.getAlertRules();
  }

  @Put('alerts/rules/:id')
  async upsertAlertRule(
    @Param('id') id: string,
    @Body() body: Partial<AlertRule>,
  ) {
    const current = this.analytics.getAlertRules().find((rule) => rule.id === id);

    const merged: AlertRule = {
      id,
      name: body.name || current?.name || id,
      enabled: body.enabled ?? current?.enabled ?? true,
      metric: body.metric || current?.metric || 'throughput',
      threshold: Number(body.threshold ?? current?.threshold ?? 100),
      windowMinutes: Number(body.windowMinutes ?? current?.windowMinutes ?? 5),
      severity: body.severity || current?.severity || 'medium',
      channels: body.channels || current?.channels || ['log'],
      escalationMinutes: Number(
        body.escalationMinutes ?? current?.escalationMinutes ?? 15,
      ),
    };

    return this.analytics.upsertAlertRule(merged);
  }

  /**
   * Acknowledges an alert
   */
  @Post('alerts/:id/acknowledge')
  @HttpCode(HttpStatus.OK)
  async acknowledgeAlert(@Param('id') alertId: string) {
    // Would get admin ID from JWT token
    const adminId = 'admin-user-id';
    await this.analytics.acknowledgeAlert(alertId, adminId);
    return { message: 'Alert acknowledged' };
  }

  /**
   * Gets rate limiting metrics
   */
  @Get('rate-limiting')
  async getRateLimitingMetrics(
    @Query('timeRange') timeRange: '1h' | '24h' | '7d' = '24h',
  ) {
    return this.analytics.getRateLimitingMetrics(timeRange);
  }

  /**
   * Gets user behavior analytics
   */
  @Get('user-behavior')
  async getUserBehaviorAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    return this.analytics.getUserBehaviorAnalytics(start, end);
  }

  /**
   * Gets dashboard configuration
   */
  @Get('config')
  async getDashboardConfig() {
    return {
      refreshInterval: 30000, // 30 seconds
      defaultTimeRange: '24h',
      alerts: {
        enabled: true,
        emailNotifications: true,
        slackNotifications: false,
      },
      widgets: [
        {
          id: 'rate_limiting_overview',
          title: 'Rate Limiting Overview',
          type: 'metrics',
          position: { x: 0, y: 0, w: 6, h: 4 },
        },
        {
          id: 'user_engagement',
          title: 'User Engagement',
          type: 'chart',
          position: { x: 6, y: 0, w: 6, h: 4 },
        },
        {
          id: 'alerts_panel',
          title: 'Active Alerts',
          type: 'alerts',
          position: { x: 0, y: 4, w: 12, h: 3 },
        },
      ],
    };
  }

  /**
   * Exports data for analysis
   */
  @Post('export')
  @HttpCode(HttpStatus.ACCEPTED)
  async exportData(
    @Query('type') type: 'metrics' | 'alerts' | 'users' = 'metrics',
    @Query('format') format: 'csv' | 'json' = 'json',
    @Query('timeRange') timeRange: '1h' | '24h' | '7d' = '24h',
  ) {
    const payload = await this.analytics.buildExport(type, format, timeRange);
    return {
      generatedAt: new Date(),
      type,
      format,
      payload,
    };
  }

  @Get('emergency-mode')
  async getEmergencyMode() {
    return this.analytics.getEmergencyMode();
  }

  @Post('emergency-mode')
  async setEmergencyMode(
    @Body()
    body: {
      enabled: boolean;
      limitMultiplier?: number;
      reason?: string;
    },
  ) {
    const adminId = 'admin-user-id';
    return this.analytics.setEmergencyMode(
      Boolean(body.enabled),
      Number(body.limitMultiplier ?? 1),
      body.reason || 'manual update',
      adminId,
    );
  }

  @Get('user-overrides')
  async getUserOverrides() {
    return this.analytics.listUserOverrides();
  }

  @Post('user-overrides/:userId')
  async setUserOverride(
    @Param('userId') userId: string,
    @Body()
    body: {
      limit: number;
      windowMs: number;
      burst?: number;
      reason?: string;
      expiresAt?: string;
    },
  ) {
    const adminId = 'admin-user-id';
    return this.analytics.setUserOverride({
      userId,
      limit: Number(body.limit),
      windowMs: Number(body.windowMs),
      burst: Number(body.burst ?? 0),
      reason: body.reason,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      adminId,
    });
  }

  @Delete('user-overrides/:userId')
  async deleteUserOverride(@Param('userId') userId: string) {
    return {
      removed: this.analytics.removeUserOverride(userId),
      userId,
    };
  }

  @Get('scaling/status')
  async getScalingStatus() {
    return this.dynamicScaling.getStatus();
  }

  @Get('scaling/decisions')
  async getScalingDecisions(@Query('limit') limit = '100') {
    const parsed = Math.max(1, Math.min(1000, Number(limit) || 100));
    return this.dynamicScaling.getDecisionLogs(parsed);
  }

  @Post('scaling/manual-override')
  async setScalingManualOverride(
    @Body()
    body: {
      enabled: boolean;
      multiplier?: number;
      reason?: string;
    },
  ) {
    const adminId = 'admin-user-id';
    return this.dynamicScaling.setManualOverride({
      enabled: Boolean(body.enabled),
      multiplier: Number(body.multiplier ?? 1),
      reason: body.reason || 'manual scaling control',
      adminId,
    });
  }

  @Get('premium-bonuses/policies')
  async getPremiumBonusPolicies() {
    return this.premiumBonus.listPolicies();
  }

  @Put('premium-bonuses/policies/:feature')
  async upsertPremiumBonusPolicy(
    @Param('feature') feature: string,
    @Body()
    body: {
      tierMultipliers?: Record<string, number>;
      maxBonusMultiplier?: number;
      allowStacking?: boolean;
      poolCapacity?: number;
      enabled?: boolean;
    },
  ) {
    return this.premiumBonus.upsertPolicy(
      {
        feature,
        tierMultipliers: body.tierMultipliers,
        maxBonusMultiplier: body.maxBonusMultiplier,
        allowStacking: body.allowStacking,
        poolCapacity: body.poolCapacity,
        enabled: body.enabled,
      },
      'admin-user-id',
    );
  }

  @Get('premium-bonuses/boosts')
  async getPremiumBonusBoosts(@Query('userId') userId?: string) {
    return this.premiumBonus.listActiveBoosts(userId);
  }

  @Post('premium-bonuses/boosts')
  async allocatePremiumBonusBoost(
    @Body()
    body: {
      userId: string;
      feature: string;
      bonusMultiplier?: number;
      extraLimit?: number;
      extraBurst?: number;
      durationMinutes: number;
      source?: 'admin' | 'referral' | 'campaign' | 'system';
      reason?: string;
    },
  ) {
    return this.premiumBonus.allocateBoost({
      userId: body.userId,
      feature: body.feature,
      bonusMultiplier: body.bonusMultiplier,
      extraLimit: body.extraLimit,
      extraBurst: body.extraBurst,
      durationMinutes: Number(body.durationMinutes),
      source: body.source,
      reason: body.reason,
      actor: 'admin-user-id',
    });
  }

  @Delete('premium-bonuses/boosts/:boostId')
  async revokePremiumBonusBoost(@Param('boostId') boostId: string) {
    return this.premiumBonus.revokeBoost(boostId, 'admin-user-id');
  }

  @Get('premium-bonuses/pools')
  async getPremiumBonusPools() {
    return this.premiumBonus.getPoolStatus();
  }

  @Post('premium-bonuses/pools/:feature/reset')
  async resetPremiumBonusPool(@Param('feature') feature: string) {
    return this.premiumBonus.resetPool(feature, 'admin-user-id');
  }

  @Get('premium-bonuses/usage')
  async getPremiumBonusUsage(@Query('limit') limit = '200') {
    const parsed = Math.max(1, Math.min(2000, Number(limit) || 200));
    return this.premiumBonus.getUsageSummary(parsed);
  }

  @Get('premium-bonuses/operations')
  async getPremiumBonusOperations(@Query('limit') limit = '100') {
    const parsed = Math.max(1, Math.min(2000, Number(limit) || 100));
    return this.premiumBonus.getOperationLogs(parsed);
  }

  @Get('premium-bonuses/emergency-mode')
  async getPremiumBonusEmergencyMode() {
    return this.premiumBonus.getEmergencyMode();
  }

  @Post('premium-bonuses/emergency-mode')
  async setPremiumBonusEmergencyMode(
    @Body() body: { enabled: boolean; multiplier?: number; reason?: string },
  ) {
    return this.premiumBonus.setEmergencyMode(
      Boolean(body.enabled),
      Number(body.multiplier ?? 1),
      body.reason || 'manual update',
      'admin-user-id',
    );
  }

  @Get('rewards/dashboard')
  async getRewardsDashboard(@Query('timeRange') timeRange: '1h' | '24h' | '7d' | '30d' = '24h') {
    return this.rewardAnalytics.getDashboardOverview(timeRange);
  }

  @Get('rewards/effectiveness')
  async getRewardEffectiveness(@Query('timeRange') timeRange: '1h' | '24h' | '7d' | '30d' = '24h') {
    return this.rewardAnalytics.getRewardEffectiveness(timeRange);
  }

  @Get('rewards/engagement')
  async getRewardEngagement(@Query('timeRange') timeRange: '1h' | '24h' | '7d' | '30d' = '24h') {
    return this.rewardAnalytics.getUserEngagementMetrics(timeRange);
  }

  @Get('rewards/campaigns')
  async getRewardCampaignPerformance(
    @Query('timeRange') timeRange: '1h' | '24h' | '7d' | '30d' = '7d',
  ) {
    return this.rewardAnalytics.getCampaignPerformance(timeRange);
  }

  @Get('rewards/predictive')
  async getRewardPredictive(@Query('timeRange') timeRange: '1h' | '24h' | '7d' | '30d' = '30d') {
    return this.rewardAnalytics.getPredictiveAnalytics(timeRange);
  }

  @Post('rewards/reports/generate')
  async generateRewardReport(
    @Body()
    body: {
      name: string;
      timeRange?: '1h' | '24h' | '7d' | '30d';
      includeSections?: Array<'effectiveness' | 'engagement' | 'campaigns' | 'operations' | 'predictive'>;
      anonymizeUsers?: boolean;
    },
  ) {
    return this.rewardAnalytics.generateReport({
      name: body.name || `reward-report-${Date.now()}`,
      timeRange: body.timeRange || '24h',
      includeSections: body.includeSections,
      anonymizeUsers: body.anonymizeUsers,
    });
  }

  @Get('rewards/reports/export/:reportId')
  async exportRewardReport(
    @Param('reportId') reportId: string,
    @Query('format') format: 'json' | 'csv' = 'json',
  ) {
    return this.rewardAnalytics.exportReport(reportId, format);
  }

  @Post('rewards/reports/schedules')
  async createRewardReportSchedule(
    @Body()
    body: {
      name: string;
      cron: string;
      format?: 'json' | 'csv';
      recipients?: string[];
      enabled?: boolean;
      request: {
        name: string;
        timeRange: '1h' | '24h' | '7d' | '30d';
        includeSections?: Array<'effectiveness' | 'engagement' | 'campaigns' | 'operations' | 'predictive'>;
        anonymizeUsers?: boolean;
      };
    },
  ) {
    return this.rewardAnalytics.scheduleReport({
      name: body.name,
      cron: body.cron,
      format: body.format || 'json',
      recipients: body.recipients || [],
      enabled: body.enabled ?? true,
      createdBy: 'admin-user-id',
      request: body.request,
    });
  }

  @Get('rewards/reports/schedules')
  async getRewardReportSchedules() {
    return this.rewardAnalytics.listSchedules();
  }

  @Delete('rewards/reports/schedules/:id')
  async deleteRewardReportSchedule(@Param('id') scheduleId: string) {
    return this.rewardAnalytics.deleteSchedule(scheduleId);
  }

  @Post('rewards/boosts/bulk-allocate')
  async bulkAllocateRewardBoosts(
    @Body()
    body: {
      items: Array<{
        userId: string;
        feature: string;
        campaignId?: string;
        bonusMultiplier?: number;
        extraLimit?: number;
        extraBurst?: number;
        durationMinutes: number;
        source?: 'admin' | 'referral' | 'campaign' | 'system';
        reason?: string;
      }>;
    },
  ) {
    return this.premiumBonus.bulkAllocateBoosts(body.items || [], 'admin-user-id');
  }

  @Post('rewards/boosts/bulk-revoke')
  async bulkRevokeRewardBoosts(@Body() body: { boostIds: string[] }) {
    return this.premiumBonus.bulkRevokeBoosts(body.boostIds || [], 'admin-user-id');
  }

  @Get('rewards/audit')
  async getRewardAuditTrail(@Query('limit') limit = '500') {
    const parsed = Math.max(1, Math.min(2000, Number(limit) || 500));
    return this.rewardAnalytics.getAuditTrail(parsed);
  }

  /**
   * Gets system health metrics
   */
  @Get('health')
  async getSystemHealth() {
    return {
      status: 'healthy',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      lastMetricsUpdate: new Date(),
      activeConnections: 0, // Would get from metrics
      errorRate: 0.02, // Would calculate from metrics
    };
  }
}