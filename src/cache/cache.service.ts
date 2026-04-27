import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CacheEntry,
  CacheConfigDto,
  CacheVersionDto,
  CacheMetrics,
  CompressionAlgorithm,
} from "./dto/cache-config.dto";
import {
  ICacheStorage,
  CacheStorageConfig,
} from "./interfaces/cache-storage.interface";
import { CacheUtils } from "./utils/cache.utils";
import { RedisCacheBackend } from "./backends/redis.backend";
import { MemoryCacheBackend } from "./backends/memory.backend";
import { DynamoDBCacheBackend } from "./backends/dynamodb.backend";
import { S3CacheBackend } from "./backends/s3.backend";
import { EventEmitter2 } from "@nestjs/event-emitter";

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private backend: ICacheStorage;
  private metrics: CacheMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    cacheEvictions: 0,
    totalCacheSize: 0,
    compressionRatio: 0,
    avgHitLatency: 0,
    avgMissLatency: 0,
  };
  private hitLatencies: number[] = [];
  private missLatencies: number[] = [];
  private readonly maxLatencySamples = 100;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.initializeBackend();
  }

  /**
   * Initialize the appropriate cache backend
   */
  private initializeBackend(): void {
    const backendType = this.configService
      .get("CACHE_BACKEND", "memory")
      .toLowerCase();
    const cacheConfig: CacheStorageConfig = {
      enabled: this.configService.get("CACHE_ENABLED", true),
      host: this.configService.get("CACHE_HOST", "localhost"),
      port: this.configService.get("CACHE_PORT", 6379),
      region: this.configService.get("AWS_REGION", "us-east-1"),
      bucket: this.configService.get("CACHE_S3_BUCKET", "cache-bucket"),
      password: this.configService.get("CACHE_PASSWORD"),
      username: this.configService.get("CACHE_USERNAME"),
      db: this.configService.get("CACHE_DB", 0),
      ttl: this.configService.get("CACHE_TTL_MS", 24 * 60 * 60 * 1000),
      maxRetries: this.configService.get("CACHE_MAX_RETRIES", 3),
      retryDelay: this.configService.get("CACHE_RETRY_DELAY_MS", 1000),
      connectionTimeout: this.configService.get("CACHE_TIMEOUT_MS", 5000),
      requestTimeout: this.configService.get("CACHE_REQUEST_TIMEOUT_MS", 5000),
    };

    switch (backendType) {
      case "redis":
        this.backend = new RedisCacheBackend(cacheConfig);
        this.logger.log("Redis cache backend initialized");
        break;

      case "dynamodb":
        this.backend = new DynamoDBCacheBackend(cacheConfig);
        this.logger.log("DynamoDB cache backend initialized");
        break;

      case "s3":
        this.backend = new S3CacheBackend(cacheConfig);
        this.logger.log("S3 cache backend initialized");
        break;

      case "memory":
      default:
        this.backend = new MemoryCacheBackend(cacheConfig);
        this.logger.log("Memory cache backend initialized");
    }
  }

  /**
   * Get cache entry for a job
   */
  async get<T>(
    jobType: string,
    payload: any,
    jobId?: string,
    providerId?: string,
  ): Promise<{ data: T; hitCache: boolean } | null> {
    const startTime = Date.now();

    try {
      const contentHash = CacheUtils.generateContentHash(
        jobType,
        payload,
        providerId,
      );
      const cacheKey = CacheUtils.generateCacheKey(jobType, contentHash, jobId);

      const entry = await this.backend.get<T>(cacheKey);

      if (!entry) {
        this.metrics.cacheMisses++;
        const latency = Date.now() - startTime;
        this.recordMissLatency(latency);
        return null;
      }

      // Decompress if needed
      let data = entry.data;
      if (entry.compressed) {
        data = await CacheUtils.decompress(
          Buffer.from(entry.data as any),
          (entry.version?.providerVersion as any) || CompressionAlgorithm.GZIP,
        );
      }

      this.metrics.cacheHits++;
      const latency = Date.now() - startTime;
      this.recordHitLatency(latency);

      this.logger.debug(
        `Cache hit for ${jobType} (key: ${cacheKey}, latency: ${latency}ms)`,
      );

      return { data, hitCache: true };
    } catch (error) {
      this.logger.error(
        `Failed to get cache entry: ${error.message}`,
        error.stack,
      );
      this.metrics.cacheMisses++;
      return null;
    }
  }

  /**
   * Set cache entry for a job
   */
  async set<T>(
    jobType: string,
    payload: any,
    result: T,
    jobId?: string,
    providerId?: string,
    config?: CacheConfigDto,
  ): Promise<{ cacheKey: string; cached: boolean }> {
    try {
      const cacheConfig = config || new CacheConfigDto();

      if (!cacheConfig.enabled) {
        this.logger.debug(`Caching disabled for job type: ${jobType}`);
        return { cacheKey: "", cached: false };
      }

      const contentHash = CacheUtils.generateContentHash(
        jobType,
        payload,
        providerId,
      );
      const cacheKey = CacheUtils.generateCacheKey(jobType, contentHash, jobId);

      let dataToCache: any = result;
      let compressed = false;

      // Compress if needed
      if (
        cacheConfig.compression &&
        CacheUtils.shouldCompress(
          result,
          cacheConfig.compression,
          cacheConfig.compressionThresholdBytes || 1024,
        )
      ) {
        const { compressed: compressedData, algorithm } =
          await CacheUtils.compress(result, cacheConfig.compression);
        dataToCache = compressedData.toString("base64");
        compressed = true;

        const ratio = CacheUtils.calculateCompressionRatio(
          JSON.stringify(result).length,
          compressedData.length,
        );
        this.logger.debug(
          `Compressed cache entry ${cacheKey}: ${ratio.toFixed(2)}%`,
        );
        this.metrics.compressionRatio =
          (this.metrics.compressionRatio + ratio) / 2;
      }

      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + (cacheConfig.ttlMs || 24 * 60 * 60 * 1000),
      );

      const version: CacheVersionDto = {
        jobDefinitionHash: contentHash,
        providerVersion: cacheConfig.compression || CompressionAlgorithm.NONE,
        schemaVersion: 1,
      };

      const entry: CacheEntry<T> = {
        cacheKey,
        jobId: jobId || contentHash,
        jobType,
        data: dataToCache as T,
        hash: contentHash,
        compressed,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        version,
        metadata: {
          providerId: providerId || "default",
          payloadSize: JSON.stringify(payload).length,
          resultSize: JSON.stringify(result).length,
        },
        dependencies: cacheConfig.dependencies,
        tags: cacheConfig.tags,
      };

      await this.backend.set(cacheKey, entry, cacheConfig.ttlMs);
      await this.backend.setVersion(cacheKey, version);

      this.logger.log(
        `Cache entry stored: ${cacheKey} (TTL: ${cacheConfig.ttlMs}ms)`,
      );

      // Emit event for cache warming
      this.eventEmitter.emit("cache.entry.stored", {
        cacheKey,
        jobType,
        jobId,
        dependencies: cacheConfig.dependencies,
      });

      return { cacheKey, cached: true };
    } catch (error) {
      this.logger.error(
        `Failed to set cache entry: ${error.message}`,
        error.stack,
      );
      return { cacheKey: "", cached: false };
    }
  }

  /**
   * Invalidate cache entry
   */
  async invalidate(
    jobType: string,
    payload?: any,
    jobId?: string,
    providerId?: string,
  ): Promise<boolean> {
    try {
      const contentHash = CacheUtils.generateContentHash(
        jobType,
        payload,
        providerId,
      );
      const cacheKey = CacheUtils.generateCacheKey(jobType, contentHash, jobId);

      await this.backend.delete(cacheKey);

      this.logger.log(`Cache entry invalidated: ${cacheKey}`);

      // Emit event for dependency invalidation
      this.eventEmitter.emit("cache.entry.invalidated", {
        cacheKey,
        jobType,
        jobId,
      });

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to invalidate cache entry: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * Invalidate cache entries by job type
   */
  async invalidateByJobType(jobType: string): Promise<number> {
    try {
      const count = await this.backend.clearByJobType(jobType);
      this.logger.log(
        `Invalidated ${count} cache entries for job type: ${jobType}`,
      );
      return count;
    } catch (error) {
      this.logger.error(
        `Failed to invalidate cache by job type: ${error.message}`,
        error.stack,
      );
      return 0;
    }
  }

  /**
   * Invalidate cache entries by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    try {
      const count = await this.backend.clearByTags(tags);
      this.logger.log(
        `Invalidated ${count} cache entries by tags: ${tags.join(", ")}`,
      );
      return count;
    } catch (error) {
      this.logger.error(
        `Failed to invalidate cache by tags: ${error.message}`,
        error.stack,
      );
      return 0;
    }
  }

  /**
   * Invalidate dependent cache entries when upstream job changes
   */
  async invalidateDependents(jobId: string): Promise<number> {
    try {
      const pattern = `cache:*`;
      const entries = await this.backend.getByPattern<any>(pattern);

      let invalidatedCount = 0;
      for (const entry of entries) {
        if (entry.dependencies && entry.dependencies.includes(jobId)) {
          await this.backend.delete(entry.cacheKey);
          invalidatedCount++;
        }
      }

      if (invalidatedCount > 0) {
        this.logger.log(
          `Invalidated ${invalidatedCount} dependent cache entries for job: ${jobId}`,
        );
      }

      return invalidatedCount;
    } catch (error) {
      this.logger.error(
        `Failed to invalidate dependent cache entries: ${error.message}`,
        error.stack,
      );
      return 0;
    }
  }

  /**
   * Validate cache version and invalidate old entries
   */
  async validateAndInvalidateOldVersions(
    jobType: string,
    currentVersion: CacheVersionDto,
  ): Promise<number> {
    try {
      const count = await this.backend.invalidateOldVersions(
        jobType,
        currentVersion,
      );
      this.logger.log(
        `Invalidated ${count} old version cache entries for job type: ${jobType}`,
      );
      return count;
    } catch (error) {
      this.logger.error(
        `Failed to validate cache versions: ${error.message}`,
        error.stack,
      );
      return 0;
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    try {
      await this.backend.clear();
      this.logger.log("All cache entries cleared");
    } catch (error) {
      this.logger.error(`Failed to clear cache: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get cache metrics
   */
  async getMetrics(): Promise<CacheMetrics> {
    try {
      const backendMetrics = await this.backend.getMetrics();

      return {
        ...this.metrics,
        totalCacheSize: backendMetrics.size,
        avgHitLatency:
          this.hitLatencies.length > 0
            ? this.hitLatencies.reduce((a, b) => a + b, 0) /
              this.hitLatencies.length
            : 0,
        avgMissLatency:
          this.missLatencies.length > 0
            ? this.missLatencies.reduce((a, b) => a + b, 0) /
              this.missLatencies.length
            : 0,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get cache metrics: ${error.message}`,
        error.stack,
      );
      return this.metrics;
    }
  }

  /**
   * Health check
   */
  async health(): Promise<boolean> {
    try {
      return await this.backend.health();
    } catch (error) {
      this.logger.error(`Cache health check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Record hit latency
   */
  private recordHitLatency(latency: number): void {
    this.hitLatencies.push(latency);
    if (this.hitLatencies.length > this.maxLatencySamples) {
      this.hitLatencies.shift();
    }
  }

  /**
   * Record miss latency
   */
  private recordMissLatency(latency: number): void {
    this.missLatencies.push(latency);
    if (this.missLatencies.length > this.maxLatencySamples) {
      this.missLatencies.shift();
    }
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    if (
      this.backend &&
      typeof (this.backend as any).disconnect === "function"
    ) {
      await (this.backend as any).disconnect();
    }
  }
}
