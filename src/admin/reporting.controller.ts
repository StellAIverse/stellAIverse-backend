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
import { ReportingService, ReportConfig } from './reporting.service';

@Controller('admin/reports')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATOR)
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  /**
   * Generates a report on-demand
   */
  @Post('generate')
  async generateReport(@Body() config: ReportConfig) {
    return this.reporting.generateReport(config);
  }

  /**
   * Schedules a report for automatic generation
   */
  @Post('schedule')
  async scheduleReport(@Body() config: ReportConfig) {
    const reportId = this.reporting.scheduleReport(config);
    return { reportId, message: 'Report scheduled successfully' };
  }

  /**
   * Gets all scheduled reports
   */
  @Get('scheduled')
  async getScheduledReports() {
    return this.reporting.getScheduledReports();
  }

  /**
   * Updates a scheduled report
   */
  @Put('scheduled/:id')
  async updateScheduledReport(
    @Param('id') reportId: string,
    @Body() updates: Partial<ReportConfig>,
  ) {
    // Implementation for updating scheduled report
    return { message: `Scheduled report ${reportId} updated` };
  }

  /**
   * Cancels a scheduled report
   */
  @Delete('scheduled/:id')
  async cancelScheduledReport(@Param('id') reportId: string) {
    const cancelled = this.reporting.cancelScheduledReport(reportId);
    if (cancelled) {
      return { message: `Scheduled report ${reportId} cancelled` };
    }
    return { message: `Scheduled report ${reportId} not found`, status: 404 };
  }

  /**
   * Gets report templates
   */
  @Get('templates')
  async getReportTemplates() {
    return {
      templates: [
        {
          id: 'reward_analytics_weekly',
          name: 'Weekly Reward Analytics',
          type: 'reward_analytics',
          schedule: 'weekly',
          format: 'pdf',
          description: 'Comprehensive weekly reward program analytics',
        },
        {
          id: 'user_engagement_daily',
          name: 'Daily User Engagement',
          type: 'user_engagement',
          schedule: 'daily',
          format: 'excel',
          description: 'Daily user engagement and activity metrics',
        },
        {
          id: 'campaign_performance_monthly',
          name: 'Monthly Campaign Performance',
          type: 'campaign_performance',
          schedule: 'monthly',
          format: 'pdf',
          description: 'Monthly analysis of campaign effectiveness',
        },
      ],
    };
  }

  /**
   * Creates a custom report template
   */
  @Post('templates')
  @Roles(UserRole.ADMIN)
  async createReportTemplate(@Body() template: {
    name: string;
    type: string;
    schedule?: string;
    format: string;
    description: string;
    defaultFilters?: any;
  }) {
    // Implementation for saving custom templates
    return { message: 'Report template created', template };
  }

  /**
   * Gets report history
   */
  @Get('history')
  async getReportHistory(
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
  ) {
    // Implementation for report history
    return {
      reports: [],
      total: 0,
      limit,
      offset,
    };
  }

  /**
   * Downloads a generated report
   */
  @Get('download/:reportId')
  async downloadReport(@Param('reportId') reportId: string) {
    // Implementation for downloading report files
    return { message: `Download link for report ${reportId}` };
  }

  /**
   * Gets reporting system statistics
   */
  @Get('stats')
  async getReportingStats() {
    const scheduledReports = this.reporting.getScheduledReports();

    return {
      totalScheduledReports: scheduledReports.length,
      activeScheduledReports: scheduledReports.filter(r => r.isActive).length,
      reportsGeneratedToday: 0, // Would track actual generations
      averageGenerationTime: 0, // Would calculate from history
      storageUsed: 0, // Would calculate report file sizes
    };
  }

  /**
   * Tests a report configuration
   */
  @Post('test')
  async testReportConfig(@Body() config: ReportConfig) {
    try {
      // Generate a small sample
      const result = await this.reporting.generateReport({
        ...config,
        filters: { ...config.filters, limit: 10 }, // Limit for testing
      });

      return {
        success: true,
        sampleData: result.data,
        metadata: result.metadata,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}