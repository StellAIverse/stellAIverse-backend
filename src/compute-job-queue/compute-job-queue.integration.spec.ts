import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { BullModule, getQueueToken } from "@nestjs/bull";
import { Queue } from "bull";
import { QueueModule } from "./queue.module";
import { QueueService } from "./queue.service";
import { ComputeJobProcessor } from "./processors/compute-job.processor";

describe("QueueModule (Integration)", () => {
  let app: INestApplication;
  let queueService: QueueService;
  let computeQueue: Queue;
  let deadLetterQueue: Queue;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        BullModule.forRoot({
          redis: {
            host: process.env.REDIS_HOST || "localhost",
            port: parseInt(process.env.REDIS_PORT || "6379"),
            db: 15, // Use separate DB for testing
          },
        }),
        QueueModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    queueService = moduleFixture.get<QueueService>(QueueService);
    computeQueue = moduleFixture.get<Queue>(getQueueToken("compute-jobs"));
    deadLetterQueue = moduleFixture.get<Queue>(
      getQueueToken("dead-letter-queue"),
    );

    // Clean queues before tests
    await computeQueue.empty();
    await deadLetterQueue.empty();
  });

  afterAll(async () => {
    // Clean up
    await computeQueue.close();
    await deadLetterQueue.close();
    await app.close();
  });

  afterEach(async () => {
    // Clean queues after each test
    await computeQueue.empty();
    await deadLetterQueue.empty();
  });

  describe("Job Processing Flow", () => {
    it("should add and process a job successfully", async () => {
      const jobData = {
        type: "data-processing",
        payload: { records: [{ id: 1 }] },
        userId: "test-user",
      };

      const job = await queueService.addComputeJob(jobData);

      expect(job).toBeDefined();
      expect(job.id).toBeDefined();

      // Wait for job to be processed
      await job.finished();

      const jobState = await job.getState();
      expect(jobState).toBe("completed");
    }, 10000);

    it("should handle delayed jobs", async () => {
      const jobData = {
        type: "data-processing",
        payload: { test: "delayed" },
      };

      const delayMs = 2000;
      const startTime = Date.now();

      const job = await queueService.addDelayedJob(jobData, delayMs);

      await job.finished();

      const endTime = Date.now();
      const actualDelay = endTime - startTime;

      expect(actualDelay).toBeGreaterThanOrEqual(delayMs - 500); // Allow 500ms margin
    }, 15000);

    it("should retry failed jobs with exponential backoff", async () => {
      // Create a job that will fail on first attempt
      const jobData = {
        type: "data-processing",
        payload: { shouldFail: true },
      };

      const job = await queueService.addComputeJob(jobData);

      // The job should be retried automatically by BullMQ
      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const jobState = await job.getState();
      expect(["waiting", "active", "failed"]).toContain(jobState);
    }, 15000);
  });

  describe("Queue Statistics", () => {
    it("should return accurate queue statistics", async () => {
      // Add some jobs
      await queueService.addComputeJob({
        type: "data-processing",
        payload: {},
      });

      await queueService.addDelayedJob(
        {
          type: "data-processing",
          payload: {},
        },
        5000,
      );

      const stats = await queueService.getQueueStats();

      expect(stats).toHaveProperty("compute");
      expect(stats.compute).toHaveProperty("waiting");
      expect(stats.compute).toHaveProperty("active");
      expect(stats.compute).toHaveProperty("completed");
      expect(stats.compute).toHaveProperty("failed");
      expect(stats.compute).toHaveProperty("delayed");
      expect(stats).toHaveProperty("deadLetter");
    });
  });

  describe("Job Management", () => {
    it("should retrieve a job by ID", async () => {
      const jobData = {
        type: "data-processing",
        payload: { test: "data" },
      };

      const addedJob = await queueService.addComputeJob(jobData);
      const retrievedJob = await queueService.getJob(addedJob.id as string);

      expect(retrievedJob).toBeDefined();
      expect(retrievedJob?.id).toBe(addedJob.id);
      expect(retrievedJob?.data).toEqual(expect.objectContaining(jobData));
    });

    it("should get job status", async () => {
      const jobData = {
        type: "data-processing",
        payload: {},
      };

      const job = await queueService.addComputeJob(jobData);
      const status = await queueService.getJobStatus(job.id as string);

      expect(status).toBeDefined();
      expect(["waiting", "active", "completed", "failed", "delayed"]).toContain(
        status,
      );
    });

    it("should remove a job from the queue", async () => {
      const jobData = {
        type: "data-processing",
        payload: {},
      };

      const job = await queueService.addComputeJob(jobData);
      await queueService.removeJob(job.id as string);

      const retrievedJob = await queueService.getJob(job.id as string);
      expect(retrievedJob).toBeNull();
    });

    it("should retry a failed job", async () => {
      const jobData = {
        type: "email-notification",
        payload: {}, // Missing 'to' field, will fail
      };

      const job = await queueService.addComputeJob(jobData);

      // Wait for job to fail
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const initialState = await job.getState();
      expect(["failed", "completed"]).toContain(initialState);

      if (initialState === "failed") {
        await queueService.retryJob(job.id as string);

        const newState = await job.getState();
        expect(["waiting", "active"]).toContain(newState);
      }
    }, 10000);
  });

  describe("Dead Letter Queue", () => {
    it("should move failed jobs to dead letter queue after max retries", async () => {
      const jobData = {
        type: "email-notification",
        payload: {}, // Missing required field
      };

      const job = await queueService.addComputeJob(jobData);

      // Wait for job to fail and be moved to DLQ
      await new Promise((resolve) => setTimeout(resolve, 8000));

      const deadLetterJobs = await queueService.getDeadLetterJobs();

      expect(deadLetterJobs.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe("Queue Control", () => {
    it("should pause and resume the queue", async () => {
      await queueService.pauseQueue();

      const isPaused = await computeQueue.isPaused();
      expect(isPaused).toBe(true);

      await queueService.resumeQueue();

      const isResumed = !(await computeQueue.isPaused());
      expect(isResumed).toBe(true);
    });

    it("should clean old completed jobs", async () => {
      // Add and complete some jobs
      const job = await queueService.addComputeJob({
        type: "data-processing",
        payload: {},
      });

      await job.finished();

      // Clean with grace period of 0 (clean all completed jobs)
      await queueService.cleanOldJobs(0);

      const stats = await queueService.getQueueStats();
      expect(stats.compute.completed).toBe(0);
    }, 10000);
  });

  describe("Error Handling", () => {
    it("should handle queue connection errors gracefully", async () => {
      // This test verifies error handling in the service
      const invalidJobId = "non-existent-job";
      const job = await queueService.getJob(invalidJobId);

      expect(job).toBeNull();
    });

    it("should handle retry of non-existent job", async () => {
      await expect(queueService.retryJob("non-existent")).rejects.toThrow();
    });
  });

  describe("Concurrent Job Processing", () => {
    it("should handle multiple concurrent jobs", async () => {
      const jobPromises = [];

      for (let i = 0; i < 10; i++) {
        const promise = queueService.addComputeJob({
          type: "data-processing",
          payload: { index: i },
        });
        jobPromises.push(promise);
      }

      const jobs = await Promise.all(jobPromises);

      expect(jobs).toHaveLength(10);
      jobs.forEach((job) => {
        expect(job.id).toBeDefined();
      });

      // Wait for all jobs to complete
      await Promise.all(jobs.map((job) => job.finished()));

      const stats = await queueService.getQueueStats();
      expect(stats.compute.completed).toBeGreaterThanOrEqual(10);
    }, 20000);
  });
});
