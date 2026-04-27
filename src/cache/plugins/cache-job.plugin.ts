import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bull";
import { CacheService } from "../cache.service";
import { CacheConfigDto } from "../dto/cache-config.dto";

export interface ComputeJobData {
  type: string;
  payload: any;
  userId?: string;
  metadata?: Record<string, any>;
  cacheConfig?: CacheConfigDto;
  providerId?: string;
}

/**
 * Cache plugin for compute job processor
 * Handles cache lookups and storage for job results
 */
@Injectable()
export class CacheJobPlugin {
  private readonly logger = new Logger(CacheJobPlugin.name);

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Check cache before job execution
   */
  async checkCache<T>(
    job: Job<ComputeJobData>,
  ): Promise<{ result: T; fromCache: boolean } | null> {
    try {
      const { type: jobType, payload, cacheConfig, providerId } = job.data;

      // Skip cache check if disabled
      if (!cacheConfig?.enabled || cacheConfig.skipCache) {
        this.logger.debug(`Cache disabled for job ${job.id}`);
        return null;
      }

      // Check cache
      const cacheResult = await this.cacheService.get<T>(
        jobType,
        payload,
        job.id as string,
        providerId,
      );

      if (cacheResult) {
        this.logger.log(
          `Cache hit for job ${job.id} (${jobType}), skipping execution`,
        );
        return { result: cacheResult.data, fromCache: true };
      }

      this.logger.debug(`Cache miss for job ${job.id} (${jobType})`);
      return null;
    } catch (error) {
      this.logger.error(
        `Error checking cache for job ${job.id}: ${error.message}`,
        error.stack,
      );
      // On error, allow job to proceed normally
      return null;
    }
  }

  /**
   * Store result in cache after job completion
   */
  async storeResult<T>(
    job: Job<ComputeJobData>,
    result: T,
  ): Promise<{ cacheKey: string; cached: boolean }> {
    try {
      const { type: jobType, payload, cacheConfig, providerId } = job.data;

      // Skip caching if disabled
      if (!cacheConfig?.enabled) {
        return { cacheKey: "", cached: false };
      }

      const cacheResult = await this.cacheService.set<T>(
        jobType,
        payload,
        result,
        job.id as string,
        providerId,
        cacheConfig,
      );

      return cacheResult;
    } catch (error) {
      this.logger.error(
        `Error storing cache result for job ${job.id}: ${error.message}`,
        error.stack,
      );
      return { cacheKey: "", cached: false };
    }
  }

  /**
   * Invalidate job cache
   */
  async invalidateJob(job: Job<ComputeJobData>): Promise<boolean> {
    try {
      const { type: jobType, payload, providerId } = job.data;

      return await this.cacheService.invalidate(
        jobType,
        payload,
        job.id as string,
        providerId,
      );
    } catch (error) {
      this.logger.error(
        `Error invalidating cache for job ${job.id}: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * Check if job result should only be served from cache
   */
  shouldCacheOnly(job: Job<ComputeJobData>): boolean {
    return job.data.cacheConfig?.cacheOnly || false;
  }

  /**
   * Emit cache-related events
   */
  emitCacheEvent(eventType: string, payload: any): void {
    switch (eventType) {
      case "HIT":
        this.logger.debug(`Cache hit event: ${JSON.stringify(payload)}`);
        break;
      case "MISS":
        this.logger.debug(`Cache miss event: ${JSON.stringify(payload)}`);
        break;
      case "STORED":
        this.logger.debug(`Cache stored event: ${JSON.stringify(payload)}`);
        break;
      default:
        this.logger.debug(`Unknown cache event: ${eventType}`);
    }
  }
}
