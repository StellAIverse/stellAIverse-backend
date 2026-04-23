import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { RolesGuard } from '../common/guard/roles.guard';
import { Roles } from '../common/guard/roles.decorator';
import { UserRole } from '../user/entities/user.entity';
import { AnalyticsDashboardService } from './analytics-dashboard.service';
import { MetricsService } from './metrics.service';

@Controller('admin/analytics')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATOR)
export class AnalyticsDashboardController {
  constructor(
    private readonly analytics: AnalyticsDashboardService,
    private readonly metrics: MetricsService,
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
    @Query('days') days = 30,
  ) {
    return this.analytics.getHistoricalTrends(metric, granularity, days);
  }

  /**
   * Gets per-user analytics and insights
   */
  @Get('users')
  async getUserAnalytics(
    @Query('userId') userId?: string,
    @Query('segment') segment?: string,
    @Query('limit') limit = 100,
  ) {
    return this.analytics.getUserAnalytics(userId, segment, limit);
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
    @Query('acknowledged') acknowledged?: boolean,
  ) {
    const ack = acknowledged ? acknowledged === 'true' : undefined;
    return this.analytics.getAlerts(severity, ack);
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
  async exportData(@Query('type') type: string, @Query('format') format: 'csv' | 'json' = 'json') {
    // Implementation would queue export job
    return {
      message: 'Export job queued',
      jobId: `export_${Date.now()}`,
      estimatedTime: '5 minutes',
    };
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