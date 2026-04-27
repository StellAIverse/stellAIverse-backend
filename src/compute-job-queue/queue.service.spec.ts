import { Test, TestingModule } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bull";
import { Queue, Job } from "bull";
import { QueueService, ComputeJobData } from "./queue.service";
import { RetryPolicyService } from "./retry-policy.service";

describe("QueueService", () => {
  let service: QueueService;
  let computeQueue: Queue<ComputeJobData>;
  let deadLetterQueue: Queue<ComputeJobData>;

  const mockComputeQueue = {
    add: jest.fn(),
    getJob: jest.fn(),
    getWaitingCount: jest.fn(),
    getActiveCount: jest.fn(),
    getCompletedCount: jest.fn(),
    getFailedCount: jest.fn(),
    getDelayedCount: jest.fn(),
    getFailed: jest.fn(),
    clean: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    empty: jest.fn(),
    client: {
      ping: jest.fn(),
    },
  };

  const mockDeadLetterQueue = {
    add: jest.fn(),
    getWaitingCount: jest.fn(),
    getJobs: jest.fn(),
  };

  const mockRetryPolicyService = {
    getPolicy: jest.fn((jobType: string) => {
      if (jobType === "batch-operation") {
        return {
          maxAttempts: 5,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
        };
      }

      return {
        maxAttempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      };
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        {
          provide: getQueueToken("compute-jobs"),
          useValue: mockComputeQueue,
        },
        {
          provide: getQueueToken("dead-letter-queue"),
          useValue: mockDeadLetterQueue,
        },
        {
          provide: RetryPolicyService,
          useValue: mockRetryPolicyService,
        },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
    computeQueue = module.get<Queue<ComputeJobData>>(
      getQueueToken("compute-jobs"),
    );
    deadLetterQueue = module.get<Queue<ComputeJobData>>(
      getQueueToken("dead-letter-queue"),
    );

    jest.clearAllMocks();
  });

  describe("addComputeJob", () => {
    it("should add a job to the compute queue", async () => {
      const jobData: ComputeJobData = {
        type: "test",
        payload: { data: "test" },
        userId: "user123",
      };

      const mockJob = {
        id: "job123",
        data: jobData,
      } as Job<ComputeJobData>;

      mockComputeQueue.add.mockResolvedValue(mockJob);

      const result = await service.addComputeJob(jobData);

      expect(result).toBe(mockJob);
      expect(mockComputeQueue.add).toHaveBeenCalledWith(
        "test",
        jobData,
        expect.objectContaining({
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
        }),
      );
    });

    it("should apply priority and group key attributes", async () => {
      const jobData: ComputeJobData = {
        type: "batch-operation",
        payload: { items: [1, 2, 3] },
        priority: 1,
        groupKey: "bulk-001",
      };

      const mockJob = {
        id: "job-priority-1",
        data: jobData,
      } as Job<ComputeJobData>;

      mockComputeQueue.add.mockResolvedValue(mockJob);

      await service.addComputeJob(jobData);

      expect(mockComputeQueue.add).toHaveBeenCalledWith(
        "batch-operation",
        expect.objectContaining({
          groupKey: "bulk-001",
          metadata: expect.objectContaining({
            groupKey: "bulk-001",
          }),
        }),
        expect.objectContaining({
          priority: 1,
        }),
      );
    });

    it("should configure retries based on job type policy", async () => {
      const jobData: ComputeJobData = {
        type: "batch-operation",
        payload: { items: [] },
      };

      const mockJob = {
        id: "job-retry-1",
        data: jobData,
      } as Job<ComputeJobData>;

      mockComputeQueue.add.mockResolvedValue(mockJob);

      await service.addComputeJob(jobData);

      expect(mockRetryPolicyService.getPolicy).toHaveBeenCalledWith(
        "batch-operation",
      );
      expect(mockComputeQueue.add).toHaveBeenCalledWith(
        "batch-operation",
        expect.any(Object),
        expect.objectContaining({
          attempts: 5,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
        }),
      );
    });

    it("should preserve priority ordering configuration (lower is higher priority)", async () => {
      const highPriorityJob = {
        id: "job-high",
        data: { type: "batch-operation", payload: {}, priority: 1 },
      } as unknown as Job<ComputeJobData>;
      const lowPriorityJob = {
        id: "job-low",
        data: { type: "batch-operation", payload: {}, priority: 10 },
      } as unknown as Job<ComputeJobData>;

      mockComputeQueue.add
        .mockResolvedValueOnce(highPriorityJob)
        .mockResolvedValueOnce(lowPriorityJob);

      await service.addComputeJob({
        type: "batch-operation",
        payload: {},
        priority: 1,
      });
      await service.addComputeJob({
        type: "batch-operation",
        payload: {},
        priority: 10,
      });

      const firstCallOptions = mockComputeQueue.add.mock.calls[0][2];
      const secondCallOptions = mockComputeQueue.add.mock.calls[1][2];

      expect(firstCallOptions.priority).toBeLessThan(
        secondCallOptions.priority,
      );
    });
  });

  describe("getQueueStats", () => {
    it("should return queue statistics", async () => {
      mockComputeQueue.getWaitingCount.mockResolvedValue(5);
      mockComputeQueue.getActiveCount.mockResolvedValue(3);
      mockComputeQueue.getCompletedCount.mockResolvedValue(100);
      mockComputeQueue.getFailedCount.mockResolvedValue(2);
      mockComputeQueue.getDelayedCount.mockResolvedValue(1);
      mockDeadLetterQueue.getWaitingCount.mockResolvedValue(0);

      const result = await service.getQueueStats();

      expect(result).toEqual({
        compute: {
          waiting: 5,
          active: 3,
          completed: 100,
          failed: 2,
          delayed: 1,
        },
        deadLetter: {
          count: 0,
        },
      });
    });
  });

  describe("isRedisHealthy", () => {
    it("should return true when Redis ping succeeds", async () => {
      mockComputeQueue.client.ping.mockResolvedValue("PONG");

      const result = await service.isRedisHealthy();

      expect(result).toBe(true);
      expect(mockComputeQueue.client.ping).toHaveBeenCalled();
    });

    it("should return false when Redis ping fails", async () => {
      mockComputeQueue.client.ping.mockRejectedValue(
        new Error("Connection failed"),
      );

      const result = await service.isRedisHealthy();

      expect(result).toBe(false);
    });

    it("should return false when client is null", async () => {
      mockComputeQueue.client = null;

      const result = await service.isRedisHealthy();

      expect(result).toBe(false);
    });
  });

  describe("addDelayedJob", () => {
    it("should add a delayed job", async () => {
      const jobData: ComputeJobData = {
        type: "delayed-test",
        payload: { data: "test" },
      };

      const mockJob = {
        id: "job456",
        data: jobData,
      } as Job<ComputeJobData>;

      mockComputeQueue.add.mockResolvedValue(mockJob);

      const result = await service.addDelayedJob(jobData, 5000);

      expect(result).toBe(mockJob);
      expect(mockComputeQueue.add).toHaveBeenCalledWith(
        "delayed-test",
        jobData,
        expect.objectContaining({ delay: 5000 }),
      );
    });
  });

  describe("getJob", () => {
    it("should return a job by ID", async () => {
      const mockJob = { id: "job123" } as Job<ComputeJobData>;
      mockComputeQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.getJob("job123");

      expect(result).toBe(mockJob);
      expect(mockComputeQueue.getJob).toHaveBeenCalledWith("job123");
    });
  });

  describe("removeJob", () => {
    it("should remove a job", async () => {
      const mockJob = {
        id: "job123",
        remove: jest.fn().mockResolvedValue(undefined),
      } as unknown as Job<ComputeJobData>;

      mockComputeQueue.getJob.mockResolvedValue(mockJob);

      await service.removeJob("job123");

      expect(mockJob.remove).toHaveBeenCalled();
    });
  });

  describe("pauseQueue", () => {
    it("should pause the queue", async () => {
      mockComputeQueue.pause.mockResolvedValue(undefined);

      await service.pauseQueue();

      expect(mockComputeQueue.pause).toHaveBeenCalled();
    });
  });

  describe("resumeQueue", () => {
    it("should resume the queue", async () => {
      mockComputeQueue.resume.mockResolvedValue(undefined);

      await service.resumeQueue();

      expect(mockComputeQueue.resume).toHaveBeenCalled();
    });
  });
});
