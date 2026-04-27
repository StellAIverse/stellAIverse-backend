import { Test, TestingModule } from "@nestjs/testing";
import { QueueService } from "./queue.service";
import { getQueueToken } from "@nestjs/bull";
import { RetryPolicyService } from "./retry-policy.service";

describe("QueueService - Job Control", () => {
  let service: QueueService;
  let mockComputeQueue: any;
  let mockDeadLetterQueue: any;
  let mockJob: any;

  beforeEach(async () => {
    mockJob = {
      id: "test-job-123",
      data: {
        type: "data-processing",
        payload: { test: "data" },
        metadata: {},
      },
      attemptsMade: 0,
      timestamp: Date.now(),
      getState: jest.fn(),
      moveToDelayed: jest.fn(),
      promote: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      progress: jest.fn().mockReturnValue(0),
    };

    mockComputeQueue = {
      add: jest.fn(),
      getJob: jest.fn(),
      getWaitingCount: jest.fn().mockResolvedValue(5),
      getActiveCount: jest.fn().mockResolvedValue(2),
      getCompletedCount: jest.fn().mockResolvedValue(100),
      getFailedCount: jest.fn().mockResolvedValue(3),
      getDelayedCount: jest.fn().mockResolvedValue(1),
      client: {
        ping: jest.fn().mockResolvedValue("PONG"),
      },
    };

    mockDeadLetterQueue = {
      add: jest.fn(),
      getWaitingCount: jest.fn().mockResolvedValue(0),
    };

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
          useValue: {
            getPolicy: jest.fn().mockReturnValue({
              maxAttempts: 3,
              backoff: { type: "exponential", delay: 2000 },
            }),
          },
        },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
  });

  describe("getDetailedJobStatus", () => {
    it("should return detailed job status", async () => {
      (mockJob.getState as jest.Mock).mockResolvedValue("active");
      mockComputeQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.getDetailedJobStatus("test-job-123");

      expect(result).toMatchObject({
        id: "test-job-123",
        type: "data-processing",
        state: "active",
        attemptsMade: 0,
        createdAt: expect.any(String),
        processedOn: undefined,
        finishedOn: undefined,
        result: undefined,
        failedReason: undefined,
        metadata: {},
      });
    });

    it("should return null for non-existent job", async () => {
      mockComputeQueue.getJob.mockResolvedValue(null);

      const result = await service.getDetailedJobStatus("non-existent");

      expect(result).toBeNull();
    });

    it("should include result for completed jobs", async () => {
      const completedJob = {
        ...mockJob,
        returnvalue: { success: true, data: "processed" },
      };
      (completedJob.getState as jest.Mock).mockResolvedValue("completed");
      mockComputeQueue.getJob.mockResolvedValue(completedJob);

      const result = await service.getDetailedJobStatus("test-job-123");

      expect(result.result).toEqual({ success: true, data: "processed" });
    });
  });

  describe("pauseJob", () => {
    it("should pause a waiting job", async () => {
      (mockJob.getState as jest.Mock).mockResolvedValue("waiting");
      mockComputeQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.pauseJob("test-job-123");

      expect(mockJob.moveToDelayed).toHaveBeenCalledWith(
        expect.any(Number),
        true,
      );
      expect(mockJob.update).toHaveBeenCalledWith({
        type: "data-processing",
        payload: { test: "data" },
        metadata: {
          paused: true,
          pausedAt: expect.any(String),
          previousState: "waiting",
        },
      });
      expect(result).toEqual({
        previousState: "waiting",
        newState: "paused",
      });
    });

    it("should pause a delayed job", async () => {
      (mockJob.getState as jest.Mock).mockResolvedValue("delayed");
      mockComputeQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.pauseJob("test-job-123");

      expect(result).toEqual({
        previousState: "delayed",
        newState: "paused",
      });
    });

    it("should throw error for non-existent job", async () => {
      mockComputeQueue.getJob.mockResolvedValue(null);

      await expect(service.pauseJob("non-existent")).rejects.toThrow(
        "Job non-existent not found",
      );
    });

    it("should throw error when pausing active job", async () => {
      (mockJob.getState as jest.Mock).mockResolvedValue("active");
      mockComputeQueue.getJob.mockResolvedValue(mockJob);

      await expect(service.pauseJob("test-job-123")).rejects.toThrow(
        "Cannot pause job in state: active",
      );
    });

    it("should throw error when pausing completed job", async () => {
      (mockJob.getState as jest.Mock).mockResolvedValue("completed");
      mockComputeQueue.getJob.mockResolvedValue(mockJob);

      await expect(service.pauseJob("test-job-123")).rejects.toThrow(
        "Cannot pause job in state: completed",
      );
    });
  });

  describe("resumeJob", () => {
    it("should resume a paused job", async () => {
      const pausedJob = {
        ...mockJob,
        data: {
          ...mockJob.data,
          metadata: {
            paused: true,
            pausedAt: new Date().toISOString(),
            previousState: "waiting",
          },
        },
      };
      mockComputeQueue.getJob.mockResolvedValue(pausedJob);

      const result = await service.resumeJob("test-job-123");

      expect(pausedJob.promote).toHaveBeenCalled();
      expect(pausedJob.update).toHaveBeenCalledWith({
        type: "data-processing",
        payload: { test: "data" },
        metadata: {
          paused: false,
          pausedAt: expect.any(String),
          resumedAt: expect.any(String),
          previousState: undefined,
        },
      });
      expect(result).toEqual({
        previousState: "paused",
        newState: "waiting",
      });
    });

    it("should throw error for non-existent job", async () => {
      mockComputeQueue.getJob.mockResolvedValue(null);

      await expect(service.resumeJob("non-existent")).rejects.toThrow(
        "Job non-existent not found",
      );
    });

    it("should throw error when resuming non-paused job", async () => {
      mockComputeQueue.getJob.mockResolvedValue(mockJob);

      await expect(service.resumeJob("test-job-123")).rejects.toThrow(
        "Job test-job-123 is not paused",
      );
    });
  });

  describe("cancelJob", () => {
    it("should cancel a waiting job", async () => {
      (mockJob.getState as jest.Mock).mockResolvedValue("waiting");
      mockComputeQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.cancelJob("test-job-123");

      expect(mockJob.remove).toHaveBeenCalled();
      expect(result).toEqual({
        previousState: "waiting",
      });
    });

    it("should cancel an active job with warning", async () => {
      (mockJob.getState as jest.Mock).mockResolvedValue("active");
      mockComputeQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.cancelJob("test-job-123");

      expect(mockJob.remove).toHaveBeenCalled();
      expect(result).toEqual({
        previousState: "active",
      });
    });

    it("should throw error for non-existent job", async () => {
      mockComputeQueue.getJob.mockResolvedValue(null);

      await expect(service.cancelJob("non-existent")).rejects.toThrow(
        "Job non-existent not found",
      );
    });

    it("should throw error when cancelling completed job", async () => {
      (mockJob.getState as jest.Mock).mockResolvedValue("completed");
      mockComputeQueue.getJob.mockResolvedValue(mockJob);

      await expect(service.cancelJob("test-job-123")).rejects.toThrow(
        "Cannot cancel completed job test-job-123",
      );
    });

    it("should cancel a failed job", async () => {
      (mockJob.getState as jest.Mock).mockResolvedValue("failed");
      mockComputeQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.cancelJob("test-job-123");

      expect(mockJob.remove).toHaveBeenCalled();
      expect(result).toEqual({
        previousState: "failed",
      });
    });
  });
});
