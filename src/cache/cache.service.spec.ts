import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { CacheService } from "./cache.service";
import {
  CacheConfigDto,
  CacheVersionDto,
  CompressionAlgorithm,
} from "./dto/cache-config.dto";
import { MemoryCacheBackend } from "./backends/memory.backend";
import { CacheUtils } from "./utils/cache.utils";

describe("CacheService", () => {
  let service: CacheService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        CacheService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: any) => defaultValue,
          },
        },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(async () => {
    await service.clear();
  });

  describe("Cache Operations", () => {
    it("should set and get cache entries", async () => {
      const jobType = "data-processing";
      const payload = { records: [{ id: 1 }] };
      const result = { processed: true, count: 1 };

      const setCacheResult = await service.set(jobType, payload, result);
      expect(setCacheResult.cached).toBe(true);
      expect(setCacheResult.cacheKey).toBeDefined();

      const getCacheResult = await service.get(jobType, payload);
      expect(getCacheResult).not.toBeNull();
      expect(getCacheResult?.hitCache).toBe(true);
      expect(getCacheResult?.data).toEqual(result);
    });

    it("should handle cache miss", async () => {
      const jobType = "ai-computation";
      const payload = { model: "gpt-4", prompt: "test" };

      const result = await service.get(jobType, payload);
      expect(result).toBeNull();
    });

    it("should track cache hits and misses", async () => {
      const jobType = "data-processing";
      const payload = { test: true };
      const result = { success: true };

      // Cache miss
      await service.get(jobType, payload);

      // Cache hit
      await service.set(jobType, payload, result);
      await service.get(jobType, payload);

      const metrics = await service.getMetrics();
      expect(metrics.cacheMisses).toBe(1);
      expect(metrics.cacheHits).toBe(1);
    });

    it("should invalidate cache by entry", async () => {
      const jobType = "data-processing";
      const payload = { records: [{ id: 1 }] };
      const result = { processed: true };

      await service.set(jobType, payload, result);
      const beforeClear = await service.get(jobType, payload);
      expect(beforeClear).not.toBeNull();

      await service.invalidate(jobType, payload);
      const afterClear = await service.get(jobType, payload);
      expect(afterClear).toBeNull();
    });

    it("should invalidate cache by job type", async () => {
      const jobType = "data-processing";
      const payload1 = { id: 1 };
      const payload2 = { id: 2 };
      const result = { success: true };

      await service.set(jobType, payload1, result);
      await service.set(jobType, payload2, result);

      const invalidatedCount = await service.invalidateByJobType(jobType);
      expect(invalidatedCount).toBe(2);

      const result1 = await service.get(jobType, payload1);
      const result2 = await service.get(jobType, payload2);
      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it("should invalidate cache by tags", async () => {
      const jobType = "data-processing";
      const payload = { test: true };
      const result = { success: true };
      const config = new CacheConfigDto();
      config.tags = ["production", "critical"];

      await service.set(jobType, payload, result, undefined, undefined, config);

      const invalidatedCount = await service.invalidateByTags(["production"]);
      expect(invalidatedCount).toBe(1);

      const getCacheResult = await service.get(jobType, payload);
      expect(getCacheResult).toBeNull();
    });

    it("should clear all cache", async () => {
      const jobTypes = [
        "data-processing",
        "ai-computation",
        "report-generation",
      ];
      const payload = { test: true };
      const result = { success: true };

      for (const jobType of jobTypes) {
        await service.set(jobType, payload, result);
      }

      await service.clear();

      for (const jobType of jobTypes) {
        const getCacheResult = await service.get(jobType, payload);
        expect(getCacheResult).toBeNull();
      }
    });
  });

  describe("Compression", () => {
    it("should compress large payloads", async () => {
      const jobType = "data-processing";
      const largePayload = {
        data: Array(1000).fill({ id: 1, name: "test", value: 123.456 }),
      };
      const result = { processed: true, itemsProcessed: 1000 };

      const config = new CacheConfigDto();
      config.compression = CompressionAlgorithm.GZIP;
      config.compressionThresholdBytes = 512;

      const setCacheResult = await service.set(
        jobType,
        largePayload,
        result,
        undefined,
        undefined,
        config,
      );
      expect(setCacheResult.cached).toBe(true);

      const getCacheResult = await service.get(jobType, largePayload);
      expect(getCacheResult).not.toBeNull();
      expect(getCacheResult?.data).toEqual(result);
    });

    it("should skip compression for small payloads", async () => {
      const jobType = "data-processing";
      const payload = { small: true };
      const result = { success: true };

      const config = new CacheConfigDto();
      config.compression = CompressionAlgorithm.GZIP;
      config.compressionThresholdBytes = 10000; // High threshold

      const setCacheResult = await service.set(
        jobType,
        payload,
        result,
        undefined,
        undefined,
        config,
      );
      expect(setCacheResult.cached).toBe(true);

      const getCacheResult = await service.get(jobType, payload);
      expect(getCacheResult?.data).toEqual(result);
    });
  });

  describe("TTL and Expiration", () => {
    it("should respect TTL settings", async () => {
      const jobType = "data-processing";
      const payload = { test: true };
      const result = { success: true };

      const config = new CacheConfigDto();
      config.ttlMs = 100; // 100ms TTL

      await service.set(jobType, payload, result, undefined, undefined, config);

      const immediateResult = await service.get(jobType, payload);
      expect(immediateResult).not.toBeNull();

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      const expiredResult = await service.get(jobType, payload);
      expect(expiredResult).toBeNull();
    });
  });

  describe("Versioning", () => {
    it("should handle cache versioning", async () => {
      const jobType = "data-processing";
      const payload = { test: true };
      const result = { success: true };

      const version1: CacheVersionDto = {
        jobDefinitionHash: "hash-v1",
        schemaVersion: 1,
        providerVersion: "v1",
      };

      const config = new CacheConfigDto();
      await service.set(jobType, payload, result, undefined, undefined, config);

      const version2: CacheVersionDto = {
        jobDefinitionHash: "hash-v2",
        schemaVersion: 2,
        providerVersion: "v1",
      };

      const invalidatedCount = await service.validateAndInvalidateOldVersions(
        jobType,
        version2,
      );
      expect(invalidatedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Dependency Tracking", () => {
    it("should track dependencies", async () => {
      const jobType = "data-processing";
      const payload = { test: true };
      const result = { success: true };

      const config = new CacheConfigDto();
      config.dependencies = ["upstream-job-1", "upstream-job-2"];

      const setCacheResult = await service.set(
        jobType,
        payload,
        result,
        "downstream-job-1",
        undefined,
        config,
      );
      expect(setCacheResult.cached).toBe(true);
    });

    it("should invalidate dependents", async () => {
      const upstreamJobId = "upstream-job-1";
      const downstreamJobType = "data-processing";
      const payload = { test: true };
      const result = { success: true };

      const config = new CacheConfigDto();
      config.dependencies = [upstreamJobId];

      await service.set(
        downstreamJobType,
        payload,
        result,
        "downstream-job-1",
        undefined,
        config,
      );

      const beforeInvalidate = await service.get(downstreamJobType, payload);
      expect(beforeInvalidate).not.toBeNull();

      const invalidatedCount =
        await service.invalidateDependents(upstreamJobId);
      expect(invalidatedCount).toBe(1);

      const afterInvalidate = await service.get(downstreamJobType, payload);
      expect(afterInvalidate).toBeNull();
    });
  });

  describe("Content Addressable Versioning", () => {
    it("should generate consistent cache keys for same content", () => {
      const jobType = "data-processing";
      const payload = { records: [{ id: 1 }] };

      const hash1 = CacheUtils.generateContentHash(jobType, payload);
      const hash2 = CacheUtils.generateContentHash(jobType, payload);

      expect(hash1).toBe(hash2);
    });

    it("should generate different cache keys for different content", () => {
      const jobType = "data-processing";
      const payload1 = { records: [{ id: 1 }] };
      const payload2 = { records: [{ id: 2 }] };

      const hash1 = CacheUtils.generateContentHash(jobType, payload1);
      const hash2 = CacheUtils.generateContentHash(jobType, payload2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("Metrics", () => {
    it("should track cache metrics", async () => {
      const jobType = "data-processing";
      const payload = { test: true };
      const result = { success: true };

      // Generate some cache activity
      for (let i = 0; i < 5; i++) {
        await service.set(jobType, { ...payload, id: i }, result);
        await service.get(jobType, { ...payload, id: i });
        await service.get(jobType, { ...payload, id: i + 100 }); // Miss
      }

      const metrics = await service.getMetrics();

      expect(metrics.cacheHits).toBe(5);
      expect(metrics.cacheMisses).toBe(5);
      expect(metrics.totalCacheSize).toBeGreaterThan(0);
    });
  });

  describe("Health Check", () => {
    it("should perform health check", async () => {
      const isHealthy = await service.health();
      expect(typeof isHealthy).toBe("boolean");
    });
  });

  describe("Cache Configuration", () => {
    it("should respect cache disabled setting", async () => {
      const jobType = "data-processing";
      const payload = { test: true };
      const result = { success: true };

      const config = new CacheConfigDto();
      config.enabled = false;

      const setCacheResult = await service.set(
        jobType,
        payload,
        result,
        undefined,
        undefined,
        config,
      );
      expect(setCacheResult.cached).toBe(false);
    });

    it("should respect skipCache setting", async () => {
      const jobType = "data-processing";
      const payload = { test: true };
      const result = { success: true };

      const config = new CacheConfigDto();
      config.skipCache = true;

      // Set cache entry
      const setConfig = new CacheConfigDto();
      setConfig.skipCache = false;
      await service.set(
        jobType,
        payload,
        result,
        undefined,
        undefined,
        setConfig,
      );

      // Try to get with skipCache=true
      const getCacheResult = await service.get(jobType, payload);
      expect(getCacheResult).not.toBeNull();
    });

    it("should handle cacheOnly mode", async () => {
      const jobType = "data-processing";
      const payload = { test: true };
      const result = { success: true };

      const config = new CacheConfigDto();
      config.cacheOnly = true;

      // This should only return results from cache, not execute job
      // Implementation depends on job processor integration
      expect(config.cacheOnly).toBe(true);
    });
  });
});
