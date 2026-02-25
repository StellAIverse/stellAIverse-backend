import {
  Process,
  Processor,
  OnQueueFailed,
  OnQueueCompleted,
} from "@nestjs/bull";
import { Logger, Inject, Optional } from "@nestjs/common";
import { Job } from "bull";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ComputeJobData, JobResult, QueueService } from "./queue.service";
import { CacheJobPlugin } from "../cache/plugins/cache-job.plugin";
import { RetryPolicyService } from "./retry-policy.service";
import { JobProvenanceService } from "./services/job-provenance.service";
import {
  jobDuration,
  jobSuccessTotal,
  jobFailureTotal,
} from "../config/metrics";

@Processor("compute-jobs")
export class ComputeJobProcessor {
  private readonly logger = new Logger(ComputeJobProcessor.name);

  constructor(
    private readonly queueService: QueueService,
    private readonly retryPolicyService: RetryPolicyService,
    @Optional() private readonly cacheJobPlugin?: CacheJobPlugin,
    @Optional() private readonly eventEmitter?: EventEmitter2,
    @Optional() private readonly provenanceService?: JobProvenanceService,
  ) {}

  @Process()
  async handleComputeJob(job: Job<ComputeJobData>): Promise<JobResult> {
    const startTime = Date.now();
    const maxAttempts = this.retryPolicyService.getPolicy(
      job.data.type,
    ).maxAttempts;
    this.logger.log(
      `Processing job ${job.id} (type: ${job.data.type}, attempt: ${job.attemptsMade + 1}/${maxAttempts})`,
    );

    // Create provenance record at job start
    if (this.provenanceService) {
      try {
        await this.provenanceService.createProvenance(
          String(job.id),
          job.data,
          job.data.providerId || 'default-provider',
          job.data.providerModel,
        );
      } catch (error) {
        this.logger.warn(`Failed to create provenance record: ${error.message}`);
      }
    }

    try {
      // Check cache before execution
      if (this.cacheJobPlugin) {
        const cachedResult = await this.cacheJobPlugin.checkCache(job);

        // If cache-only mode and no cache hit, return error
        if (this.cacheJobPlugin.shouldCacheOnly(job) && !cachedResult) {
          this.logger.warn(
            `Cache-only mode for job ${job.id} but no cache hit`,
          );
          return {
            success: false,
            error: "Cache-only mode but no cached result available",
          };
        }

        // If cache hit, return cached result
        if (cachedResult) {
          this.logger.log(`Using cached result for job ${job.id}`);
          this.eventEmitter?.emit("compute.job.cache.hit", {
            jobId: job.id,
            jobType: job.data.type,
          });

          // Mark provenance as completed even for cached results
          if (this.provenanceService) {
            await this.provenanceService.markJobCompleted(String(job.id), cachedResult.result);
          }

          // Record metrics for cached result
          const duration = (Date.now() - startTime) / 1000;
          jobDuration.observe({ job_type: job.data.type, status: "cached" }, duration);
          jobSuccessTotal.inc({ job_type: job.data.type });

          return {
            success: true,
            data: cachedResult.result,
          };
        }
      }

      // Route to appropriate handler based on job type
      const result = await this.processJobByType(job);

      // Store result in cache
      if (this.cacheJobPlugin && job.data.cacheConfig?.enabled !== false) {
        await this.cacheJobPlugin.storeResult(job, result);
      }

      // Mark provenance as completed
      if (this.provenanceService) {
        await this.provenanceService.markJobCompleted(String(job.id), result);
      }

      this.logger.log(`Job ${job.id} completed successfully`);

      // Emit job completion event for dependency invalidation
      this.eventEmitter?.emit("compute.job.completed", {
        jobId: job.id,
        jobType: job.data.type,
        result,
      });

      // Notify DAG orchestrator if this job belongs to a workflow
      const dagCtx = job.data.metadata?.dagContext;
      if (dagCtx?.workflowId && dagCtx?.nodeId) {
        this.eventEmitter?.emit("dag.job.completed", {
          workflowId: dagCtx.workflowId,
          nodeId: dagCtx.nodeId,
          result,
        });
      }

      // Record success metrics
      const duration = (Date.now() - startTime) / 1000;
      jobDuration.observe({ job_type: job.data.type, status: "success" }, duration);
      jobSuccessTotal.inc({ job_type: job.data.type });

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);

      // Record failure metrics
      const duration = (Date.now() - startTime) / 1000;
      jobDuration.observe({ job_type: job.data.type, status: "failed" }, duration);
      jobFailureTotal.inc({ 
        job_type: job.data.type, 
        failure_reason: this.categorizeError(error) 
      });

      // Determine if we should retry or move to dead letter queue
      if (this.shouldRetry(job, error)) {
        const retryMaxAttempts = this.retryPolicyService.getPolicy(
          job.data.type,
        ).maxAttempts;
        this.logger.warn(
          `Job ${job.id} will be retried (attempt ${job.attemptsMade + 1}/${retryMaxAttempts})`,
        );
        throw error; // Let BullMQ handle the retry
      } else {
        // Move to dead letter queue
        await this.queueService.moveToDeadLetter(
          job,
          `Max retries exceeded: ${error.message}`,
        );

        // Emit job failure event
        this.eventEmitter?.emit("compute.job.failed", {
          jobId: job.id,
          jobType: job.data.type,
          error: error.message,
        });

        // Notify DAG orchestrator if this job belongs to a workflow
        const dagCtx = job.data.metadata?.dagContext;
        if (dagCtx?.workflowId && dagCtx?.nodeId) {
          this.eventEmitter?.emit("dag.job.failed", {
            workflowId: dagCtx.workflowId,
            nodeId: dagCtx.nodeId,
            error: error.message,
          });
        }

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
      case "data-processing":
        return this.processDataJob(payload);

      case "ai-computation":
        return this.processAIJob(payload);

      case "report-generation":
        return this.processReportJob(payload);

      case "email-notification":
        return this.processEmailJob(payload);

      case "batch-operation":
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

    if (Math.random() < 0.1) {
      // 10% failure rate for testing
      throw new Error("Random data processing error");
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
      result: "AI computation completed",
      modelUsed: payload.model || "default",
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
      format: payload.format || "pdf",
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
      throw new Error("Email recipient is required");
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
    const maxAttempts = this.retryPolicyService.getPolicy(
      job.data.type,
    ).maxAttempts;

    // Don't retry if max attempts reached
    if (job.attemptsMade >= maxAttempts - 1) {
      return false;
    }

    // Don't retry for validation errors
    const nonRetryableErrors = [
      "ValidationError",
      "AuthenticationError",
      "BadRequestError",
      "Email recipient is required",
    ];

    const isNonRetryable = nonRetryableErrors.some(
      (errType) => error.name === errType || error.message.includes(errType),
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
    await this.logJobMetrics(job, "completed", result);

    // Emit cache-related metrics
    this.eventEmitter?.emit("compute.job.completed.metrics", {
      jobId: job.id,
      jobType: job.data.type,
      duration: job.finishedOn ? job.finishedOn - job.processedOn : null,
    });
  }

  /**
   * Handle job failure
   */
  @OnQueueFailed()
  async onFailed(job: Job<ComputeJobData>, error: Error) {
    const maxAttempts = this.retryPolicyService.getPolicy(
      job.data.type,
    ).maxAttempts;
    this.logger.error(
      `Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
      error.stack,
    );

    // Log to monitoring/analytics
    await this.logJobMetrics(job, "failed", { error: error.message });

    // If this was the final attempt, it's already in dead letter queue
    if (job.attemptsMade >= maxAttempts) {
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
   * Categorize error for metrics labeling
   */
  private categorizeError(error: Error): string {
    if (error.message.includes("timeout") || error.message.includes("ETIMEDOUT")) {
      return "timeout";
    }
    if (error.message.includes("network") || error.message.includes("ECONNREFUSED")) {
      return "network";
    }
    if (error.message.includes("validation") || error.message.includes("required")) {
      return "validation";
    }
    if (error.message.includes("authentication") || error.message.includes("unauthorized")) {
      return "authentication";
    }
    return "unknown";
  }

  /**
   * Simulate work for demonstration purposes
   */
  private async simulateWork(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
