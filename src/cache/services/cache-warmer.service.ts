import { Injectable, Logger } from "@nestjs/common";
import { CacheService } from "../cache.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { CacheConfigDto } from "../dto/cache-config.dto";

export interface CacheWarmingJob {
  jobType: string;
  payload?: any;
  jobId?: string;
  providerId?: string;
  config?: CacheConfigDto;
}

export interface CacheWarmingRequest {
  jobs: CacheWarmingJob[];
  priority?: "high" | "normal" | "low";
}

export interface CacheWarmingResult {
  totalJobs: number;
  successCount: number;
  failureCount: number;
  cacheKeys: string[];
  errors: string[];
  totalBytesAdded: number;
  duration: number;
}

@Injectable()
export class CacheWarmerService {
  private readonly logger = new Logger(CacheWarmerService.name);
  private warmingInProgress = new Map<string, boolean>();

  constructor(
    private readonly cacheService: CacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Warm cache with a batch of jobs
   */
  async warmCache(request: CacheWarmingRequest): Promise<CacheWarmingResult> {
    const startTime = Date.now();
    const warmingId = `warming-${Date.now()}`;

    if (this.warmingInProgress.has(warmingId)) {
      throw new Error("Cache warming already in progress for this batch");
    }

    this.warmingInProgress.set(warmingId, true);

    try {
      this.logger.log(
        `Starting cache warming with ${request.jobs.length} jobs (priority: ${request.priority || "normal"})`,
      );

      const cacheKeys: string[] = [];
      let successCount = 0;
      let failureCount = 0;

      // Process jobs based on priority
      const sortedJobs = this.sortJobsByPriority(
        request.jobs,
        request.priority || "normal",
      );

      for (const job of sortedJobs) {
        try {
          const result = await this.cacheService.set(
            job.jobType,
            job.payload,
            { warmingJob: true }, // Placeholder result
            job.jobId,
            job.providerId,
            job.config,
          );

          if (result.cached) {
            cacheKeys.push(result.cacheKey);
            successCount++;
          } else {
            failureCount++;
          }
        } catch (error) {
          this.logger.error(
            `Failed to warm cache for job ${job.jobId}: ${error.message}`,
          );
          failureCount++;
        }
      }

      const duration = Date.now() - startTime;

      this.logger.log(
        `Cache warming completed: ${successCount}/${request.jobs.length} successful (${duration}ms)`,
      );

      // Emit event
      this.eventEmitter.emit("cache.warming.completed", {
        warmingId,
        totalJobs: request.jobs.length,
        successCount,
        failureCount,
        cacheKeys,
        duration,
      });

      return {
        totalJobs: request.jobs.length,
        successCount,
        failureCount,
        cacheKeys,
        errors: [],
        totalBytesAdded: 0,
        duration,
      };
    } finally {
      this.warmingInProgress.delete(warmingId);
    }
  }

  /**
   * Warm cache for a single job
   */
  async warmSingleJob(job: CacheWarmingJob): Promise<boolean> {
    try {
      const result = await this.cacheService.set(
        job.jobType,
        job.payload,
        { warmingJob: true },
        job.jobId,
        job.providerId,
        job.config,
      );

      return result.cached;
    } catch (error) {
      this.logger.error(
        `Failed to warm cache for single job: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Get status of warming operations
   */
  getWarmingStatus(): {
    activeWarmings: number;
    inProgress: string[];
  } {
    return {
      activeWarmings: this.warmingInProgress.size,
      inProgress: Array.from(this.warmingInProgress.keys()),
    };
  }

  /**
   * Sort jobs by priority for execution order
   */
  private sortJobsByPriority(
    jobs: CacheWarmingJob[],
    priority: string,
  ): CacheWarmingJob[] {
    // For now, just return jobs as-is
    // Can be extended with custom sorting logic
    return jobs;
  }

  /**
   * Check if cache warming is possible for job type
   */
  canWarmCache(jobType: string): boolean {
    // Can be extended with job type specific rules
    return true;
  }

  /**
   * Get recommended cache warming strategy for job type
   */
  async getWarmingStrategy(
    jobType: string,
  ): Promise<{ ttl: number; batchSize: number; priority: string }> {
    // This can be configured per job type
    return {
      ttl: 24 * 60 * 60 * 1000, // 24 hours
      batchSize: 100, // Process 100 jobs at a time
      priority: "normal",
    };
  }
}
