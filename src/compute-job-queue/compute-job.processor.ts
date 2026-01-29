import { Process, Processor, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ComputeJobData, JobResult, QueueService } from '../queue.service';

@Processor('compute-jobs')
export class ComputeJobProcessor {
  private readonly logger = new Logger(ComputeJobProcessor.name);
  private readonly MAX_RETRIES = 3;

  constructor(private readonly queueService: QueueService) {}

  @Process()
  async handleComputeJob(job: Job<ComputeJobData>): Promise<JobResult> {
    this.logger.log(
      `Processing job ${job.id} (type: ${job.data.type}, attempt: ${job.attemptsMade + 1}/${this.MAX_RETRIES})`,
    );

    try {
      // Route to appropriate handler based on job type
      const result = await this.processJobByType(job);

      this.logger.log(`Job ${job.id} completed successfully`);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(
        `Job ${job.id} failed: ${error.message}`,
        error.stack,
      );

      // Determine if we should retry or move to dead letter queue
      if (this.shouldRetry(job, error)) {
        this.logger.warn(
          `Job ${job.id} will be retried (attempt ${job.attemptsMade + 1}/${this.MAX_RETRIES})`,
        );
        throw error; // Let BullMQ handle the retry
      } else {
        // Move to dead letter queue
        await this.queueService.moveToDeadLetter(
          job,
          `Max retries exceeded: ${error.message}`,
        );
        
        return {
          success: false,
          error: error.message,
        };
      }
    }
  }

  /**
   * Process different job types
   */
  private async processJobByType(job: Job<ComputeJobData>): Promise<any> {
    const { type, payload } = job.data;

    switch (type) {
      case 'data-processing':
        return this.processDataJob(payload);
      
      case 'ai-computation':
        return this.processAIJob(payload);
      
      case 'report-generation':
        return this.processReportJob(payload);
      
      case 'email-notification':
        return this.processEmailJob(payload);
      
      case 'batch-operation':
        return this.processBatchJob(payload);
      
      default:
        throw new Error(`Unknown job type: ${type}`);
    }
  }

  /**
   * Example: Process data job
   */
  private async processDataJob(payload: any): Promise<any> {
    // Simulate data processing
    await this.simulateWork(1000);
    
    if (Math.random() < 0.1) { // 10% failure rate for testing
      throw new Error('Random data processing error');
    }

    return {
      processed: true,
      recordsProcessed: payload.records?.length || 0,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Example: Process AI computation job
   */
  private async processAIJob(payload: any): Promise<any> {
    // Simulate AI computation
    await this.simulateWork(2000);
    
    return {
      result: 'AI computation completed',
      modelUsed: payload.model || 'default',
      confidence: 0.95,
    };
  }

  /**
   * Example: Process report generation job
   */
  private async processReportJob(payload: any): Promise<any> {
    // Simulate report generation
    await this.simulateWork(1500);
    
    return {
      reportId: `report-${Date.now()}`,
      format: payload.format || 'pdf',
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Example: Process email notification job
   */
  private async processEmailJob(payload: any): Promise<any> {
    // Simulate email sending
    await this.simulateWork(500);
    
    if (!payload.to) {
      throw new Error('Email recipient is required');
    }

    return {
      sent: true,
      to: payload.to,
      messageId: `msg-${Date.now()}`,
    };
  }

  /**
   * Example: Process batch operation job
   */
  private async processBatchJob(payload: any): Promise<any> {
    // Simulate batch processing
    const items = payload.items || [];
    const results = [];

    for (const item of items) {
      await this.simulateWork(100);
      results.push({
        id: item.id,
        processed: true,
      });
    }

    return {
      total: items.length,
      processed: results.length,
      results,
    };
  }

  /**
   * Determine if a job should be retried based on error type
   */
  private shouldRetry(job: Job<ComputeJobData>, error: Error): boolean {
    // Don't retry if max attempts reached
    if (job.attemptsMade >= this.MAX_RETRIES - 1) {
      return false;
    }

    // Don't retry for validation errors
    const nonRetryableErrors = [
      'ValidationError',
      'AuthenticationError',
      'BadRequestError',
      'Email recipient is required',
    ];

    const isNonRetryable = nonRetryableErrors.some(
      (errType) =>
        error.name === errType || error.message.includes(errType),
    );

    if (isNonRetryable) {
      this.logger.warn(
        `Job ${job.id} has non-retryable error: ${error.message}`,
      );
      return false;
    }

    // Retry for network errors, timeouts, and temporary failures
    return true;
  }

  /**
   * Handle job completion
   */
  @OnQueueCompleted()
  async onCompleted(job: Job<ComputeJobData>, result: JobResult) {
    this.logger.log(
      `Job ${job.id} completed with result: ${JSON.stringify(result)}`,
    );

    // Log to monitoring/analytics
    await this.logJobMetrics(job, 'completed', result);
  }

  /**
   * Handle job failure
   */
  @OnQueueFailed()
  async onFailed(job: Job<ComputeJobData>, error: Error) {
    this.logger.error(
      `Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
      error.stack,
    );

    // Log to monitoring/analytics
    await this.logJobMetrics(job, 'failed', { error: error.message });

    // If this was the final attempt, it's already in dead letter queue
    if (job.attemptsMade >= this.MAX_RETRIES) {
      this.logger.warn(
        `Job ${job.id} exhausted all retries and is in dead letter queue`,
      );
    }
  }

  /**
   * Log job metrics for monitoring
   */
  private async logJobMetrics(
    job: Job<ComputeJobData>,
    status: string,
    result: any,
  ): Promise<void> {
    const metrics = {
      jobId: job.id,
      type: job.data.type,
      status,
      attempts: job.attemptsMade,
      processedAt: new Date().toISOString(),
      duration: job.finishedOn ? job.finishedOn - job.processedOn : null,
      result,
    };

    // In production, send to monitoring service (Datadog, CloudWatch, etc.)
    this.logger.debug(`Job metrics: ${JSON.stringify(metrics)}`);
  }

  /**
   * Simulate work for demonstration purposes
   */
  private async simulateWork(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}