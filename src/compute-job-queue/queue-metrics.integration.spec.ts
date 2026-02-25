import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { QueueModule } from "./compute-job-queue.module";
import { QueueService } from "./queue.service";
import { 
  register, 
  jobDuration, 
  jobSuccessTotal, 
  jobFailureTotal, 
  queueLength 
} from "../config/metrics";

describe("Queue Metrics Integration", () => {
  let app: INestApplication;
  let queueService: QueueService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [QueueModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    queueService = moduleFixture.get<QueueService>(QueueService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Reset metrics before each test
    register.resetMetrics();
  });

  describe("Job Duration Metrics", () => {
    it("should record job duration for successful jobs", async () => {
      // Add a simple job
      const job = await queueService.addComputeJob({
        type: "data-processing",
        payload: { records: [{ id: 1, name: "Test" }] },
      });

      // Wait for job to complete
      await job.finished();

      // Get metrics
      const metrics = await register.metrics();
      
      // Verify job_duration_seconds histogram exists
      expect(metrics).toContain("stellaiverse_job_duration_seconds");
      expect(metrics).toContain('job_type="data-processing"');
      expect(metrics).toContain('status="success"');
    });

    it("should record job duration for failed jobs", async () => {
      // Add a job that will fail (email without recipient)
      const job = await queueService.addComputeJob({
        type: "email-notification",
        payload: { subject: "Test" }, // Missing 'to' field
      });

      // Wait for job to fail
      try {
        await job.finished();
      } catch (error) {
        // Expected to fail
      }

      // Get metrics
      const metrics = await register.metrics();
      
      // Verify failure metrics
      expect(metrics).toContain("stellaiverse_job_duration_seconds");
      expect(metrics).toContain('job_type="email-notification"');
      expect(metrics).toContain('status="failed"');
    });
  });

  describe("Job Success/Failure Counters", () => {
    it("should increment success counter for completed jobs", async () => {
      // Get initial count
      const initialMetrics = await register.getSingleMetricAsString("stellaiverse_job_success_total");
      
      // Add and complete a job
      const job = await queueService.addComputeJob({
        type: "data-processing",
        payload: { records: [{ id: 1 }] },
      });

      await job.finished();

      // Get updated metrics
      const metrics = await register.metrics();
      
      // Verify success counter incremented
      expect(metrics).toContain("stellaiverse_job_success_total");
      expect(metrics).toContain('job_type="data-processing"');
    });

    it("should increment failure counter with reason for failed jobs", async () => {
      // Add a job that will fail
      const job = await queueService.addComputeJob({
        type: "email-notification",
        payload: { subject: "Test" }, // Missing required field
      });

      try {
        await job.finished();
      } catch (error) {
        // Expected to fail
      }

      // Get metrics
      const metrics = await register.metrics();
      
      // Verify failure counter with reason
      expect(metrics).toContain("stellaiverse_job_failure_total");
      expect(metrics).toContain('job_type="email-notification"');
      expect(metrics).toContain('failure_reason="validation"');
    });
  });

  describe("Queue Length Metrics", () => {
    it("should track queue length for different states", async () => {
      // Add multiple jobs
      await queueService.addComputeJob({
        type: "data-processing",
        payload: { records: [] },
      });

      await queueService.addComputeJob({
        type: "ai-computation",
        payload: { query: "test" },
      });

      // Get queue stats (this updates metrics)
      await queueService.getQueueStats();

      // Get metrics
      const metrics = await register.metrics();
      
      // Verify queue length metrics exist
      expect(metrics).toContain("stellaiverse_queue_length");
      expect(metrics).toContain('queue_name="compute"');
      expect(metrics).toContain('state="waiting"');
      expect(metrics).toContain('state="active"');
      expect(metrics).toContain('state="completed"');
      expect(metrics).toContain('state="failed"');
      expect(metrics).toContain('state="delayed"');
    });

    it("should track dead letter queue length", async () => {
      // Get queue stats
      await queueService.getQueueStats();

      // Get metrics
      const metrics = await register.metrics();
      
      // Verify dead letter queue metrics
      expect(metrics).toContain("stellaiverse_queue_length");
      expect(metrics).toContain('queue_name="dead_letter"');
    });
  });

  describe("Metrics Endpoint Integration", () => {
    it("should expose all job queue metrics at /metrics", async () => {
      // Add and process some jobs
      const job1 = await queueService.addComputeJob({
        type: "data-processing",
        payload: { records: [{ id: 1 }] },
      });

      const job2 = await queueService.addComputeJob({
        type: "report-generation",
        payload: { format: "pdf" },
      });

      // Wait for jobs to complete
      await Promise.all([job1.finished(), job2.finished()]);

      // Update queue stats
      await queueService.getQueueStats();

      // Get all metrics
      const metrics = await register.metrics();
      
      // Verify all expected metrics are present
      expect(metrics).toContain("stellaiverse_job_duration_seconds");
      expect(metrics).toContain("stellaiverse_job_success_total");
      expect(metrics).toContain("stellaiverse_queue_length");
      
      // Verify metrics have proper labels
      expect(metrics).toContain('job_type="data-processing"');
      expect(metrics).toContain('job_type="report-generation"');
    });
  });

  describe("Metrics Labels and Buckets", () => {
    it("should use appropriate histogram buckets for job duration", async () => {
      const job = await queueService.addComputeJob({
        type: "data-processing",
        payload: { records: [] },
      });

      await job.finished();

      const metrics = await register.metrics();
      
      // Verify histogram buckets are present
      expect(metrics).toContain("stellaiverse_job_duration_seconds_bucket");
      expect(metrics).toContain('le="0.1"');
      expect(metrics).toContain('le="0.5"');
      expect(metrics).toContain('le="1"');
      expect(metrics).toContain('le="5"');
      expect(metrics).toContain('le="30"');
      expect(metrics).toContain('le="60"');
      expect(metrics).toContain('le="+Inf"');
    });

    it("should label metrics with job type", async () => {
      const jobTypes = ["data-processing", "ai-computation", "report-generation"];
      
      for (const type of jobTypes) {
        const job = await queueService.addComputeJob({
          type,
          payload: {},
        });
        await job.finished();
      }

      const metrics = await register.metrics();
      
      // Verify all job types are labeled
      for (const type of jobTypes) {
        expect(metrics).toContain(`job_type="${type}"`);
      }
    });
  });
});
