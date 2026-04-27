import { Test, TestingModule } from "@nestjs/testing";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { JobProvenanceService } from "./job-provenance.service";
import { ComputeJobData } from "../queue.service";

describe("JobProvenanceService", () => {
  let service: JobProvenanceService;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobProvenanceService,
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<JobProvenanceService>(JobProvenanceService);
    eventEmitter = module.get(EventEmitter2);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("createProvenance", () => {
    it("should create a provenance record", async () => {
      const jobId = "test-job-123";
      const jobData: ComputeJobData = {
        type: "data-processing",
        payload: { data: "test" },
        userId: "user-123",
        priority: 1,
        metadata: { source: "api" },
      };
      const providerId = "test-provider";

      const provenance = await service.createProvenance(
        jobId,
        jobData,
        providerId,
      );

      expect(provenance).toBeDefined();
      expect(provenance.jobId).toBe(jobId);
      expect(provenance.providerId).toBe(providerId);
      expect(provenance.inputs).toEqual(jobData.payload);
      expect(eventEmitter.emit).toHaveBeenCalledWith("job.provenance.created", {
        provenanceId: provenance.id,
        jobId,
        parentJobIds: [],
      });
    });

    it("should handle parent job IDs", async () => {
      const jobId = "test-job-456";
      const parentJobIds = ["parent-1", "parent-2"];
      const jobData: ComputeJobData = {
        type: "ai-computation",
        payload: { query: "test query" },
        metadata: { parentJobIds },
      };

      const provenance = await service.createProvenance(
        jobId,
        jobData,
        "openai-gpt4",
      );

      expect(provenance.parentJobIds).toEqual(parentJobIds);
    });
  });

  describe("markJobCompleted", () => {
    it("should mark job as completed", async () => {
      const jobId = "test-job-789";
      const jobData: ComputeJobData = {
        type: "report-generation",
        payload: { format: "pdf" },
      };
      const result = { reportId: "report-123" };

      // First create provenance
      await service.createProvenance(jobId, jobData, "report-provider");

      // Then mark as completed
      await service.markJobCompleted(jobId, result);

      const provenance = await service.getProvenanceByJobId(jobId);
      expect(provenance).toBeDefined();
      expect(provenance!.metadata.result).toEqual(result);
      expect(provenance!.completedAt).toBeDefined();
    });
  });

  describe("getJobLineage", () => {
    it("should return job lineage with ancestors and descendants", async () => {
      // Create a chain of jobs: parent -> child -> grandchild
      const parentJobId = "parent-job";
      const childJobId = "child-job";
      const grandchildJobId = "grandchild-job";

      // Create parent job
      await service.createProvenance(
        parentJobId,
        {
          type: "data-processing",
          payload: { data: "parent" },
        },
        "provider-1",
      );

      // Create child job with parent dependency
      await service.createProvenance(
        childJobId,
        {
          type: "ai-computation",
          payload: { data: "child" },
          metadata: { parentJobIds: [parentJobId] },
        },
        "provider-2",
      );

      // Create grandchild job with child dependency
      await service.createProvenance(
        grandchildJobId,
        {
          type: "report-generation",
          payload: { data: "grandchild" },
          metadata: { parentJobIds: [childJobId] },
        },
        "provider-3",
      );

      const lineage = await service.getJobLineage(childJobId);

      expect(lineage.jobId).toBe(childJobId);
      expect(lineage.ancestors).toHaveLength(1);
      expect(lineage.descendants).toHaveLength(1);
      expect(lineage.ancestors[0].inputs.data).toBe("parent");
      expect(lineage.descendants[0].inputs.data).toBe("grandchild");
    });
  });

  describe("getDependentJobs", () => {
    it("should return all dependent jobs", async () => {
      const parentJobId = "parent-job";
      const child1JobId = "child1-job";
      const child2JobId = "child2-job";

      // Create parent job
      await service.createProvenance(
        parentJobId,
        {
          type: "data-processing",
          payload: { data: "parent" },
        },
        "provider-1",
      );

      // Create child jobs with parent dependency
      await service.createProvenance(
        child1JobId,
        {
          type: "ai-computation",
          payload: { data: "child1" },
          metadata: { parentJobIds: [parentJobId] },
        },
        "provider-2",
      );

      await service.createProvenance(
        child2JobId,
        {
          type: "report-generation",
          payload: { data: "child2" },
          metadata: { parentJobIds: [parentJobId] },
        },
        "provider-3",
      );

      const dependentJobs = await service.getDependentJobs(parentJobId);

      expect(dependentJobs).toHaveLength(2);
      expect(dependentJobs).toContain(child1JobId);
      expect(dependentJobs).toContain(child2JobId);
    });
  });

  describe("canReproduce", () => {
    it("should return true when all dependencies are available", async () => {
      const parentJobId = "parent-job";
      const childJobId = "child-job";

      // Create parent job
      await service.createProvenance(
        parentJobId,
        {
          type: "data-processing",
          payload: { data: "parent" },
        },
        "provider-1",
      );

      // Create child job with parent dependency
      await service.createProvenance(
        childJobId,
        {
          type: "ai-computation",
          payload: { data: "child" },
          metadata: { parentJobIds: [parentJobId] },
        },
        "provider-2",
      );

      const canReproduce = await service.canReproduce(childJobId);
      expect(canReproduce).toBe(true);
    });

    it("should return false when dependencies are missing", async () => {
      const childJobId = "child-job";

      // Create child job with missing parent dependency
      await service.createProvenance(
        childJobId,
        {
          type: "ai-computation",
          payload: { data: "child" },
          metadata: { parentJobIds: ["missing-parent"] },
        },
        "provider-2",
      );

      const canReproduce = await service.canReproduce(childJobId);
      expect(canReproduce).toBe(false);
    });
  });

  describe("exportProvenanceGraph", () => {
    it("should export provenance graph as JSON", async () => {
      const jobId = "test-job";

      await service.createProvenance(
        jobId,
        {
          type: "data-processing",
          payload: { data: "test" },
        },
        "provider-1",
      );

      const graph = await service.exportProvenanceGraph(jobId);

      expect(graph).toBeDefined();
      expect(graph.metadata).toBeDefined();
      expect(graph.metadata.rootJobId).toBe(jobId);
      expect(graph.nodes).toBeDefined();
      expect(graph.edges).toBeDefined();
      expect(Array.isArray(graph.nodes)).toBe(true);
      expect(Array.isArray(graph.edges)).toBe(true);
    });
  });
});
