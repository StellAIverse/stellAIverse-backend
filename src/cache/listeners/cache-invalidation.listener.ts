import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { CacheService } from "../cache.service";

@Injectable()
export class CacheInvalidationListener {
  private readonly logger = new Logger(CacheInvalidationListener.name);

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Listen for job completion and invalidate dependent caches
   */
  @OnEvent("compute.job.completed")
  async handleJobCompleted(payload: {
    jobId: string;
    jobType: string;
    result: any;
  }): Promise<void> {
    try {
      this.logger.debug(
        `Job completed, checking for dependent caches: ${payload.jobId}`,
      );

      // Invalidate dependent cache entries
      const invalidatedCount = await this.cacheService.invalidateDependents(
        payload.jobId,
      );

      if (invalidatedCount > 0) {
        this.logger.log(
          `Invalidated ${invalidatedCount} dependent cache entries due to job completion: ${payload.jobId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle job completion: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Listen for job failure and clear dependent caches
   */
  @OnEvent("compute.job.failed")
  async handleJobFailed(payload: {
    jobId: string;
    jobType: string;
    error: string;
  }): Promise<void> {
    try {
      this.logger.debug(
        `Job failed, clearing dependent caches: ${payload.jobId}`,
      );

      // Invalidate dependent cache entries
      const invalidatedCount = await this.cacheService.invalidateDependents(
        payload.jobId,
      );

      if (invalidatedCount > 0) {
        this.logger.log(
          `Invalidated ${invalidatedCount} dependent cache entries due to job failure: ${payload.jobId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle job failure: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Listen for job definition changes and invalidate old versions
   */
  @OnEvent("compute.job.definition.updated")
  async handleJobDefinitionUpdated(payload: {
    jobType: string;
    previousVersion: number;
    newVersion: number;
  }): Promise<void> {
    try {
      this.logger.debug(
        `Job definition updated, invalidating old versions: ${payload.jobType}`,
      );

      // Invalidate old versions
      const invalidatedCount =
        await this.cacheService.validateAndInvalidateOldVersions(
          payload.jobType,
          {
            jobDefinitionHash: `${payload.jobType}-v${payload.newVersion}`,
            providerVersion: "v1",
            schemaVersion: payload.newVersion,
          },
        );

      if (invalidatedCount > 0) {
        this.logger.log(
          `Invalidated ${invalidatedCount} old version cache entries for job type: ${payload.jobType}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle job definition update: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Listen for cache invalidation events
   */
  @OnEvent("cache.entry.invalidated")
  async handleCacheInvalidated(payload: {
    cacheKey: string;
    jobType: string;
    jobId?: string;
  }): Promise<void> {
    try {
      this.logger.debug(
        `Cache entry invalidated: ${payload.cacheKey} (job: ${payload.jobId})`,
      );

      // Could trigger notifications, logging, or metrics here
      // For now, just log the event
    } catch (error) {
      this.logger.error(
        `Failed to handle cache invalidation event: ${error.message}`,
      );
    }
  }

  /**
   * Listen for cache warming completion
   */
  @OnEvent("cache.warming.completed")
  async handleCacheWarmingCompleted(payload: {
    warmingId: string;
    totalJobs: number;
    successCount: number;
    failureCount: number;
    cacheKeys: string[];
    duration: number;
  }): Promise<void> {
    try {
      this.logger.log(
        `Cache warming completed: ${payload.successCount}/${payload.totalJobs} successful in ${payload.duration}ms`,
      );

      // Could trigger notifications or metrics here
    } catch (error) {
      this.logger.error(
        `Failed to handle cache warming completion: ${error.message}`,
      );
    }
  }

  /**
   * Listen for cache entry storage
   */
  @OnEvent("cache.entry.stored")
  async handleCacheEntryStored(payload: {
    cacheKey: string;
    jobType: string;
    jobId?: string;
    dependencies?: string[];
  }): Promise<void> {
    try {
      if (payload.dependencies && payload.dependencies.length > 0) {
        this.logger.debug(
          `Cache entry stored with dependencies: ${payload.cacheKey} -> ${payload.dependencies.join(", ")}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle cache entry storage: ${error.message}`,
      );
    }
  }
}
