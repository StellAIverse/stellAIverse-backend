import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bull";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import request from "supertest";
import { Repository } from "typeorm";
import { getRepositoryToken } from "@nestjs/typeorm";

import { IndexerModule } from "../../src/indexer/indexer.module";
import { IndexedEvent } from "../../src/indexer/entities/indexed-event.entity";
import { ScalableIndexerService } from "../../src/indexer/scalable-indexer.service";
import { ShardManagerService } from "../../src/indexer/services/shard-manager.service";
import { BlockCoordinatorService } from "../../src/indexer/services/block-coordinator.service";
import { IndexerQueueService } from "../../src/indexer/queues/indexer-queue.service";
import { IndexerMetricsService } from "../../src/indexer/services/indexer-metrics.service";

describe("Indexer Scalability (e2e)", () => {
  let app: INestApplication;
  let indexerService: ScalableIndexerService;
  let shardManager: ShardManagerService;
  let blockCoordinator: BlockCoordinatorService;
  let queueService: IndexerQueueService;
  let metricsService: IndexerMetricsService;
  let indexedEventRepo: Repository<IndexedEvent>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              INDEXER_RPC_URL: process.env.INDEXER_RPC_URL || "http://localhost:8545",
              INDEXER_INSTANCE_ID: 1,
              INDEXER_IS_COORDINATOR: true,
              INDEXER_SHARD_COUNT: 4,
              INDEXER_RANGE_SIZE: 100,
              INDEXER_CONFIRMATIONS: 1,
              INDEXER_START_BLOCK: 0,
              INDEXER_POLL_INTERVAL_MS: 1000,
              INDEXER_MAX_QUEUE_DEPTH: 10000,
              REDIS_HOST: process.env.REDIS_HOST || "localhost",
              REDIS_PORT: parseInt(process.env.REDIS_PORT || "6379", 10),
              REDIS_DB: 1, // Use different DB for tests
            }),
          ],
        }),
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: () => ({
            type: "sqlite",
            database: ":memory:",
            entities: [IndexedEvent],
            synchronize: true,
            logging: false,
          }),
        }),
        EventEmitterModule.forRoot(),
        BullModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: async (configService: ConfigService) => ({
            redis: {
              host: configService.get("REDIS_HOST", "localhost"),
              port: configService.get("REDIS_PORT", 6379),
              db: configService.get("REDIS_DB", 1),
              maxRetriesPerRequest: null,
              enableReadyCheck: false,
            },
            defaultJobOptions: {
              attempts: 2,
              backoff: {
                type: "exponential",
                delay: 1000,
              },
            },
          }),
          inject: [ConfigService],
        }),
        IndexerModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    indexerService = moduleFixture.get<ScalableIndexerService>(ScalableIndexerService);
    shardManager = moduleFixture.get<ShardManagerService>(ShardManagerService);
    blockCoordinator = moduleFixture.get<BlockCoordinatorService>(BlockCoordinatorService);
    queueService = moduleFixture.get<IndexerQueueService>(IndexerQueueService);
    metricsService = moduleFixture.get<IndexerMetricsService>(IndexerMetricsService);
    indexedEventRepo = moduleFixture.get<Repository<IndexedEvent>>(
      getRepositoryToken(IndexedEvent)
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up database
    await indexedEventRepo.clear();
    // Reset metrics
    await metricsService.resetMetrics();
  });

  describe("Sharding", () => {
    it("should correctly assign shards to blocks", async () => {
      const testCases = [
        { block: 0, expectedShard: "shard-0" },
        { block: 1, expectedShard: "shard-1" },
        { block: 2, expectedShard: "shard-2" },
        { block: 3, expectedShard: "shard-3" },
        { block: 4, expectedShard: "shard-0" }, // Wraps around
        { block: 100, expectedShard: "shard-0" },
        { block: 101, expectedShard: "shard-1" },
      ];

      for (const { block, expectedShard } of testCases) {
        const shardId = shardManager.getShardForBlock(block);
        expect(shardId).toBe(expectedShard);
      }
    });

    it("should initialize shards with correct block ranges", async () => {
      await shardManager.initializeShards(0, 10000);
      
      const stats = await shardManager.getShardStats();
      expect(stats.totalShards).toBe(4); // Default 4 shards
      expect(stats.unassignedShards).toBe(4);
    });

    it("should support shard assignment to instances", async () => {
      await shardManager.initializeShards(0, 10000);
      
      // Assign shard to instance
      await shardManager.assignShardToInstance("shard-0", 1);
      
      const instanceShards = await shardManager.getInstanceShards(1);
      expect(instanceShards).toContain("shard-0");
      
      const stats = await shardManager.getShardStats();
      expect(stats.activeShards).toBe(1);
    });

    it("should handle shard release", async () => {
      await shardManager.initializeShards(0, 10000);
      await shardManager.assignShardToInstance("shard-0", 1);
      
      await shardManager.releaseShard("shard-0");
      
      const instanceShards = await shardManager.getInstanceShards(1);
      expect(instanceShards).not.toContain("shard-0");
    });
  });

  describe("Block Range Coordination", () => {
    it("should initialize block ranges correctly", async () => {
      await blockCoordinator.initializeRanges(0, 5000);
      
      const stats = await blockCoordinator.getRangeStats();
      expect(stats.total).toBe(50); // 5000 blocks / 100 range size
      expect(stats.pending).toBe(50);
    });

    it("should allow instances to acquire block ranges", async () => {
      await blockCoordinator.initializeRanges(0, 1000);
      
      const range = await blockCoordinator.acquireBlockRange(1);
      
      expect(range).not.toBeNull();
      expect(range?.instanceId).toBe(1);
      
      const stats = await blockCoordinator.getRangeStats();
      expect(stats.processing).toBe(1);
      expect(stats.pending).toBe(9);
    });

    it("should track range completion", async () => {
      await blockCoordinator.initializeRanges(0, 1000);
      
      const range = await blockCoordinator.acquireBlockRange(1);
      expect(range).not.toBeNull();
      
      await blockCoordinator.markRangeComplete(range!);
      
      const stats = await blockCoordinator.getRangeStats();
      expect(stats.completed).toBe(1);
      expect(stats.processing).toBe(0);
    });

    it("should handle concurrent range acquisition", async () => {
      await blockCoordinator.initializeRanges(0, 1000);
      
      // Simulate multiple instances acquiring ranges
      const ranges = await Promise.all([
        blockCoordinator.acquireBlockRange(1),
        blockCoordinator.acquireBlockRange(2),
        blockCoordinator.acquireBlockRange(3),
      ]);
      
      const acquiredRanges = ranges.filter((r) => r !== null);
      expect(acquiredRanges.length).toBe(3);
      
      // Verify all ranges are unique
      const rangeKeys = acquiredRanges.map((r) => `${r!.fromBlock}-${r!.toBlock}`);
      const uniqueKeys = new Set(rangeKeys);
      expect(uniqueKeys.size).toBe(3);
    });
  });

  describe("Queue Management", () => {
    it("should queue block ranges for processing", async () => {
      const range = {
        fromBlock: 0,
        toBlock: 100,
        shardId: "shard-0",
        instanceId: 1,
      };
      
      await queueService.addBlockRange(range);
      
      const stats = await queueService.getAllQueueStats();
      expect(stats.blocks.waiting + stats.blocks.delayed).toBeGreaterThan(0);
    });

    it("should support pausing and resuming queues", async () => {
      await queueService.pauseAll();
      
      // Add a range while paused
      const range = {
        fromBlock: 0,
        toBlock: 100,
        shardId: "shard-0",
        instanceId: 1,
      };
      await queueService.addBlockRange(range);
      
      const pausedStats = await queueService.getAllQueueStats();
      expect(pausedStats.blocks.waiting).toBeGreaterThan(0);
      
      await queueService.resumeAll();
    });

    it("should track queue health", async () => {
      const health = await queueService.isHealthy();
      
      expect(health).toHaveProperty("healthy");
      expect(health).toHaveProperty("issues");
      expect(Array.isArray(health.issues)).toBe(true);
    });
  });

  describe("Metrics and Monitoring", () => {
    it("should track event processing metrics", async () => {
      await metricsService.recordEventProcessed(100, true);
      await metricsService.recordEventProcessed(150, true);
      await metricsService.recordEventProcessed(200, false);
      
      const metrics = metricsService.getMetrics();
      
      expect(metrics.totalEventsIndexed).toBe(3);
      expect(metrics.failedEvents).toBe(1);
      expect(metrics.averageProcessingTime).toBeGreaterThan(0);
    });

    it("should calculate throughput statistics", async () => {
      // Simulate some processing
      for (let i = 0; i < 10; i++) {
        await metricsService.recordEventProcessed(100 + i * 10, true);
      }
      
      const stats = metricsService.getThroughputStats(60);
      
      expect(stats).toHaveProperty("avgEventsPerSecond");
      expect(stats).toHaveProperty("peakEventsPerSecond");
      expect(stats).toHaveProperty("totalEvents");
    });

    it("should provide health status based on metrics", async () => {
      const health = metricsService.getHealthStatus();
      
      expect(health).toHaveProperty("healthy");
      expect(health).toHaveProperty("status");
      expect(health).toHaveProperty("reasons");
      expect(["healthy", "degraded", "unhealthy"]).toContain(health.status);
    });

    it("should export Prometheus-formatted metrics", async () => {
      await metricsService.recordEventProcessed(100, true);
      
      const prometheusMetrics = metricsService.getPrometheusMetrics();
      
      expect(prometheusMetrics).toContain("indexer_events_total");
      expect(prometheusMetrics).toContain("indexer_events_per_second");
      expect(prometheusMetrics).toContain("indexer_queue_depth");
    });
  });

  describe("API Endpoints", () => {
    it("should return health status", async () => {
      const response = await request(app.getHttpServer())
        .get("/indexer/health")
        .expect(200);
      
      expect(response.body).toHaveProperty("instanceId");
      expect(response.body).toHaveProperty("isHealthy");
      expect(response.body).toHaveProperty("lagBlocks");
    });

    it("should return metrics", async () => {
      const response = await request(app.getHttpServer())
        .get("/indexer/metrics")
        .expect(200);
      
      expect(response.body).toHaveProperty("metrics");
      expect(response.body).toHaveProperty("prometheus");
    });

    it("should return shard statistics", async () => {
      await shardManager.initializeShards(0, 10000);
      
      const response = await request(app.getHttpServer())
        .get("/indexer/shards")
        .expect(200);
      
      expect(response.body).toHaveProperty("totalShards");
      expect(response.body.totalShards).toBe(4);
    });

    it("should support pausing and resuming via API", async () => {
      await request(app.getHttpServer())
        .post("/indexer/pause")
        .expect(200);
      
      await request(app.getHttpServer())
        .post("/indexer/resume")
        .expect(200);
    });
  });

  describe("Load Testing - 10x Throughput", () => {
    it("should handle high volume of block ranges", async () => {
      const startTime = Date.now();
      const numRanges = 100; // Simulate 100 block ranges
      
      await blockCoordinator.initializeRanges(0, numRanges * 100);
      
      // Acquire multiple ranges concurrently
      const acquisitionPromises = [];
      for (let i = 0; i < 5; i++) {
        acquisitionPromises.push(blockCoordinator.acquireBlockRange(i + 1));
      }
      
      const ranges = await Promise.all(acquisitionPromises);
      const acquiredRanges = ranges.filter((r) => r !== null);
      
      expect(acquiredRanges.length).toBe(5);
      
      const duration = Date.now() - startTime;
      
      // Should acquire ranges quickly (< 5 seconds for 100 ranges setup)
      expect(duration).toBeLessThan(5000);
    });

    it("should handle concurrent event ingestion", async () => {
      const events = [];
      const numEvents = 1000;
      
      // Generate test events
      for (let i = 0; i < numEvents; i++) {
        events.push({
          blockNumber: String(Math.floor(i / 10)),
          blockHash: `0xhash${Math.floor(i / 10)}`,
          txHash: `0xtx${i}`,
          logIndex: i % 10,
          address: `0x${i.toString(16).padStart(40, "0")}`,
          topic0: "0xEventSignature",
          data: "0x",
          topics: [],
          shardId: `shard-${i % 4}`,
        });
      }
      
      const startTime = Date.now();
      
      // Process events in batches
      const batchSize = 100;
      const batchPromises = [];
      
      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        batchPromises.push(queueService.addEventBatch(batch));
      }
      
      await Promise.all(batchPromises);
      
      const duration = Date.now() - startTime;
      const eventsPerSecond = (numEvents / duration) * 1000;
      
      // Should achieve at least 100 events/second ingestion rate
      expect(eventsPerSecond).toBeGreaterThan(100);
      
      // Verify queue stats
      const stats = await queueService.getAllQueueStats();
      expect(stats.events.waiting + stats.events.delayed).toBeGreaterThan(0);
    });

    it("should maintain performance under load", async () => {
      // Initialize a large range
      await blockCoordinator.initializeRanges(0, 100000);
      
      const startTime = Date.now();
      
      // Simulate multiple instances working concurrently
      const instancePromises = [];
      for (let instanceId = 1; instanceId <= 5; instanceId++) {
        instancePromises.push(
          (async () => {
            const ranges = [];
            for (let i = 0; i < 10; i++) {
              const range = await blockCoordinator.acquireBlockRange(instanceId);
              if (range) {
                ranges.push(range);
              }
            }
            return ranges;
          })()
        );
      }
      
      const results = await Promise.all(instancePromises);
      const totalAcquired = results.reduce((sum, ranges) => sum + ranges.length, 0);
      
      const duration = Date.now() - startTime;
      
      // Should acquire 50 ranges (5 instances x 10 ranges) quickly
      expect(totalAcquired).toBe(50);
      expect(duration).toBeLessThan(10000);
      
      // Verify no duplicate ranges were acquired
      const allRanges = results.flat();
      const uniqueRanges = new Set(allRanges.map((r) => `${r.fromBlock}-${r.toBlock}`));
      expect(uniqueRanges.size).toBe(totalAcquired);
    });
  });

  describe("Error Handling and Resilience", () => {
    it("should handle failed ranges with retry logic", async () => {
      await blockCoordinator.initializeRanges(0, 1000);
      
      const range = await blockCoordinator.acquireBlockRange(1);
      expect(range).not.toBeNull();
      
      // Simulate failure by releasing without completion
      await blockCoordinator.releaseBlockRange(range!);
      
      // Range should be available for re-acquisition
      const rangeAgain = await blockCoordinator.acquireBlockRange(2);
      expect(rangeAgain).not.toBeNull();
    });

    it("should track dead letter queue", async () => {
      const jobs = await queueService.getDeadLetterJobs(100);
      
      expect(Array.isArray(jobs)).toBe(true);
    });

    it("should support retrying dead letter jobs", async () => {
      // This test assumes no jobs in DLQ initially
      const result = await queueService.retryDeadLetterJob("non-existent-job");
      
      expect(result).toBe(false);
    });
  });

  describe("Horizontal Scaling Simulation", () => {
    it("should support multiple simulated instances", async () => {
      await shardManager.initializeShards(0, 10000);
      
      // Simulate 3 instances registering
      await shardManager.registerInstance(1, "host1", 3001);
      await shardManager.registerInstance(2, "host2", 3002);
      await shardManager.registerInstance(3, "host3", 3003);
      
      const activeInstances = await shardManager.getActiveInstances();
      expect(activeInstances.length).toBe(3);
      
      // Assign shards to instances
      await shardManager.assignShardToInstance("shard-0", 1);
      await shardManager.assignShardToInstance("shard-1", 2);
      await shardManager.assignShardToInstance("shard-2", 3);
      
      const stats = await shardManager.getShardStats();
      expect(stats.activeShards).toBe(3);
      expect(Object.keys(stats.instanceDistribution).length).toBe(3);
    });

    it("should rebalance shards across instances", async () => {
      await shardManager.initializeShards(0, 10000);
      
      // Assign all shards to one instance initially
      for (let i = 0; i < 4; i++) {
        await shardManager.assignShardToInstance(`shard-${i}`, 1);
      }
      
      // Register additional instances
      await shardManager.registerInstance(2, "host2", 3002);
      await shardManager.registerInstance(3, "host3", 3003);
      
      // Trigger rebalancing
      await shardManager.rebalanceShards();
      
      const stats = await shardManager.getShardStats();
      // All shards should still be active
      expect(stats.activeShards).toBe(4);
    });
  });
});
