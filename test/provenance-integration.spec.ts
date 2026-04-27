import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { QueueModule } from "../src/compute-job-queue/compute-job-queue.module";
import { QueueService } from "../src/compute-job-queue/queue.service";
import { JobProvenanceService } from "../src/compute-job-queue/services/job-provenance.service";

describe("Provenance Integration (e2e)", () => {
  let app: INestApplication;
  let queueService: QueueService;
  let provenanceService: JobProvenanceService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [QueueModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    queueService = moduleFixture.get<QueueService>(QueueService);
    provenanceService =
      moduleFixture.get<JobProvenanceService>(JobProvenanceService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Job Provenance Tracking", () => {
    it("should track provenance for a simple job", async () => {
      // Create a job
      const job = await queueService.addComputeJob({
        type: "data-processing",
        payload: { records: [{ id: 1, name: "Test" }] },
        userId: "test-user",
        providerId: "test-provider",
        providerModel: "test-model-v1",
      });

      const jobId = String(job.id);

      // Wait a bit for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check provenance was created
      const provenance = await provenanceService.getProvenanceByJobId(jobId);
      expect(provenance).toBeDefined();
      expect(provenance!.providerId).toBe("test-provider");
      expect(provenance!.providerModel).toBe("test-model-v1");
    });

    it("should track job dependencies", async () => {
      // Create parent job
      const parentJob = await queueService.addComputeJob({
        type: "data-processing",
        payload: { data: "parent data" },
        providerId: "provider-1",
      });

      const parentJobId = String(parentJob.id);

      // Create child job with dependency
      const childJob = await queueService.addComputeJob({
        type: "ai-computation",
        payload: { query: "process parent data" },
        providerId: "provider-2",
        parentJobIds: [parentJobId],
      });

      const childJobId = String(childJob.id);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check lineage
      const lineage = await provenanceService.getJobLineage(childJobId);
      expect(lineage.ancestors).toHaveLength(1);
      expect(lineage.ancestors[0].providerId).toBe("provider-1");
    });
  });

  describe("Provenance API Endpoints", () => {
    let testJobId: string;

    beforeEach(async () => {
      const job = await queueService.addComputeJob({
        type: "report-generation",
        payload: { format: "pdf", title: "Test Report" },
        userId: "api-test-user",
        providerId: "report-provider",
      });
      testJobId = String(job.id);

      // Wait for job processing
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it("GET /jobs/:id/provenance should return job provenance", () => {
      return request(app.getHttpServer())
        .get(`/jobs/${testJobId}/provenance`)
        .expect(200)
        .expect((res) => {
          expect(res.body.jobId).toBe(testJobId);
          expect(res.body.providerId).toBe("report-provider");
          expect(res.body.inputs.format).toBe("pdf");
        });
    });

    it("GET /jobs/:id/lineage should return job lineage", () => {
      return request(app.getHttpServer())
        .get(`/jobs/${testJobId}/lineage`)
        .expect(200)
        .expect((res) => {
          expect(res.body.jobId).toBe(testJobId);
          expect(res.body.ancestors).toBeDefined();
          expect(res.body.descendants).toBeDefined();
          expect(res.body.depth).toBeDefined();
        });
    });

    it("GET /jobs/:id/export should export provenance graph", () => {
      return request(app.getHttpServer())
        .get(`/jobs/${testJobId}/export`)
        .expect(200)
        .expect((res) => {
          expect(res.body.metadata).toBeDefined();
          expect(res.body.metadata.rootJobId).toBe(testJobId);
          expect(res.body.nodes).toBeDefined();
          expect(res.body.edges).toBeDefined();
        });
    });

    it("GET /jobs/:id/reproducible should check reproducibility", () => {
      return request(app.getHttpServer())
        .get(`/jobs/${testJobId}/reproducible`)
        .expect(200)
        .expect((res) => {
          expect(res.body.jobId).toBe(testJobId);
          expect(res.body.canReproduce).toBeDefined();
          expect(res.body.reason).toBeDefined();
        });
    });

    it("POST /jobs/:id/rerun should rerun a job", () => {
      return request(app.getHttpServer())
        .post(`/jobs/${testJobId}/rerun`)
        .send({
          originalJobId: testJobId,
          overrideInputs: { format: "html", title: "Rerun Test Report" },
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.originalJobId).toBe(testJobId);
          expect(res.body.newJobId).toBeDefined();
          expect(res.body.status).toBe("queued");
        });
    });

    it("GET /jobs/nonexistent/provenance should return 404", () => {
      return request(app.getHttpServer())
        .get("/jobs/nonexistent-job/provenance")
        .expect(404);
    });
  });

  describe("Cache Invalidation Integration", () => {
    it("should identify dependent jobs for cache invalidation", async () => {
      // Create parent job
      const parentJob = await queueService.addComputeJob({
        type: "data-processing",
        payload: { data: "cache test parent" },
        providerId: "cache-provider",
      });

      const parentJobId = String(parentJob.id);

      // Create dependent jobs
      const child1Job = await queueService.addComputeJob({
        type: "ai-computation",
        payload: { query: "child 1" },
        parentJobIds: [parentJobId],
      });

      const child2Job = await queueService.addComputeJob({
        type: "report-generation",
        payload: { format: "pdf" },
        parentJobIds: [parentJobId],
      });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check dependent jobs endpoint
      const response = await request(app.getHttpServer())
        .get(`/jobs/${parentJobId}/dependents`)
        .expect(200);

      expect(response.body.dependentJobs).toHaveLength(2);
      expect(response.body.dependentJobs).toContain(String(child1Job.id));
      expect(response.body.dependentJobs).toContain(String(child2Job.id));
    });
  });
});
