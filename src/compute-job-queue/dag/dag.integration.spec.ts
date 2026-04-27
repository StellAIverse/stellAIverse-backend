import { Test, TestingModule } from "@nestjs/testing";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { DagService } from "./dag.service";
import { DagValidator } from "./dag.validator";
import { QueueService } from "../queue.service";
import { CreateDagWorkflowDto } from "./dag.dto";
import {
  DagNodeStatus,
  DagWorkflowStatus,
  DependencyCondition,
} from "./dag.interfaces";

/**
 * Integration tests for multi-stage DAG pipelines.
 *
 * These tests simulate realistic workflow scenarios including:
 *  - ETL (Extract → Transform → Load) pipelines
 *  - Conditional branching (error-handler paths)
 *  - Parallel fan-out / fan-in patterns
 *  - Error propagation and partial completion
 */
describe("DAG Integration Tests", () => {
  let service: DagService;
  let eventEmitter: EventEmitter2;
  let addJobSpy: jest.Mock;

  beforeEach(async () => {
    addJobSpy = jest.fn().mockResolvedValue({ id: "mock-bull-job" });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DagService,
        DagValidator,
        {
          provide: QueueService,
          useValue: { addComputeJob: addJobSpy },
        },
        {
          provide: EventEmitter2,
          useValue: new EventEmitter2(),
        },
      ],
    }).compile();

    service = module.get<DagService>(DagService);
    eventEmitter = module.get(EventEmitter2);
  });

  /** Helper: emit completion and wait for async propagation. */
  async function completeNode(
    workflowId: string,
    nodeId: string,
    result: any = {},
  ) {
    eventEmitter.emit("dag.job.completed", { workflowId, nodeId, result });
    await tick();
  }

  /** Helper: emit failure and wait for async propagation. */
  async function failNode(
    workflowId: string,
    nodeId: string,
    error = "test error",
  ) {
    eventEmitter.emit("dag.job.failed", { workflowId, nodeId, error });
    await tick();
  }

  async function tick(ms = 50) {
    await new Promise((r) => setTimeout(r, ms));
  }

  // -----------------------------------------------------------------------
  // Scenario 1: Simple ETL pipeline (Extract → Transform → Load)
  // -----------------------------------------------------------------------
  describe("ETL pipeline: extract → transform → load", () => {
    let workflowId: string;

    beforeEach(async () => {
      const dto: CreateDagWorkflowDto = {
        name: "ETL Pipeline",
        nodes: [
          {
            jobId: "extract",
            type: "data-processing",
            payload: { source: "s3://bucket/raw" },
          },
          {
            jobId: "transform",
            type: "data-processing",
            payload: { mode: "normalize" },
            dependsOn: [
              { jobId: "extract", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
          {
            jobId: "load",
            type: "data-processing",
            payload: { target: "warehouse" },
            dependsOn: [
              { jobId: "transform", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
        ],
        userId: "etl-user",
      };

      const wf = await service.submitWorkflow(dto);
      workflowId = wf.workflowId;
    });

    it("should execute all three stages sequentially", async () => {
      // Only extract should be enqueued initially
      expect(addJobSpy).toHaveBeenCalledTimes(1);

      await completeNode(workflowId, "extract", { rows: 1000 });
      expect(addJobSpy).toHaveBeenCalledTimes(2);

      await completeNode(workflowId, "transform", { rows: 950 });
      expect(addJobSpy).toHaveBeenCalledTimes(3);

      await completeNode(workflowId, "load", { loaded: true });

      const wf = service.getWorkflow(workflowId);
      expect(wf.status).toBe(DagWorkflowStatus.COMPLETED);
      expect(wf.nodes.get("extract").status).toBe(DagNodeStatus.COMPLETED);
      expect(wf.nodes.get("transform").status).toBe(DagNodeStatus.COMPLETED);
      expect(wf.nodes.get("load").status).toBe(DagNodeStatus.COMPLETED);
    });

    it("should propagate upstream results to downstream nodes", async () => {
      await completeNode(workflowId, "extract", { rows: 500, format: "csv" });

      // The transform job should receive extract's result in dagContext
      const transformCall = addJobSpy.mock.calls[1][0];
      expect(transformCall.metadata.dagContext.upstreamResults).toEqual({
        extract: { rows: 500, format: "csv" },
      });
    });

    it("should skip transform and load when extract fails", async () => {
      await failNode(workflowId, "extract", "S3 connection timeout");

      const wf = service.getWorkflow(workflowId);
      expect(wf.nodes.get("extract").status).toBe(DagNodeStatus.FAILED);
      expect(wf.nodes.get("transform").status).toBe(DagNodeStatus.SKIPPED);
      expect(wf.nodes.get("load").status).toBe(DagNodeStatus.SKIPPED);
      expect(wf.status).toBe(DagWorkflowStatus.FAILED);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 2: Conditional branching with error handler
  // -----------------------------------------------------------------------
  describe("Conditional branching: success path + error handler", () => {
    it("should run error-handler when main job fails", async () => {
      const dto: CreateDagWorkflowDto = {
        name: "Conditional Pipeline",
        nodes: [
          {
            jobId: "process",
            type: "ai-computation",
            payload: { model: "gpt-4" },
          },
          {
            jobId: "publish",
            type: "data-processing",
            payload: { target: "api" },
            dependsOn: [
              { jobId: "process", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
          {
            jobId: "alert",
            type: "email-notification",
            payload: { to: "ops@example.com" },
            dependsOn: [
              { jobId: "process", condition: DependencyCondition.ON_FAILURE },
            ],
          },
          {
            jobId: "cleanup",
            type: "data-processing",
            payload: { action: "cleanup" },
            dependsOn: [
              { jobId: "process", condition: DependencyCondition.ALWAYS },
            ],
          },
        ],
      };

      const wf = await service.submitWorkflow(dto);

      // process fails
      await failNode(wf.workflowId, "process", "Model unavailable");

      const workflow = service.getWorkflow(wf.workflowId);

      // publish should be SKIPPED (onSuccess condition not met)
      expect(workflow.nodes.get("publish").status).toBe(DagNodeStatus.SKIPPED);

      // alert should have been enqueued (onFailure condition met)
      const alertEnqueued = addJobSpy.mock.calls.some(
        (call) => call[0].metadata?.dagContext?.nodeId === "alert",
      );
      expect(alertEnqueued).toBe(true);

      // cleanup should have been enqueued (ALWAYS condition met)
      const cleanupEnqueued = addJobSpy.mock.calls.some(
        (call) => call[0].metadata?.dagContext?.nodeId === "cleanup",
      );
      expect(cleanupEnqueued).toBe(true);
    });

    it("should run publish (not alert) when main job succeeds", async () => {
      const dto: CreateDagWorkflowDto = {
        name: "Happy Path",
        nodes: [
          {
            jobId: "process",
            type: "ai-computation",
            payload: {},
          },
          {
            jobId: "publish",
            type: "data-processing",
            payload: {},
            dependsOn: [
              { jobId: "process", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
          {
            jobId: "alert",
            type: "email-notification",
            payload: { to: "ops@example.com" },
            dependsOn: [
              { jobId: "process", condition: DependencyCondition.ON_FAILURE },
            ],
          },
        ],
      };

      const wf = await service.submitWorkflow(dto);
      await completeNode(wf.workflowId, "process", { output: "ok" });

      const workflow = service.getWorkflow(wf.workflowId);

      // alert should be SKIPPED (onFailure not met since process succeeded)
      expect(workflow.nodes.get("alert").status).toBe(DagNodeStatus.SKIPPED);

      // publish should have been enqueued
      const publishEnqueued = addJobSpy.mock.calls.some(
        (call) => call[0].metadata?.dagContext?.nodeId === "publish",
      );
      expect(publishEnqueued).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Parallel fan-out / fan-in
  // -----------------------------------------------------------------------
  describe("Parallel fan-out / fan-in", () => {
    it("should enqueue join only after all parallel branches complete", async () => {
      const dto: CreateDagWorkflowDto = {
        name: "Fan-out Fan-in",
        nodes: [
          { jobId: "split", type: "data-processing", payload: {} },
          {
            jobId: "branch-a",
            type: "data-processing",
            payload: { partition: "A" },
            dependsOn: [
              { jobId: "split", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
          {
            jobId: "branch-b",
            type: "data-processing",
            payload: { partition: "B" },
            dependsOn: [
              { jobId: "split", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
          {
            jobId: "branch-c",
            type: "data-processing",
            payload: { partition: "C" },
            dependsOn: [
              { jobId: "split", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
          {
            jobId: "join",
            type: "report-generation",
            payload: {},
            dependsOn: [
              { jobId: "branch-a", condition: DependencyCondition.ON_SUCCESS },
              { jobId: "branch-b", condition: DependencyCondition.ON_SUCCESS },
              { jobId: "branch-c", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
        ],
      };

      const wf = await service.submitWorkflow(dto);
      const wfId = wf.workflowId;

      // split enqueued
      expect(addJobSpy).toHaveBeenCalledTimes(1);

      await completeNode(wfId, "split", { parts: 3 });
      // 3 branches enqueued
      expect(addJobSpy).toHaveBeenCalledTimes(4);

      // Complete branches one by one – join should NOT fire until all done
      await completeNode(wfId, "branch-a", { partA: true });
      expect(addJobSpy).toHaveBeenCalledTimes(4); // still 4

      await completeNode(wfId, "branch-b", { partB: true });
      expect(addJobSpy).toHaveBeenCalledTimes(4); // still 4

      await completeNode(wfId, "branch-c", { partC: true });
      // Now join should be enqueued
      expect(addJobSpy).toHaveBeenCalledTimes(5);

      // Verify join receives all upstream results
      const joinCall = addJobSpy.mock.calls[4][0];
      expect(joinCall.metadata.dagContext.upstreamResults).toEqual({
        "branch-a": { partA: true },
        "branch-b": { partB: true },
        "branch-c": { partC: true },
      });

      await completeNode(wfId, "join", { merged: true });

      const workflow = service.getWorkflow(wfId);
      expect(workflow.status).toBe(DagWorkflowStatus.COMPLETED);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 4: Error propagation in a deep pipeline
  // -----------------------------------------------------------------------
  describe("Error propagation in deep pipeline", () => {
    it("should skip all downstream nodes when a mid-pipeline node fails", async () => {
      const dto: CreateDagWorkflowDto = {
        name: "Deep Pipeline",
        nodes: [
          { jobId: "s1", type: "data-processing", payload: {} },
          {
            jobId: "s2",
            type: "data-processing",
            payload: {},
            dependsOn: [
              { jobId: "s1", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
          {
            jobId: "s3",
            type: "data-processing",
            payload: {},
            dependsOn: [
              { jobId: "s2", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
          {
            jobId: "s4",
            type: "data-processing",
            payload: {},
            dependsOn: [
              { jobId: "s3", condition: DependencyCondition.ON_SUCCESS },
            ],
          },
        ],
      };

      const wf = await service.submitWorkflow(dto);

      await completeNode(wf.workflowId, "s1", {});
      await failNode(wf.workflowId, "s2", "disk full");

      const workflow = service.getWorkflow(wf.workflowId);
      expect(workflow.nodes.get("s1").status).toBe(DagNodeStatus.COMPLETED);
      expect(workflow.nodes.get("s2").status).toBe(DagNodeStatus.FAILED);
      expect(workflow.nodes.get("s3").status).toBe(DagNodeStatus.SKIPPED);
      expect(workflow.nodes.get("s4").status).toBe(DagNodeStatus.SKIPPED);
      expect(workflow.status).toBe(DagWorkflowStatus.PARTIALLY_COMPLETED);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 5: onPartialSuccess condition
  // -----------------------------------------------------------------------
  describe("onPartialSuccess condition", () => {
    it("should trigger on both success and failure", async () => {
      const dto: CreateDagWorkflowDto = {
        name: "Partial Success",
        nodes: [
          { jobId: "risky", type: "ai-computation", payload: {} },
          {
            jobId: "summary",
            type: "report-generation",
            payload: {},
            dependsOn: [
              {
                jobId: "risky",
                condition: DependencyCondition.ON_PARTIAL_SUCCESS,
              },
            ],
          },
        ],
      };

      // Test with failure
      const wf1 = await service.submitWorkflow(dto);
      await failNode(wf1.workflowId, "risky", "timeout");

      const summaryEnqueued = addJobSpy.mock.calls.some(
        (call) => call[0].metadata?.dagContext?.nodeId === "summary",
      );
      expect(summaryEnqueued).toBe(true);
    });

    it("should also trigger on success", async () => {
      addJobSpy.mockClear();

      const dto: CreateDagWorkflowDto = {
        name: "Partial Success Happy Path",
        nodes: [
          { jobId: "risky", type: "ai-computation", payload: {} },
          {
            jobId: "summary",
            type: "report-generation",
            payload: {},
            dependsOn: [
              {
                jobId: "risky",
                condition: DependencyCondition.ON_PARTIAL_SUCCESS,
              },
            ],
          },
        ],
      };

      const wf2 = await service.submitWorkflow(dto);
      await completeNode(wf2.workflowId, "risky", { data: "ok" });

      const summaryEnqueued = addJobSpy.mock.calls.some(
        (call) => call[0].metadata?.dagContext?.nodeId === "summary",
      );
      expect(summaryEnqueued).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 6: Workflow cancellation mid-flight
  // -----------------------------------------------------------------------
  describe("Workflow cancellation", () => {
    it("should prevent further nodes from executing after cancellation", async () => {
      const dto: CreateDagWorkflowDto = {
        name: "Cancellable Pipeline",
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

      const wf = await service.submitWorkflow(dto);

      // Complete 'a'
      await completeNode(wf.workflowId, "a", {});

      // Cancel the workflow while 'b' is running
      await service.cancelWorkflow(wf.workflowId);

      const workflow = service.getWorkflow(wf.workflowId);
      expect(workflow.status).toBe(DagWorkflowStatus.CANCELLED);

      // 'c' should be CANCELLED since it was still PENDING
      expect(workflow.nodes.get("c").status).toBe(DagNodeStatus.CANCELLED);

      // Even if b "completes" after cancellation, no new nodes should enqueue
      const callsBefore = addJobSpy.mock.calls.length;
      await completeNode(wf.workflowId, "b", {});
      expect(addJobSpy.mock.calls.length).toBe(callsBefore);
    });
  });
});
