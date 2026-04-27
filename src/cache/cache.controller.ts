import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { CacheService } from "./cache.service";
import {
  CacheWarmerService,
  CacheWarmingRequest,
  CacheWarmingResult,
} from "./services/cache-warmer.service";
import { CacheConfigDto, CacheMetrics } from "./dto/cache-config.dto";

@ApiTags("cache")
@Controller("cache")
export class CacheController {
  private readonly logger = new Logger(CacheController.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly cacheWarmerService: CacheWarmerService,
  ) {}

  /**
   * Get health status of cache backend
   */
  @Get("health")
  @ApiOperation({ summary: "Check cache backend health" })
  @ApiResponse({
    status: 200,
    description: "Cache backend is healthy",
    schema: { example: { healthy: true, backend: "redis" } },
  })
  async health(): Promise<{ healthy: boolean; backend: string }> {
    const isHealthy = await this.cacheService.health();
    return {
      healthy: isHealthy,
      backend: "redis", // TODO: Return actual backend type
    };
  }

  /**
   * Get cache metrics
   */
  @Get("metrics")
  @ApiOperation({ summary: "Get cache metrics and statistics" })
  @ApiResponse({
    status: 200,
    description: "Cache metrics retrieved successfully",
    type: () => CacheMetrics,
  })
  async getMetrics(): Promise<CacheMetrics> {
    return this.cacheService.getMetrics();
  }

  /**
   * Invalidate cache by job type
   */
  @Delete("job-type/:jobType")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Invalidate all cache for a job type" })
  @ApiParam({ name: "jobType", description: "Job type to invalidate" })
  @ApiResponse({
    status: 200,
    description: "Cache invalidated successfully",
    schema: { example: { success: true, invalidatedCount: 10 } },
  })
  async invalidateByJobType(
    @Param("jobType") jobType: string,
  ): Promise<{ success: boolean; invalidatedCount: number }> {
    const invalidatedCount =
      await this.cacheService.invalidateByJobType(jobType);
    return { success: true, invalidatedCount };
  }

  /**
   * Invalidate cache by tags
   */
  @Delete("tags")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Invalidate cache entries by tags" })
  @ApiQuery({
    name: "tags",
    description: "Comma-separated list of tags",
    example: "production,critical",
  })
  @ApiResponse({
    status: 200,
    description: "Cache invalidated successfully",
    schema: { example: { success: true, invalidatedCount: 5 } },
  })
  async invalidateByTags(
    @Query("tags") tagsQuery: string,
  ): Promise<{ success: boolean; invalidatedCount: number }> {
    const tags = tagsQuery.split(",").map((tag) => tag.trim());
    const invalidatedCount = await this.cacheService.invalidateByTags(tags);
    return { success: true, invalidatedCount };
  }

  /**
   * Invalidate dependents for a job
   */
  @Delete("dependents/:jobId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Invalidate cache for jobs depending on given job" })
  @ApiParam({ name: "jobId", description: "Job ID" })
  @ApiResponse({
    status: 200,
    description: "Dependent caches invalidated successfully",
    schema: { example: { success: true, invalidatedCount: 3 } },
  })
  async invalidateDependents(
    @Param("jobId") jobId: string,
  ): Promise<{ success: boolean; invalidatedCount: number }> {
    const invalidatedCount =
      await this.cacheService.invalidateDependents(jobId);
    return { success: true, invalidatedCount };
  }

  /**
   * Clear all cache
   */
  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Clear all cache entries" })
  @ApiResponse({
    status: 200,
    description: "All cache cleared successfully",
    schema: {
      example: { success: true, message: "All cache entries cleared" },
    },
  })
  async clearAll(): Promise<{ success: boolean; message: string }> {
    await this.cacheService.clear();
    return { success: true, message: "All cache entries cleared" };
  }

  /**
   * Warm cache with batch of jobs
   */
  @Post("warm")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Warm cache with batch of jobs (pre-populate cache)",
  })
  @ApiBody({
    description: "Cache warming request with jobs",
    schema: {
      example: {
        jobs: [{ jobType: "data-processing", payload: { id: 1 } }],
        priority: "normal",
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "Cache warming completed",
    schema: {
      example: {
        totalJobs: 5,
        successCount: 5,
        failureCount: 0,
        cacheKeys: ["cache-key-1", "cache-key-2"],
        errors: [],
        totalBytesAdded: 1024000,
        duration: 150,
      },
    },
  })
  async warmCache(
    @Body() request: CacheWarmingRequest,
  ): Promise<CacheWarmingResult> {
    this.logger.log(
      `Cache warming request received with ${request.jobs.length} jobs`,
    );
    return this.cacheWarmerService.warmCache(request);
  }

  /**
   * Get warming status
   */
  @Get("warming/status")
  @ApiOperation({ summary: "Get current cache warming status" })
  @ApiResponse({
    status: 200,
    description: "Warming status retrieved",
    schema: {
      example: {
        activeWarmings: 1,
        inProgress: ["warming-1234567890"],
      },
    },
  })
  async getWarmingStatus(): Promise<{
    activeWarmings: number;
    inProgress: string[];
  }> {
    return this.cacheWarmerService.getWarmingStatus();
  }

  /**
   * Get cache warming strategy for job type
   */
  @Get("warming/strategy/:jobType")
  @ApiOperation({
    summary: "Get recommended cache warming strategy for job type",
  })
  @ApiParam({ name: "jobType", description: "Job type" })
  @ApiResponse({
    status: 200,
    description: "Warming strategy retrieved",
    schema: {
      example: {
        ttl: 86400000,
        batchSize: 100,
        priority: "normal",
      },
    },
  })
  async getWarmingStrategy(
    @Param("jobType") jobType: string,
  ): Promise<{ ttl: number; batchSize: number; priority: string }> {
    return this.cacheWarmerService.getWarmingStrategy(jobType);
  }
}
