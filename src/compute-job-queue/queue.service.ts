import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue, Job, JobOptions } from "bull";
import { RetryPolicyService } from "./retry-policy.service";
import { BatchStrategy } from "./dto/batch-job.dto";
import { CacheConfigDto } from "../cache/dto/cache-config.dto";
import { queueLength } from "../config/metrics";

export interface ComputeJobData {
  type: string;
  payload: any;
  userId?: string;
  priority?: number;
  groupKey?: string;
  metadata?: Record<string, any>;
  cacheConfig?: CacheConfigDto;
  providerId?: string;
  parentJobIds?: string[];
  providerModel?: string;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface BatchJobData {
  batchId: string;
  config: {
    strategy: BatchStrategy;
    maxConcurrency?: number;
    continueOnError?: boolean;
    priority?: number;
    groupKey?: string;
    timeoutMs?: number;
  };
  jobs: ComputeJobData[];
  userId?: string;
  metadata?: Record<string, any>;
}

export interface BatchJobProgress {
  batchId: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  status: "running" | "completed" | "failed" | "cancelled";
  results: Array<{
    jobId: string;
    originalJobId?: string;
    status: "pending" | "active" | "completed" | "failed";
    result?: any;
    error?: string;
  }>;
  startedAt: Date;
  completedAt?: Date;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue("compute-jobs")
    private readonly computeQueue: Queue<ComputeJobData>,
    @InjectQueue("dead-letter-queue")
    private readonly deadLetterQueue: Queue<ComputeJobData>,
    private readonly retryPolicyService: RetryPolicyService,
  ) {}

  /**
   * Add a job to the compute queue
   */
  async addComputeJob(
    data: ComputeJobData,
    options?: JobOptions,
  ): Promise<Job<ComputeJobData>> {
    try {
      const retryPolicy = this.retryPolicyService.getPolicy(data.type);
      const normalizedData = this.normalizeJobData(data);

      // Apply dynamic priority calculation if not explicitly set
      const priority = this.calculateDynamicPriority(data, options?.priority);

      const job = await this.computeQueue.add(data.type, normalizedData, {
        attempts: options?.attempts ?? retryPolicy.maxAttempts,
        backoff: options?.backoff ?? retryPolicy.backoff,
        priority: priority,
        ...options,
        jobId: options?.jobId || this.generateJobId(normalizedData),
      });

      this.logger.log(
        `Job added: ${job.id} (type: ${data.type}, priority: ${priority})`,
      );
      return job;
    } catch (error) {
      this.logger.error(`Failed to add job: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Calculate dynamic priority based on various factors
   */
  private calculateDynamicPriority(
    data: ComputeJobData,
    explicitPriority?: number,
  ): number {
    if (explicitPriority !== undefined) {
      return explicitPriority;
    }

    // Base priority starts at 10 (higher number = lower priority)
    let priority = 10;

    // Adjust priority based on job type
    switch (data.type) {
      case "email-notification":
        priority = 8;
        break;
      case "data-processing":
        priority = 12;
        break;
      case "ai-computation":
        priority = 15;
        break;
      case "batch-operation":
        priority = 5;
        break;
      default:
        priority = 10;
    }

    // Adjust based on user role/priority (if available)
    if (data.userId) {
      if (data.userId.startsWith("premium-")) {
        priority = Math.max(1, priority - 3);
      }
    }

    // Adjust based on size of payload (larger payloads get lower priority)
    if (data.payload && typeof data.payload === "object") {
      const payloadSize = JSON.stringify(data.payload).length;
      if (payloadSize > 10000) {
        priority += 5;
      } else if (payloadSize > 5000) {
        priority += 2;
      }
    }

    // Ensure priority stays within acceptable bounds (1-100)
    return Math.max(1, Math.min(100, priority));
  }

  /**
   * Add a delayed job
   */
  async addDelayedJob(
    data: ComputeJobData,
    delayMs: number,
  ): Promise<Job<ComputeJobData>> {
    return this.addComputeJob(data, { delay: delayMs });
  }

  /**
   * Add a recurring job
   */
  async addRecurringJob(
    data: ComputeJobData,
    cronExpression: string,
  ): Promise<Job<ComputeJobData>> {
    return this.addComputeJob(data, {
      repeat: { cron: cronExpression },
      jobId: `recurring-${data.type}`,
    });
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<Job<ComputeJobData> | null> {
    return this.computeQueue.getJob(jobId);
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<string | null> {
    const job = await this.getJob(jobId);
    if (!job) return null;
    return job.getState();
  }

  /**
   * Remove job from queue
   */
  async removeJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (job) {
      await job.remove();
      this.logger.log(`Job removed: ${jobId}`);
    }
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    await job.retry();
    this.logger.log(`Job retried: ${jobId}`);
  }

  /**
   * Move job to dead letter queue
   */
  async moveToDeadLetter(
    job: Job<ComputeJobData>,
    reason: string,
  ): Promise<void> {
    try {
      await this.deadLetterQueue.add(
        "dead-letter",
        {
          ...job.data,
          metadata: {
            ...job.data.metadata,
            originalJobId: job.id,
            failureReason: reason,
            failedAt: new Date().toISOString(),
            attempts: job.attemptsMade,
          },
        },
        { priority: 1 },
      );

      this.logger.warn(
        `Job ${job.id} moved to dead letter queue. Reason: ${reason}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to move job ${job.id} to dead letter queue: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.computeQueue.getWaitingCount(),
      this.computeQueue.getActiveCount(),
      this.computeQueue.getCompletedCount(),
      this.computeQueue.getFailedCount(),
      this.computeQueue.getDelayedCount(),
    ]);

    const deadLetterCount = await this.deadLetterQueue.getWaitingCount();

    // Update queue length metrics
    queueLength.set({ queue_name: "compute", state: "waiting" }, waiting);
    queueLength.set({ queue_name: "compute", state: "active" }, active);
    queueLength.set({ queue_name: "compute", state: "completed" }, completed);
    queueLength.set({ queue_name: "compute", state: "failed" }, failed);
    queueLength.set({ queue_name: "compute", state: "delayed" }, delayed);
    queueLength.set({ queue_name: "dead_letter", state: "waiting" }, deadLetterCount);

    return {
      compute: { waiting, active, completed, failed, delayed },
      deadLetter: { count: deadLetterCount },
    };
  }

  /**
   * Get failed jobs
   */
  async getFailedJobs(start = 0, end = 10): Promise<Job<ComputeJobData>[]> {
    return this.computeQueue.getFailed(start, end);
  }

  /**
   * Get dead letter jobs
   */
  async getDeadLetterJobs(start = 0, end = 10): Promise<Job<ComputeJobData>[]> {
    return this.deadLetterQueue.getJobs(
      ["waiting", "active", "completed", "failed"],
      start,
      end,
    );
  }

  /**
   * Clean old jobs
   */
  async cleanOldJobs(grace: number = 86400000): Promise<void> {
    await this.computeQueue.clean(grace, "completed");
    this.logger.log(`Cleaned completed jobs older than ${grace}ms`);
  }

  /**
   * Pause queue
   */
  async pauseQueue(): Promise<void> {
    await this.computeQueue.pause();
    this.logger.log("Compute queue paused");
  }

  /**
   * Resume queue
   */
  async resumeQueue(): Promise<void> {
    await this.computeQueue.resume();
    this.logger.log("Compute queue resumed");
  }

  /**
   * Empty queue (remove all jobs)
   */
  async emptyQueue(): Promise<void> {
    await this.computeQueue.empty();
    this.logger.warn("Compute queue emptied");
  }

  /**
   * Add a batch of jobs with grouping and orchestration
   */
  async addBatchJob(batchJobData: BatchJobData): Promise<BatchJobProgress> {
    const { batchId, config, jobs, userId } = batchJobData;

    if (!jobs || jobs.length === 0) {
      throw new BadRequestException("Batch jobs cannot be empty");
    }

    const progress: BatchJobProgress = {
      batchId,
      totalJobs: jobs.length,
      completedJobs: 0,
      failedJobs: 0,
      status: "running",
      results: jobs.map((_, index) => ({
        jobId: `${batchId}-job-${index}`,
        status: "pending",
      })),
      startedAt: new Date(),
    };

    this.storeBatchProgress(progress);

    try {
      switch (config.strategy) {
        case "sequential":
          await this.processSequentially(batchId, jobs, config, userId);
          break;
        case "parallel":
          await this.processInParallel(batchId, jobs, config, userId);
          break;
        case "priority-based":
          await this.processByPriority(batchId, jobs, config, userId);
          break;
        default:
          await this.processInParallel(batchId, jobs, config, userId);
      }

      return progress;
    } catch (error) {
      this.logger.error(
        `Batch job ${batchId} failed: ${error.message}`,
        error.stack,
      );
      progress.status = "failed";
      this.updateBatchProgress(batchId, progress);
      throw error;
    }
  }

  private async processSequentially(
    batchId: string,
    jobs: ComputeJobData[],
    config: BatchJobData["config"],
    userId?: string,
  ): Promise<void> {
    for (let i = 0; i < jobs.length; i++) {
      const jobData = { ...jobs[i] };

      if (config.priority && jobData.priority === undefined) {
        jobData.priority = config.priority;
      }
      if (config.groupKey && !jobData.groupKey) {
        jobData.groupKey = config.groupKey;
      }

      try {
        const job = await this.addComputeJob(jobData);
        const result = await job.finished();

        const progress = this.getBatchProgress(batchId);
        if (progress) {
          const jobIndex = progress.results.findIndex((r) =>
            r.jobId.includes(`-job-${i}`),
          );
          if (jobIndex !== -1) {
            progress.results[jobIndex] = {
              ...progress.results[jobIndex],
              jobId: String(job.id), // FIX: JobId → string
              originalJobId: `${batchId}-job-${i}`,
              status: "completed",
              result,
            };
            progress.completedJobs++;
          }
          this.updateBatchProgress(batchId, progress);
        }
      } catch (error) {
        const progress = this.getBatchProgress(batchId);
        if (progress) {
          const jobIndex = progress.results.findIndex((r) =>
            r.jobId.includes(`-job-${i}`),
          );
          if (jobIndex !== -1) {
            progress.results[jobIndex] = {
              ...progress.results[jobIndex],
              jobId: `${batchId}-job-${i}`,
              status: "failed",
              error: error.message,
            };
            progress.failedJobs++;

            if (!config.continueOnError) {
              progress.status = "failed";
              this.updateBatchProgress(batchId, progress);
              throw error;
            }
          }
          this.updateBatchProgress(batchId, progress);
        }
      }
    }

    const progress = this.getBatchProgress(batchId);
    if (progress) {
      progress.status = "completed";
      progress.completedAt = new Date();
      this.updateBatchProgress(batchId, progress);
    }
  }

  private async processInParallel(
    batchId: string,
    jobs: ComputeJobData[],
    config: BatchJobData["config"],
    userId?: string,
  ): Promise<void> {
    const concurrency = config.maxConcurrency || 5;
    const progress = this.getBatchProgress(batchId);

    for (let i = 0; i < jobs.length; i += concurrency) {
      const chunk = jobs.slice(i, i + concurrency);
      const promises = chunk.map(async (jobData, chunkIndex) => {
        const actualIndex = i + chunkIndex;
        const modifiedJobData = { ...jobData };

        if (config.priority && modifiedJobData.priority === undefined) {
          modifiedJobData.priority = config.priority;
        }
        if (config.groupKey && !modifiedJobData.groupKey) {
          modifiedJobData.groupKey = config.groupKey;
        }

        try {
          const job = await this.addComputeJob(modifiedJobData);
          const result = await job.finished();

          if (progress) {
            const jobIndex = progress.results.findIndex((r) =>
              r.jobId.includes(`-job-${actualIndex}`),
            );
            if (jobIndex !== -1) {
              progress.results[jobIndex] = {
                ...progress.results[jobIndex],
                jobId: String(job.id), // FIX: JobId → string
                originalJobId: `${batchId}-job-${actualIndex}`,
                status: "completed",
                result,
              };
              progress.completedJobs++;
            }
            this.updateBatchProgress(batchId, progress);
          }
        } catch (error) {
          if (progress) {
            const jobIndex = progress.results.findIndex((r) =>
              r.jobId.includes(`-job-${actualIndex}`),
            );
            if (jobIndex !== -1) {
              progress.results[jobIndex] = {
                ...progress.results[jobIndex],
                jobId: `${batchId}-job-${actualIndex}`,
                status: "failed",
                error: error.message,
              };
              progress.failedJobs++;

              if (!config.continueOnError) {
                progress.status = "failed";
                this.updateBatchProgress(batchId, progress);
                throw error;
              }
            }
            this.updateBatchProgress(batchId, progress);
          }
        }
      });

      await Promise.all(promises);
    }

    if (progress) {
      progress.status = "completed";
      progress.completedAt = new Date();
      this.updateBatchProgress(batchId, progress);
    }
  }

  private async processByPriority(
    batchId: string,
    jobs: ComputeJobData[],
    config: BatchJobData["config"],
    userId?: string,
  ): Promise<void> {
    // Sort jobs by priority (lower number = higher priority)
    const sortedJobs = [...jobs].sort((a, b) => {
      const priorityA = a.priority ?? 10;
      const priorityB = b.priority ?? 10;
      return priorityA - priorityB;
    });

    for (const jobData of sortedJobs) {
      const modifiedJobData = { ...jobData };

      if (config.priority && modifiedJobData.priority === undefined) {
        modifiedJobData.priority = config.priority;
      }
      if (config.groupKey && !modifiedJobData.groupKey) {
        modifiedJobData.groupKey = config.groupKey;
      }

      try {
        const job = await this.addComputeJob(modifiedJobData);
        const result = await job.finished();

        const originalIndex = jobs.indexOf(jobData);
        const progress = this.getBatchProgress(batchId);
        if (progress && originalIndex !== -1) {
          const jobIndex = progress.results.findIndex((r) =>
            r.jobId.includes(`-job-${originalIndex}`),
          );
          if (jobIndex !== -1) {
            progress.results[jobIndex] = {
              ...progress.results[jobIndex],
              jobId: String(job.id), // FIX: JobId → string
              originalJobId: `${batchId}-job-${originalIndex}`,
              status: "completed",
              result,
            };
            progress.completedJobs++;
          }
          this.updateBatchProgress(batchId, progress);
        }
      } catch (error) {
        const originalIndex = jobs.indexOf(jobData);
        const progress = this.getBatchProgress(batchId);
        if (progress && originalIndex !== -1) {
          const jobIndex = progress.results.findIndex((r) =>
            r.jobId.includes(`-job-${originalIndex}`),
          );
          if (jobIndex !== -1) {
            progress.results[jobIndex] = {
              ...progress.results[jobIndex],
              jobId: `${batchId}-job-${originalIndex}`,
              status: "failed",
              error: error.message,
            };
            progress.failedJobs++;

            if (!config.continueOnError) {
              progress.status = "failed";
              this.updateBatchProgress(batchId, progress);
              throw error;
            }
          }
          this.updateBatchProgress(batchId, progress);
        }
      }
    }

    const progress = this.getBatchProgress(batchId);
    if (progress) {
      progress.status = "completed";
      progress.completedAt = new Date();
      this.updateBatchProgress(batchId, progress);
    }
  }

  // In-memory storage for batch progress (in production, use Redis or DB)
  private batchProgressStore = new Map<string, BatchJobProgress>();

  private storeBatchProgress(progress: BatchJobProgress): void {
    this.batchProgressStore.set(progress.batchId, progress);
  }

  private getBatchProgress(batchId: string): BatchJobProgress | undefined {
    return this.batchProgressStore.get(batchId);
  }

  private updateBatchProgress(
    batchId: string,
    progress: BatchJobProgress,
  ): void {
    this.batchProgressStore.set(batchId, progress);
  }

  /**
   * Get batch job progress
   */
  getBatchJobProgress(batchId: string): BatchJobProgress | null {
    return this.batchProgressStore.get(batchId) || null;
  }

  /**
   * Cancel a batch job
   */
  async cancelBatchJob(batchId: string): Promise<void> {
    const progress = this.batchProgressStore.get(batchId);
    if (!progress) {
      throw new Error(`Batch job ${batchId} not found`);
    }
    progress.status = "cancelled";
    progress.completedAt = new Date();
    this.batchProgressStore.set(batchId, progress);
  }

  /**
   * Check if Redis connection is healthy
   */
  async isRedisHealthy(): Promise<boolean> {
    try {
      const client = this.computeQueue.client;
      if (!client) return false;
      await client.ping();
      return true;
    } catch (error) {
      this.logger.error("Redis health check failed", error.message);
      return false;
    }
  }

  /**
   * Generate a unique job ID
   */
  private generateJobId(data: ComputeJobData): string {
    const timestamp = Date.now();
    const userId = data.userId || "anonymous";
    const type = data.type;
    const groupKeySegment = data.groupKey ? `${data.groupKey}-` : "";
    return `${groupKeySegment}${type}-${userId}-${timestamp}`;
  }

  private normalizeJobData(data: ComputeJobData): ComputeJobData {
    const normalized = {
      ...data,
      metadata: {
        ...data.metadata,
        groupKey: data.groupKey,
        parentJobIds: data.parentJobIds,
      },
    };

    // Remove undefined fields to keep metadata clean
    if (!data.groupKey) {
      delete normalized.metadata!.groupKey;
    }
    if (!data.parentJobIds || data.parentJobIds.length === 0) {
      delete normalized.metadata!.parentJobIds;
    }

    return normalized;
  }
}
