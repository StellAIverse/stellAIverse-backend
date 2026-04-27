import { Test, TestingModule } from "@nestjs/testing";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DagService } from "./dag.service";
import { DagValidator } from "./dag.validator";
import { QueueService } from "../queue.service";
import { CreateDagWorkflowDto } from "./dag.dto";
import {
  DagNodeStatus,
  DagWorkflowStatus,
  DependencyCondition,
} from "./dag.interfaces";

describe("DagService", () => {
  let service: DagService;
  let queueService: jest.Mocked<Partial<QueueService>>;
  let eventEmitter: EventEmitter2;

  const mockQueueService = {
    addComputeJob: jest.fn().mockResolvedValue({ id: "bull-job-1" }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DagService,
        DagValidator,
        {
          provide: QueueService,
          useValue: mockQueueService,
        },
        {
          provide: EventEmitter2,
          useValue: new EventEmitter2(),
        },
      ],
    }).compile();

    service = module.get<DagService>(DagService);
    queueService = module.get(QueueService);
    eventEmitter = module.get(EventEmitter2);

    jest.clearAllMocks();
    mockQueueService.addComputeJob.mockResolvedValue({ id: "bull-job-1" });
  });

  describe("submitWorkflow", () => {
    it("should create a workflow and enqueue root nodes", async () => {
      const dto: CreateDagWorkflowDto = {
        name: "Test Pipeline",
        nodes: [
          { jobId: "extract", type: "data-processing", payload: { src: "db" } },
          {
            jobId: "transform",
            type: "data-processing",
            payload: { mode: "clean" },
            dependsOn: [
              { jobId: "extract", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
        ],
        userId: "user-1",
      };

      const workflow = await service.submitWorkflow(dto);

      expect(workflow.workflowId).toBeDefined();
      expect(workflow.name).toBe("Test Pipeline");
      expect(workflow.status).toBe(DagWorkflowStatus.RUNNING);
      expect(workflow.nodes.size).toBe(2);
      expect(workflow.topologicalOrder[0]).toBe("extract");

      // Root node 'extract' should have been enqueued
      expect(mockQueueService.addComputeJob).toHaveBeenCalledTimes(1);
      expect(mockQueueService.addComputeJob).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "data-processing",
          metadata: expect.objectContaining({
            dagContext: expect.objectContaining({
              nodeId: "extract",
            }),
          }),
        }),
      );
    });

    it("should reject duplicate node IDs", async () => {
      const dto: CreateDagWorkflowDto = {
        nodes: [
          { jobId: "dup", type: "data-processing", payload: {} },
          { jobId: "dup", type: "data-processing", payload: {} },
        ],
      };

      await expect(service.submitWorkflow(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should reject circular dependencies", async () => {
      const dto: CreateDagWorkflowDto = {
        nodes: [
          {
            jobId: "a",
            type: "data-processing",
            payload: {},
            dependsOn: [
              { jobId: "b", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
          {
            jobId: "b",
            type: "data-processing",
            payload: {},
            dependsOn: [
              { jobId: "a", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
        ],
      };

      await expect(service.submitWorkflow(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should enqueue multiple root nodes in parallel", async () => {
      const dto: CreateDagWorkflowDto = {
        nodes: [
          { jobId: "root-a", type: "data-processing", payload: {} },
          { jobId: "root-b", type: "ai-computation", payload: {} },
          {
            jobId: "join",
            type: "report-generation",
            payload: {},
            dependsOn: [
              { jobId: "root-a", condition: DependencyCondition.ON_SUCCESS },
              { jobId: "root-b", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
        ],
      };

      await service.submitWorkflow(dto);

      // Both root nodes should be enqueued
      expect(mockQueueService.addComputeJob).toHaveBeenCalledTimes(2);
    });

    it("should pass upstream results in dagContext", async () => {
      const dto: CreateDagWorkflowDto = {
        nodes: [
          { jobId: "step1", type: "data-processing", payload: { x: 1 } },
          {
            jobId: "step2",
            type: "data-processing",
            payload: { y: 2 },
            dependsOn: [
              { jobId: "step1", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
        ],
      };

      const workflow = await service.submitWorkflow(dto);

      // Simulate step1 completing
      eventEmitter.emit("dag.job.completed", {
        workflowId: workflow.workflowId,
        nodeId: "step1",
        result: { output: 42 },
      });

      // Give the async handler a tick to run
      await new Promise((r) => setTimeout(r, 50));

      // step2 should now be enqueued with upstream results
      expect(mockQueueService.addComputeJob).toHaveBeenCalledTimes(2);
      const step2Call = mockQueueService.addComputeJob.mock.calls[1][0];
      expect(step2Call.metadata.dagContext.upstreamResults).toEqual({
        step1: { output: 42 },
      });
    });
  });

  describe("validateWorkflow", () => {
    it("should return valid for a correct DAG", () => {
      const dto: CreateDagWorkflowDto = {
        nodes: [
          { jobId: "a", type: "data-processing", payload: {} },
          {
            jobId: "b",
            type: "data-processing",
            payload: {},
            dependsOn: [
              { jobId: "a", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
        ],
      };

      const result = service.validateWorkflow(dto);

      expect(result.valid).toBe(true);
      expect(result.topologicalOrder).toEqual(["a", "b"]);
    });

    it("should return invalid for a cyclic graph", () => {
      const dto: CreateDagWorkflowDto = {
        nodes: [
          {
            jobId: "a",
            type: "data-processing",
            payload: {},
            dependsOn: [{ jobId: "b" }],
          },
          {
            jobId: "b",
            type: "data-processing",
            payload: {},
            dependsOn: [{ jobId: "a" }],
          },
        ],
      };

      const result = service.validateWorkflow(dto);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("getWorkflow", () => {
    it("should return a submitted workflow", async () => {
      const dto: CreateDagWorkflowDto = {
        name: "My Workflow",
        nodes: [{ jobId: "solo", type: "data-processing", payload: {} }],
      };

      const created = await service.submitWorkflow(dto);
      const fetched = service.getWorkflow(created.workflowId);

      expect(fetched.workflowId).toBe(created.workflowId);
      expect(fetched.name).toBe("My Workflow");
    });

    it("should throw NotFoundException for unknown ID", () => {
      expect(() => service.getWorkflow("nonexistent")).toThrow(
        NotFoundException,
      );
    });
  });

  describe("cancelWorkflow", () => {
    it("should cancel a running workflow", async () => {
      const dto: CreateDagWorkflowDto = {
        nodes: [
          { jobId: "a", type: "data-processing", payload: {} },
          {
            jobId: "b",
            type: "data-processing",
            payload: {},
            dependsOn: [
              { jobId: "a", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
        ],
      };

      const workflow = await service.submitWorkflow(dto);
      const cancelled = await service.cancelWorkflow(workflow.workflowId);

      expect(cancelled.status).toBe(DagWorkflowStatus.CANCELLED);
      expect(cancelled.completedAt).toBeDefined();

      // The pending node 'b' should be CANCELLED
      const nodeB = cancelled.nodes.get("b");
      expect(nodeB.status).toBe(DagNodeStatus.CANCELLED);
    });

    it("should throw when cancelling an already completed workflow", async () => {
      const dto: CreateDagWorkflowDto = {
        nodes: [{ jobId: "only", type: "data-processing", payload: {} }],
      };

      const workflow = await service.submitWorkflow(dto);

      // Simulate completion
      eventEmitter.emit("dag.job.completed", {
        workflowId: workflow.workflowId,
        nodeId: "only",
        result: {},
      });

      await new Promise((r) => setTimeout(r, 50));

      await expect(service.cancelWorkflow(workflow.workflowId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("listWorkflows", () => {
    it("should list all submitted workflows", async () => {
      await service.submitWorkflow({
        name: "WF-1",
        nodes: [{ jobId: "a", type: "data-processing", payload: {} }],
      });
      await service.submitWorkflow({
        name: "WF-2",
        nodes: [{ jobId: "b", type: "data-processing", payload: {} }],
      });

      const list = service.listWorkflows();

      expect(list).toHaveLength(2);
      expect(list.map((w) => w.name)).toContain("WF-1");
      expect(list.map((w) => w.name)).toContain("WF-2");
    });
  });

  describe("resolveReadyJobs", () => {
    it("should resolve root nodes as ready", async () => {
      const dto: CreateDagWorkflowDto = {
        nodes: [
          { jobId: "a", type: "data-processing", payload: {} },
          {
            jobId: "b",
            type: "data-processing",
            payload: {},
            dependsOn: [
              { jobId: "a", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
        ],
      };

      const workflow = await service.submitWorkflow(dto);

      // After submission, 'a' is already queued/running. Reset it to PENDING for testing.
      workflow.nodes.get("a").status = DagNodeStatus.PENDING;

      const ready = service.resolveReadyJobs(workflow);

      expect(ready).toContain("a");
      expect(ready).not.toContain("b");
    });
  });

  describe("workflow advancement via events", () => {
    it("should advance the workflow when a node completes", async () => {
      const dto: CreateDagWorkflowDto = {
        nodes: [
          { jobId: "step1", type: "data-processing", payload: {} },
          {
            jobId: "step2",
            type: "data-processing",
            payload: {},
            dependsOn: [
              { jobId: "step1", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
          {
            jobId: "step3",
            type: "data-processing",
            payload: {},
            dependsOn: [
              { jobId: "step2", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
        ],
      };

      const workflow = await service.submitWorkflow(dto);

      // step1 completes
      eventEmitter.emit("dag.job.completed", {
        workflowId: workflow.workflowId,
        nodeId: "step1",
        result: { data: "from-step1" },
      });
      await new Promise((r) => setTimeout(r, 50));

      expect(workflow.nodes.get("step1").status).toBe(DagNodeStatus.COMPLETED);
      // step2 should now be running
      expect(mockQueueService.addComputeJob).toHaveBeenCalledTimes(2);

      // step2 completes
      eventEmitter.emit("dag.job.completed", {
        workflowId: workflow.workflowId,
        nodeId: "step2",
        result: { data: "from-step2" },
      });
      await new Promise((r) => setTimeout(r, 50));

      expect(workflow.nodes.get("step2").status).toBe(DagNodeStatus.COMPLETED);
      // step3 should now be running
      expect(mockQueueService.addComputeJob).toHaveBeenCalledTimes(3);
    });

    it("should skip downstream nodes when onSuccess condition is not met", async () => {
      const dto: CreateDagWorkflowDto = {
        nodes: [
          { jobId: "step1", type: "data-processing", payload: {} },
          {
            jobId: "step2",
            type: "data-processing",
            payload: {},
            dependsOn: [
              { jobId: "step1", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
        ],
      };

      const workflow = await service.submitWorkflow(dto);

      // step1 fails
      eventEmitter.emit("dag.job.failed", {
        workflowId: workflow.workflowId,
        nodeId: "step1",
        error: "Something went wrong",
      });
      await new Promise((r) => setTimeout(r, 50));

      expect(workflow.nodes.get("step1").status).toBe(DagNodeStatus.FAILED);
      expect(workflow.nodes.get("step2").status).toBe(DagNodeStatus.SKIPPED);
      expect(workflow.status).toBe(DagWorkflowStatus.FAILED);
    });

    it("should run onFailure nodes when parent fails", async () => {
      const dto: CreateDagWorkflowDto = {
        nodes: [
          { jobId: "main", type: "data-processing", payload: {} },
          {
            jobId: "error-handler",
            type: "email-notification",
            payload: { to: "admin@example.com" },
            dependsOn: [
              { jobId: "main", condition: DependencyCondition.ON_FAILURE },
            ],
          },
        ],
      };

      const workflow = await service.submitWorkflow(dto);

      // main fails
      eventEmitter.emit("dag.job.failed", {
        workflowId: workflow.workflowId,
        nodeId: "main",
        error: "Crash",
      });
      await new Promise((r) => setTimeout(r, 50));

      // error-handler should have been enqueued
      expect(mockQueueService.addComputeJob).toHaveBeenCalledTimes(2);
      const secondCall = mockQueueService.addComputeJob.mock.calls[1][0];
      expect(secondCall.type).toBe("email-notification");
    });

    it("should finalize workflow as COMPLETED when all nodes succeed", async () => {
      const dto: CreateDagWorkflowDto = {
        nodes: [{ jobId: "only", type: "data-processing", payload: {} }],
      };

      const workflow = await service.submitWorkflow(dto);

      eventEmitter.emit("dag.job.completed", {
        workflowId: workflow.workflowId,
        nodeId: "only",
        result: { done: true },
      });
      await new Promise((r) => setTimeout(r, 50));

      expect(workflow.status).toBe(DagWorkflowStatus.COMPLETED);
      expect(workflow.completedAt).toBeDefined();
    });

    it("should finalize as PARTIALLY_COMPLETED when some fail and some succeed", async () => {
      const dto: CreateDagWorkflowDto = {
        nodes: [
          { jobId: "a", type: "data-processing", payload: {} },
          { jobId: "b", type: "data-processing", payload: {} },
          {
            jobId: "c",
            type: "data-processing",
            payload: {},
            dependsOn: [
              { jobId: "b", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
        ],
      };

      const workflow = await service.submitWorkflow(dto);

      // 'a' succeeds
      eventEmitter.emit("dag.job.completed", {
        workflowId: workflow.workflowId,
        nodeId: "a",
        result: {},
      });
      await new Promise((r) => setTimeout(r, 50));

      // 'b' fails → 'c' should be skipped
      eventEmitter.emit("dag.job.failed", {
        workflowId: workflow.workflowId,
        nodeId: "b",
        error: "boom",
      });
      await new Promise((r) => setTimeout(r, 50));

      expect(workflow.status).toBe(DagWorkflowStatus.PARTIALLY_COMPLETED);
    });
  });
});
