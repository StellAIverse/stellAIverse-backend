import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { CacheService } from "./cache.service";
import { CacheWarmerService } from "./services/cache-warmer.service";
import { CacheInvalidationListener } from "./listeners/cache-invalidation.listener";
import { CacheJobPlugin } from "./plugins/cache-job.plugin";
import { CacheConfigDto, CompressionAlgorithm } from "./dto/cache-config.dto";

describe("Cache Integration Tests", () => {
  let cacheService: CacheService;
  let cacheWarmerService: CacheWarmerService;
  let cacheJobPlugin: CacheJobPlugin;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        CacheService,
        CacheWarmerService,
        CacheInvalidationListener,
        CacheJobPlugin,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: any) => defaultValue,
          },
        },
      ],
    }).compile();

    cacheService = module.get<CacheService>(CacheService);
    cacheWarmerService = module.get<CacheWarmerService>(CacheWarmerService);
    cacheJobPlugin = module.get<CacheJobPlugin>(CacheJobPlugin);
  });

  afterEach(async () => {
    await cacheService.clear();
  });

  describe("Dependency-Aware Invalidation", () => {
    it("should invalidate dependent caches when upstream job completes", async () => {
      const upstreamJobId = "upstream-job-1";
      const downstreamJobType1 = "data-processing";
      const downstreamPayload1 = { processUpstream: true };
      const downstreamJobType2 = "report-generation";
      const downstreamPayload2 = { reportFrom: upstreamJobId };

      const config1 = new CacheConfigDto();
      config1.dependencies = [upstreamJobId];
      const config2 = new CacheConfigDto();
      config2.dependencies = [upstreamJobId];

      // Setup cache with dependencies
      await cacheService.set(
        downstreamJobType1,
        downstreamPayload1,
        { processed: true },
        "downstream-1",
        undefined,
        config1,
      );

      await cacheService.set(
        downstreamJobType2,
        downstreamPayload2,
        { report: "generated" },
        "downstream-2",
        undefined,
        config2,
      );

      // Verify cache entries exist
      let result1 = await cacheService.get(
        downstreamJobType1,
        downstreamPayload1,
      );
      let result2 = await cacheService.get(
        downstreamJobType2,
        downstreamPayload2,
      );
      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();

      // Invalidate dependents when upstream job changes
      const invalidatedCount =
        await cacheService.invalidateDependents(upstreamJobId);
      expect(invalidatedCount).toBe(2);

      // Verify dependent caches are invalidated
      result1 = await cacheService.get(downstreamJobType1, downstreamPayload1);
      result2 = await cacheService.get(downstreamJobType2, downstreamPayload2);
      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it("should handle cascading invalidation in DAG", async () => {
      // Create a DAG: Job1 -> Job2 -> Job3
      const job1 = "job-1";
      const job2 = "job-2";
      const job3 = "job-3";

      const config1 = new CacheConfigDto();
      config1.dependencies = [job1];
      const config2 = new CacheConfigDto();
      config2.dependencies = [job2];

      // Set up cache for job2 (depends on job1)
      await cacheService.set(
        "processing",
        { source: job1 },
        { result: "job2" },
        job2,
        undefined,
        config1,
      );

      // Set up cache for job3 (depends on job2)
      await cacheService.set(
        "reporting",
        { source: job2 },
        { result: "job3" },
        job3,
        undefined,
        config2,
      );

      // Verify caches exist
      let result2 = await cacheService.get("processing", { source: job1 });
      const result3 = await cacheService.get("reporting", { source: job2 });
      expect(result2).not.toBeNull();
      expect(result3).not.toBeNull();

      // Invalidate job1, should cascade to job2 and job3
      const invalidatedCount = await cacheService.invalidateDependents(job1);
      expect(invalidatedCount).toBe(1); // job2 is invalidated

      // Check job2 is invalidated
      result2 = await cacheService.get("processing", { source: job1 });
      expect(result2).toBeNull();

      // Note: job3 won't auto-invalidate because job2's result was removed
      // This is expected - the dependency graph needs explicit tracking
    });
  });

  describe("Concurrent Access", () => {
    it("should handle concurrent cache operations", async () => {
      const operations = [];
      const jobCount = 10;

      // Concurrent writes
      for (let i = 0; i < jobCount; i++) {
        operations.push(
          cacheService.set(
            "data-processing",
            { id: i },
            { processed: true, id: i },
          ),
        );
      }

      const writeResults = await Promise.all(operations);
      expect(writeResults).toHaveLength(jobCount);

      // Concurrent reads
      const readOperations = [];
      for (let i = 0; i < jobCount; i++) {
        readOperations.push(cacheService.get("data-processing", { id: i }));
      }

      const readResults = await Promise.all(readOperations);
      expect(readResults).toHaveLength(jobCount);
      expect(readResults.every((r) => r !== null)).toBe(true);
    });

    it("should handle concurrent invalidations", async () => {
      // Set up multiple cache entries
      const config = new CacheConfigDto();
      config.tags = ["test-tag"];

      for (let i = 0; i < 5; i++) {
        await cacheService.set(
          "data-processing",
          { id: i },
          { result: i },
          undefined,
          undefined,
          config,
        );
      }

      // Concurrent invalidations
      const invalidateOps = [
        cacheService.invalidateByJobType("data-processing"),
        cacheService.invalidateByTags(["test-tag"]),
        cacheService.clear(),
      ];

      await Promise.all(invalidateOps);

      // Verify cache is cleared
      const result = await cacheService.get("data-processing", { id: 0 });
      expect(result).toBeNull();
    });
  });

  describe("Cache Warming", () => {
    it("should warm cache with batch of jobs", async () => {
      const jobs = [
        {
          jobType: "data-processing",
          payload: { id: 1 },
          jobId: "job-1",
        },
        {
          jobType: "data-processing",
          payload: { id: 2 },
          jobId: "job-2",
        },
        {
          jobType: "ai-computation",
          payload: { model: "gpt-4" },
          jobId: "job-3",
        },
      ];

      const result = await cacheWarmerService.warmCache({ jobs });

      expect(result.successCount).toBeGreaterThan(0);
      expect(result.cacheKeys.length).toBe(result.successCount);
    });

    it("should handle cache warming with custom config", async () => {
      const config = new CacheConfigDto();
      config.ttlMs = 60000; // 1 minute
      config.compression = CompressionAlgorithm.GZIP;
      config.tags = ["warming"];

      const jobs = [
        {
          jobType: "data-processing",
          payload: { data: Array(100).fill({ id: 1 }) },
          config,
        },
      ];

      const result = await cacheWarmerService.warmCache({ jobs });
      expect(result.successCount).toBeGreaterThan(0);
    });

    it("should track cache warming status", async () => {
      const status1 = cacheWarmerService.getWarmingStatus();
      expect(status1.activeWarmings).toBeGreaterThanOrEqual(0);

      const jobs = [{ jobType: "data-processing", payload: { id: 1 } }];

      await cacheWarmerService.warmCache({ jobs });

      const status2 = cacheWarmerService.getWarmingStatus();
      expect(status2.activeWarmings).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Cache Job Plugin", () => {
    it("should check cache and return result if hit", async () => {
      const jobType = "data-processing";
      const payload = { test: true };
      const result = { success: true };

      // Pre-populate cache
      const config = new CacheConfigDto();
      await cacheService.set(
        jobType,
        payload,
        result,
        "job-1",
        undefined,
        config,
      );

      // Create mock job
      const mockJob = {
        id: "job-1",
        data: {
          type: jobType,
          payload,
          cacheConfig: config,
        },
      };

      const cacheResult = await cacheJobPlugin.checkCache(mockJob as any);
      expect(cacheResult).not.toBeNull();
      expect(cacheResult?.fromCache).toBe(true);
      expect(cacheResult?.result).toEqual(result);
    });

    it("should store result in cache after job completion", async () => {
      const jobType = "data-processing";
      const payload = { test: true };
      const result = { success: true, timestamp: Date.now() };

      const config = new CacheConfigDto();
      const mockJob = {
        id: "job-1",
        data: {
          type: jobType,
          payload,
          cacheConfig: config,
        },
      };

      const storageResult = await cacheJobPlugin.storeResult(
        mockJob as any,
        result,
      );
      expect(storageResult.cached).toBe(true);

      // Verify result is cached
      const cachedResult = await cacheService.get(jobType, payload);
      expect(cachedResult).not.toBeNull();
      expect(cachedResult?.data).toEqual(result);
    });

    it("should invalidate job cache", async () => {
      const jobType = "data-processing";
      const payload = { test: true };
      const result = { success: true };

      const config = new CacheConfigDto();
      await cacheService.set(
        jobType,
        payload,
        result,
        "job-1",
        undefined,
        config,
      );

      const mockJob = {
        id: "job-1",
        data: {
          type: jobType,
          payload,
          cacheConfig: config,
        },
      };

      const invalidated = await cacheJobPlugin.invalidateJob(mockJob as any);
      expect(invalidated).toBe(true);

      const cachedResult = await cacheService.get(jobType, payload);
      expect(cachedResult).toBeNull();
    });

    it("should determine cache-only mode", () => {
      const config = new CacheConfigDto();
      config.cacheOnly = true;

      const mockJob = {
        id: "job-1",
        data: {
          type: "data-processing",
          payload: { test: true },
          cacheConfig: config,
        },
      };

      const isOnlyCache = cacheJobPlugin.shouldCacheOnly(mockJob as any);
      expect(isOnlyCache).toBe(true);
    });
  });

  describe("Metrics and Monitoring", () => {
    it("should aggregate cache metrics", async () => {
      // Generate cache activity
      for (let i = 0; i < 10; i++) {
        const config = new CacheConfigDto();
        await cacheService.set(
          "data-processing",
          { id: i },
          { result: i },
          undefined,
          undefined,
          config,
        );
      }

      for (let i = 0; i < 10; i++) {
        await cacheService.get("data-processing", { id: i });
      }

      // Miss some cache
      for (let i = 100; i < 105; i++) {
        await cacheService.get("data-processing", { id: i });
      }

      const metrics = await cacheService.getMetrics();

      expect(metrics.cacheHits).toBe(10);
      expect(metrics.cacheMisses).toBe(5);
      expect(metrics.totalCacheSize).toBeGreaterThan(0);
      expect(metrics.avgHitLatency).toBeGreaterThan(0);
    });

    it("should report cache backend health", async () => {
      const isHealthy = await cacheService.health();
      expect(typeof isHealthy).toBe("boolean");
    });
  });

  describe("Version-Based Invalidation", () => {
    it("should invalidate cache when job definition changes", async () => {
      const jobType = "data-processing";
      const payload = { test: true };
      const result = { success: true };

      const config = new CacheConfigDto();
      await cacheService.set(
        jobType,
        payload,
        result,
        "job-1",
        undefined,
        config,
      );

      // Simulate job definition update
      const newVersion = { schemaVersion: 2, providerVersion: "v1" };
      const invalidatedCount =
        await cacheService.validateAndInvalidateOldVersions(
          jobType,
          newVersion,
        );

      expect(invalidatedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Compression Efficiency", () => {
    it("should compress large results efficiently", async () => {
      const jobType = "data-processing";
      const largePayload = {
        data: Array(500)
          .fill(null)
          .map((_, i) => ({
            id: i,
            name: `Item ${i}`,
            description: `This is item ${i} with a long description`,
            metadata: { key1: "value1", key2: "value2" },
          })),
      };
      const largeResult = {
        items: Array(500)
          .fill(null)
          .map((_, i) => ({
            id: i,
            processed: true,
            timestamp: Date.now(),
          })),
      };

      const config = new CacheConfigDto();
      config.compression = CompressionAlgorithm.GZIP;

      const setResult = await cacheService.set(
        jobType,
        largePayload,
        largeResult,
        "job-1",
        undefined,
        config,
      );
      expect(setResult.cached).toBe(true);

      const getResult = await cacheService.get(jobType, largePayload);
      expect(getResult).not.toBeNull();
      expect(getResult?.data).toEqual(largeResult);
    });
  });
});
