import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RewardAnalyticsService } from './reward-analytics.service';
import * as ExcelJS from 'exceljs';
import * as PDFDocument from 'pdfkit';
import { createWriteStream } from 'fs';
import { join } from 'path';

export interface ReportConfig {
  id: string;
  name: string;
  type: 'reward_analytics' | 'user_engagement' | 'campaign_performance' | 'custom';
  schedule?: 'daily' | 'weekly' | 'monthly';
  format: 'json' | 'csv' | 'excel' | 'pdf';
  recipients: string[];
  filters?: Record<string, any>;
  customQuery?: string;
}

export interface ScheduledReport {
  id: string;
  config: ReportConfig;
  nextRun: Date;
  lastRun?: Date;
  isActive: boolean;
}

@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name);
  private scheduledReports: Map<string, ScheduledReport> = new Map();

  constructor(
    @InjectRepository(RewardCalculation)
    private readonly calculationRepository: Repository<RewardCalculation>,
    private readonly analytics: RewardAnalyticsService,
  ) {}

  /**
   * Generates a report based on configuration
   */
  async generateReport(config: ReportConfig): Promise<{
    data: any;
    filePath?: string;
    metadata: {
      generatedAt: Date;
      recordCount: number;
      executionTime: number;
    };
  }> {
    const startTime = Date.now();

    try {
      let data: any;

      switch (config.type) {
        case 'reward_analytics':
          data = await this.analytics.getRewardAnalytics(
            config.filters?.startDate,
            config.filters?.endDate,
          );
          break;

        case 'user_engagement':
          data = await this.analytics.getUserEngagementMetrics(
            config.filters?.startDate,
            config.filters?.endDate,
          );
          break;

        case 'campaign_performance':
          data = await this.analytics.getCampaignPerformance(
            config.filters?.campaignId,
            config.filters?.startDate,
            config.filters?.endDate,
          );
          break;

        case 'custom':
          data = await this.executeCustomQuery(config.customQuery, config.filters);
          break;

        default:
          throw new Error(`Unknown report type: ${config.type}`);
      }

      const executionTime = Date.now() - startTime;
      const recordCount = this.countRecords(data);

      let filePath: string | undefined;

      if (config.format !== 'json') {
        filePath = await this.exportReport(data, config);
      }

      return {
        data,
        filePath,
        metadata: {
          generatedAt: new Date(),
          recordCount,
          executionTime,
        },
      };

    } catch (error) {
      this.logger.error(`Error generating report ${config.id}:`, error);
      throw error;
    }
  }

  /**
   * Schedules a report for automatic generation
   */
  scheduleReport(config: ReportConfig): string {
    const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const scheduledReport: ScheduledReport = {
      id: reportId,
      config,
      nextRun: this.calculateNextRun(config.schedule),
      isActive: true,
    };

    this.scheduledReports.set(reportId, scheduledReport);

    this.logger.log(`Scheduled report: ${config.name} (${reportId})`);

    return reportId;
  }

  /**
   * Processes scheduled reports
   */
  async processScheduledReports(): Promise<void> {
    const now = new Date();

    for (const [reportId, report] of this.scheduledReports) {
      if (!report.isActive || report.nextRun > now) {
        continue;
      }

      try {
        this.logger.log(`Generating scheduled report: ${report.config.name}`);

        const result = await this.generateReport(report.config);
        await this.distributeReport(report.config, result);

        // Update next run
        report.lastRun = now;
        report.nextRun = this.calculateNextRun(report.config.schedule);
        this.scheduledReports.set(reportId, report);

      } catch (error) {
        this.logger.error(`Error processing scheduled report ${reportId}:`, error);
      }
    }
  }

  /**
   * Gets all scheduled reports
   */
  getScheduledReports(): ScheduledReport[] {
    return Array.from(this.scheduledReports.values());
  }

  /**
   * Cancels a scheduled report
   */
  cancelScheduledReport(reportId: string): boolean {
    const report = this.scheduledReports.get(reportId);
    if (report) {
      report.isActive = false;
      this.scheduledReports.set(reportId, report);
      return true;
    }
    return false;
  }

  /**
   * Exports report data to file
   */
  private async exportReport(data: any, config: ReportConfig): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${config.name}_${timestamp}`;

    switch (config.format) {
      case 'csv':
        return this.exportToCSV(data, fileName);

      case 'excel':
        return this.exportToExcel(data, fileName);

      case 'pdf':
        return this.exportToPDF(data, fileName);

      default:
        throw new Error(`Unsupported export format: ${config.format}`);
    }
  }

  /**
   * Exports data to CSV
   */
  private async exportToCSV(data: any, fileName: string): Promise<string> {
    // Implementation for CSV export
    const filePath = join(process.cwd(), 'reports', `${fileName}.csv`);
    // Write CSV logic here
    return filePath;
  }

  /**
   * Exports data to Excel
   */
  private async exportToExcel(data: any, fileName: string): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    // Add data to worksheet
    if (Array.isArray(data)) {
      // Handle array data
      if (data.length > 0) {
        worksheet.columns = Object.keys(data[0]).map(key => ({ header: key, key }));
        worksheet.addRows(data);
      }
    } else {
      // Handle object data
      worksheet.columns = [
        { header: 'Metric', key: 'metric' },
        { header: 'Value', key: 'value' },
      ];

      const rows = Object.entries(data).map(([key, value]) => ({
        metric: key,
        value: typeof value === 'object' ? JSON.stringify(value) : value,
      }));

      worksheet.addRows(rows);
    }

    const filePath = join(process.cwd(), 'reports', `${fileName}.xlsx`);
    await workbook.xlsx.writeFile(filePath);

    return filePath;
  }

  /**
   * Exports data to PDF
   */
  private async exportToPDF(data: any, fileName: string): Promise<string> {
    const doc = new PDFDocument();
    const filePath = join(process.cwd(), 'reports', `${fileName}.pdf`);

    doc.pipe(createWriteStream(filePath));

    doc.fontSize(20).text('Report: ' + fileName, { align: 'center' });
    doc.moveDown();

    if (Array.isArray(data)) {
      data.forEach((item, index) => {
        doc.fontSize(12).text(`Item ${index + 1}:`, { underline: true });
        doc.fontSize(10).text(JSON.stringify(item, null, 2));
        doc.moveDown();
      });
    } else {
      doc.fontSize(12).text(JSON.stringify(data, null, 2));
    }

    doc.end();

    return new Promise((resolve) => {
      doc.on('finish', () => resolve(filePath));
    });
  }

  /**
   * Distributes report to recipients
   */
  private async distributeReport(config: ReportConfig, result: any): Promise<void> {
    // Implementation for email/Slack distribution
    this.logger.log(`Distributing report ${config.name} to ${config.recipients.length} recipients`);
  }

  /**
   * Executes custom query for reports
   */
  private async executeCustomQuery(query: string, filters: any): Promise<any> {
    // Implementation for custom query execution
    // This would be a secure way to execute predefined queries
    return { message: 'Custom query execution - to be implemented' };
  }

  /**
   * Calculates next run time for scheduled reports
   */
  private calculateNextRun(schedule?: string): Date {
    const now = new Date();

    switch (schedule) {
      case 'daily':
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0); // 9 AM tomorrow
        return tomorrow;

      case 'weekly':
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + (7 - now.getDay())); // Next Sunday
        nextWeek.setHours(9, 0, 0, 0);
        return nextWeek;

      case 'monthly':
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        nextMonth.setHours(9, 0, 0, 0);
        return nextMonth;

      default:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000); // Default to tomorrow
    }
  }

  /**
   * Counts records in report data
   */
  private countRecords(data: any): number {
    if (Array.isArray(data)) {
      return data.length;
    }
    if (typeof data === 'object') {
      return Object.keys(data).length;
    }
    return 1;
  }
}