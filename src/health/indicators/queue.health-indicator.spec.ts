import { Test, TestingModule } from "@nestjs/testing";
import { QueueHealthIndicator } from "./queue.health-indicator";
import { QueueService } from "../../compute-job-queue/queue.service";
import { HealthCheckError } from "@nestjs/terminus";

describe("QueueHealthIndicator", () => {
  let indicator: QueueHealthIndicator;
  let queueService: QueueService;

  const mockQueueService = {
    isRedisHealthy: jest.fn(),
    getQueueStats: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueHealthIndicator,
        {
          provide: QueueService,
          useValue: mockQueueService,
        },
      ],
    }).compile();

    indicator = module.get<QueueHealthIndicator>(QueueHealthIndicator);
    queueService = module.get<QueueService>(QueueService);

    jest.clearAllMocks();
  });

  describe("isHealthy", () => {
    it("should return healthy status when Redis and queue stats are good", async () => {
      mockQueueService.isRedisHealthy.mockResolvedValue(true);
      mockQueueService.getQueueStats.mockResolvedValue({
        compute: {
          waiting: 0,
          active: 10,
          completed: 100,
          failed: 5,
          delayed: 0,
        },
        deadLetter: {
          count: 0,
        },
      });

      const result = await indicator.isHealthy("queue");

      expect(result.queue.status).toBe("up");
      expect(result.queue.message).toBe("Queue is healthy");
    });

    it("should throw HealthCheckError when Redis is not healthy", async () => {
      mockQueueService.isRedisHealthy.mockResolvedValue(false);

      await expect(indicator.isHealthy("queue")).rejects.toThrow(
        HealthCheckError,
      );
    });

    it("should throw HealthCheckError when failed jobs exceed threshold", async () => {
      mockQueueService.isRedisHealthy.mockResolvedValue(true);
      mockQueueService.getQueueStats.mockResolvedValue({
        compute: {
          waiting: 0,
          active: 10,
          completed: 100,
          failed: 150, // Exceeds threshold of 100
          delayed: 0,
        },
        deadLetter: {
          count: 0,
        },
      });

      await expect(indicator.isHealthy("queue")).rejects.toThrow(
        HealthCheckError,
      );
    });

    it("should throw HealthCheckError when dead letter jobs exceed threshold", async () => {
      mockQueueService.isRedisHealthy.mockResolvedValue(true);
      mockQueueService.getQueueStats.mockResolvedValue({
        compute: {
          waiting: 0,
          active: 10,
          completed: 100,
          failed: 5,
          delayed: 0,
        },
        deadLetter: {
          count: 75, // Exceeds threshold of 50
        },
      });

      await expect(indicator.isHealthy("queue")).rejects.toThrow(
        HealthCheckError,
      );
    });

    it("should throw HealthCheckError when active jobs exceed threshold", async () => {
      mockQueueService.isRedisHealthy.mockResolvedValue(true);
      mockQueueService.getQueueStats.mockResolvedValue({
        compute: {
          waiting: 0,
          active: 1500, // Exceeds threshold of 1000
          completed: 100,
          failed: 5,
          delayed: 0,
        },
        deadLetter: {
          count: 0,
        },
      });

      await expect(indicator.isHealthy("queue")).rejects.toThrow(
        HealthCheckError,
      );
    });

    it("should include stats in the result", async () => {
      const stats = {
        compute: {
          waiting: 5,
          active: 10,
          completed: 100,
          failed: 5,
          delayed: 2,
        },
        deadLetter: {
          count: 1,
        },
      };

      mockQueueService.isRedisHealthy.mockResolvedValue(true);
      mockQueueService.getQueueStats.mockResolvedValue(stats);

      const result = await indicator.isHealthy("queue");

      expect(result.queue.stats).toBeDefined();
      expect(result.queue.stats.compute).toEqual(stats.compute);
      expect(result.queue.stats.deadLetter).toEqual(stats.deadLetter);
    });
  });
});
