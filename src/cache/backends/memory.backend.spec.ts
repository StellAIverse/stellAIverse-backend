import { MemoryCacheBackend } from "../backends/memory.backend";
import { CacheEntry, CacheVersionDto } from "../dto/cache-config.dto";

describe("MemoryCacheBackend", () => {
  let backend: MemoryCacheBackend;

  beforeEach(async () => {
    backend = new MemoryCacheBackend({ enabled: true });
  });

  afterEach(async () => {
    await backend.clear();
    await backend.disconnect();
  });

  describe("Set and Get", () => {
    it("should set and retrieve cache entries", async () => {
      const cacheKey = "cache:test:hash123";
      const entry: CacheEntry = {
        cacheKey,
        jobId: "job-1",
        jobType: "test",
        data: { result: "success" },
        hash: "hash123",
        compressed: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        version: { schemaVersion: 1 },
      };

      await backend.set(cacheKey, entry);
      const retrieved = await backend.get(cacheKey);

      expect(retrieved).toBeDefined();
      expect(retrieved?.jobId).toBe("job-1");
      expect(retrieved?.data).toEqual({ result: "success" });
    });

    it("should return null for non-existent keys", async () => {
      const retrieved = await backend.get("cache:nonexistent:key");
      expect(retrieved).toBeNull();
    });

    it("should handle expired entries", async () => {
      const cacheKey = "cache:test:expired";
      const entry: CacheEntry = {
        cacheKey,
        jobId: "job-1",
        jobType: "test",
        data: { result: "success" },
        hash: "hash123",
        compressed: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() - 1000).toISOString(), // Expired
        version: { schemaVersion: 1 },
      };

      await backend.set(cacheKey, entry, 1000);
      const retrieved = await backend.get(cacheKey);

      expect(retrieved).toBeNull();
    });
  });

  describe("Delete Operations", () => {
    it("should delete cache entries", async () => {
      const cacheKey = "cache:test:delete";
      const entry: CacheEntry = {
        cacheKey,
        jobId: "job-1",
        jobType: "test",
        data: { result: "success" },
        hash: "hash123",
        compressed: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        version: { schemaVersion: 1 },
      };

      await backend.set(cacheKey, entry);
      let retrieved = await backend.get(cacheKey);
      expect(retrieved).toBeDefined();

      await backend.delete(cacheKey);
      retrieved = await backend.get(cacheKey);
      expect(retrieved).toBeNull();
    });

    it("should delete multiple entries", async () => {
      const keys = ["cache:test:1", "cache:test:2", "cache:test:3"];

      for (const key of keys) {
        const entry: CacheEntry = {
          cacheKey: key,
          jobId: "job-1",
          jobType: "test",
          data: { result: "success" },
          hash: "hash123",
          compressed: false,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          version: { schemaVersion: 1 },
        };
        await backend.set(key, entry);
      }

      await backend.deleteMany(keys);

      for (const key of keys) {
        const retrieved = await backend.get(key);
        expect(retrieved).toBeNull();
      }
    });
  });

  describe("Exists Check", () => {
    it("should check if key exists", async () => {
      const cacheKey = "cache:test:exists";
      const entry: CacheEntry = {
        cacheKey,
        jobId: "job-1",
        jobType: "test",
        data: { result: "success" },
        hash: "hash123",
        compressed: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        version: { schemaVersion: 1 },
      };

      let exists = await backend.exists(cacheKey);
      expect(exists).toBe(false);

      await backend.set(cacheKey, entry);
      exists = await backend.exists(cacheKey);
      expect(exists).toBe(true);
    });
  });

  describe("Pattern Matching", () => {
    it("should get entries by pattern", async () => {
      const keys = [
        "cache:data-processing:hash1",
        "cache:data-processing:hash2",
        "cache:ai-computation:hash3",
      ];

      for (const key of keys) {
        const entry: CacheEntry = {
          cacheKey: key,
          jobId: "job-1",
          jobType: key.split(":")[1],
          data: { result: "success" },
          hash: key.split(":")[2],
          compressed: false,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          version: { schemaVersion: 1 },
        };
        await backend.set(key, entry);
      }

      const results = await backend.getByPattern("cache:data-processing:*");
      expect(results).toHaveLength(2);
      expect(results[0].jobType).toBe("data-processing");
    });
  });

  describe("Tag-based Clearing", () => {
    it("should clear entries by tags", async () => {
      const cacheKey1 = "cache:test:tag1";
      const cacheKey2 = "cache:test:tag2";

      const entry1: CacheEntry = {
        cacheKey: cacheKey1,
        jobId: "job-1",
        jobType: "test",
        data: { result: "success" },
        hash: "hash123",
        compressed: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        version: { schemaVersion: 1 },
        tags: ["production", "critical"],
      };

      const entry2: CacheEntry = {
        cacheKey: cacheKey2,
        jobId: "job-2",
        jobType: "test",
        data: { result: "success" },
        hash: "hash456",
        compressed: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        version: { schemaVersion: 1 },
        tags: ["development"],
      };

      await backend.set(cacheKey1, entry1);
      await backend.set(cacheKey2, entry2);

      const cleared = await backend.clearByTags(["production"]);
      expect(cleared).toBe(1);

      const retrieved1 = await backend.get(cacheKey1);
      const retrieved2 = await backend.get(cacheKey2);

      expect(retrieved1).toBeNull();
      expect(retrieved2).toBeDefined();
    });
  });

  describe("Job Type Clearing", () => {
    it("should clear entries by job type", async () => {
      const jobType = "data-processing";
      const keys = [
        "cache:data-processing:hash1",
        "cache:data-processing:hash2",
        "cache:ai-computation:hash3",
      ];

      for (const key of keys) {
        const entry: CacheEntry = {
          cacheKey: key,
          jobId: "job-1",
          jobType: key.split(":")[1],
          data: { result: "success" },
          hash: key.split(":")[2],
          compressed: false,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          version: { schemaVersion: 1 },
        };
        await backend.set(key, entry);
      }

      const cleared = await backend.clearByJobType(jobType);
      expect(cleared).toBe(2);

      const check1 = await backend.exists("cache:data-processing:hash1");
      const check3 = await backend.exists("cache:ai-computation:hash3");

      expect(check1).toBe(false);
      expect(check3).toBe(true);
    });
  });

  describe("Metrics", () => {
    it("should track cache metrics", async () => {
      const cacheKey = "cache:test:metrics";
      const entry: CacheEntry = {
        cacheKey,
        jobId: "job-1",
        jobType: "test",
        data: { result: "success" },
        hash: "hash123",
        compressed: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        version: { schemaVersion: 1 },
      };

      await backend.set(cacheKey, entry);

      const metrics = await backend.getMetrics();
      expect(metrics.entryCount).toBe(1);
      expect(metrics.size).toBeGreaterThan(0);
      expect(metrics.avgEntrySize).toBeGreaterThan(0);
    });
  });

  describe("Version Management", () => {
    it("should set and get versions", async () => {
      const cacheKey = "cache:test:version";
      const version: CacheVersionDto = {
        jobDefinitionHash: "hash-v1",
        schemaVersion: 1,
        providerVersion: "v1",
      };

      await backend.setVersion(cacheKey, version);
      const retrieved = await backend.getVersion(cacheKey);

      expect(retrieved).toBeDefined();
      expect(retrieved?.schemaVersion).toBe(1);
    });

    it("should invalidate old versions", async () => {
      const jobType = "data-processing";
      const keys = [`cache:${jobType}:hash1`, `cache:${jobType}:hash2`];

      for (const key of keys) {
        const entry: CacheEntry = {
          cacheKey: key,
          jobId: "job-1",
          jobType,
          data: { result: "success" },
          hash: key.split(":")[2],
          compressed: false,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          version: { schemaVersion: 1 },
        };
        await backend.set(key, entry);
        await backend.setVersion(key, { schemaVersion: 1 });
      }

      const currentVersion: CacheVersionDto = { schemaVersion: 2 };
      const invalidated = await backend.invalidateOldVersions(
        jobType,
        currentVersion,
      );

      expect(invalidated).toBe(2);
    });
  });

  describe("Clear All", () => {
    it("should clear all entries", async () => {
      const cacheKey1 = "cache:test:1";
      const cacheKey2 = "cache:test:2";

      const entry: CacheEntry = {
        cacheKey: cacheKey1,
        jobId: "job-1",
        jobType: "test",
        data: { result: "success" },
        hash: "hash123",
        compressed: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        version: { schemaVersion: 1 },
      };

      await backend.set(cacheKey1, entry);
      entry.cacheKey = cacheKey2;
      await backend.set(cacheKey2, entry);

      await backend.clear();

      const retrieved1 = await backend.get(cacheKey1);
      const retrieved2 = await backend.get(cacheKey2);

      expect(retrieved1).toBeNull();
      expect(retrieved2).toBeNull();
    });
  });

  describe("Health Check", () => {
    it("should report healthy status", async () => {
      const isHealthy = await backend.health();
      expect(isHealthy).toBe(true);
    });
  });
});
