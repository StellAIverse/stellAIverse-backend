import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job, JobsOptions } from 'bull';

export interface ComputeJobData {
  type: string;
  payload: any;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('compute-jobs')
    private readonly computeQueue: Queue<ComputeJobData>,
    @InjectQueue('dead-letter-queue')
    private readonly deadLetterQueue: Queue<ComputeJobData>,
  ) {}

  /**
   * Add a job to the compute queue
   */
  async addComputeJob(
    data: ComputeJobData,
    options?: JobsOptions,
  ): Promise<Job<ComputeJobData>> {
    try {
      const job = await this.computeQueue.add(data.type, data, {
        ...options,
        jobId: options?.jobId || this.generateJobId(data),
      });

      this.logger.log(`Job added: ${job.id} (type: ${data.type})`);
      return job;
    } catch (error) {
      this.logger.error(`Failed to add job: ${error.message}`, error.stack);
      throw error;
    }
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

    const state = await job.getState();
    return state;
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
        'dead-letter',
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
        {
          priority: 1,
        },
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

    return {
      compute: {
        waiting,
        active,
        completed,
        failed,
        delayed,
      },
      deadLetter: {
        count: deadLetterCount,
      },
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
  async getDeadLetterJobs(
    start = 0,
    end = 10,
  ): Promise<Job<ComputeJobData>[]> {
    return this.deadLetterQueue.getJobs(
      ['waiting', 'active', 'completed', 'failed'],
      start,
      end,
    );
  }

  /**
   * Clean old jobs
   */
  async cleanOldJobs(grace: number = 86400000): Promise<void> {
    // Clean completed jobs older than grace period (default 24 hours)
    await this.computeQueue.clean(grace, 'completed');
    this.logger.log(`Cleaned completed jobs older than ${grace}ms`);
  }

  /**
   * Pause queue
   */
  async pauseQueue(): Promise<void> {
    await this.computeQueue.pause();
    this.logger.log('Compute queue paused');
  }

  /**
   * Resume queue
   */
  async resumeQueue(): Promise<void> {
    await this.computeQueue.resume();
    this.logger.log('Compute queue resumed');
  }

  /**
   * Empty queue (remove all jobs)
   */
  async emptyQueue(): Promise<void> {
    await this.computeQueue.empty();
    this.logger.warn('Compute queue emptied');
  }

  /**
   * Generate a unique job ID
   */
  private generateJobId(data: ComputeJobData): string {
    const timestamp = Date.now();
    const userId = data.userId || 'anonymous';
    const type = data.type;
    return `${type}-${userId}-${timestamp}`;
  }
}