import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { QueueService, ComputeJobData } from "../queue.service";
import { DagValidator } from "./dag.validator";
import {
  DagDependency,
  DagJobContext,
  DagNode,
  DagNodeStatus,
  DagValidationResult,
  DagWorkflow,
  DagWorkflowStatus,
  DependencyCondition,
} from "./dag.interfaces";
import { CreateDagWorkflowDto } from "./dag.dto";

/**
 * Orchestrates DAG-based job workflows.
 *
 * Manages the full lifecycle: submission → validation → scheduling →
 * dependency resolution → completion tracking.
 *
 * Workflows are stored in-memory (swap to Redis/DB for production HA).
 */
@Injectable()
export class DagService {
  private readonly logger = new Logger(DagService.name);
  private readonly workflows = new Map<string, DagWorkflow>();

  constructor(
    private readonly queueService: QueueService,
    private readonly dagValidator: DagValidator,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.registerEventListeners();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Submit a new DAG workflow.
   *
   * Validates the graph structure, persists it, and enqueues all root
   * nodes (those with no dependencies) immediately.
   */
  async submitWorkflow(dto: CreateDagWorkflowDto): Promise<DagWorkflow> {
    const workflowId = this.generateWorkflowId();

    // Build dependency map for validation.
    const depMap = new Map<string, DagDependency[]>();
    const seenIds = new Set<string>();

    for (const node of dto.nodes) {
      if (seenIds.has(node.jobId)) {
        throw new BadRequestException(
          `Duplicate node ID "${node.jobId}" in workflow`,
        );
      }
      seenIds.add(node.jobId);

      const deps: DagDependency[] = (node.dependsOn || []).map((d) => ({
        jobId: d.jobId,
        condition: d.condition ?? DependencyCondition.ON_SUCCESS,
      }));
      depMap.set(node.jobId, deps);
    }

    // Validate DAG structure.
    const validation = this.dagValidator.validate(depMap);
    if (!validation.valid) {
      throw new BadRequestException({
        message: "Invalid DAG structure",
        errors: validation.errors,
      });
    }

    // Build internal workflow representation.
    const nodes = new Map<string, DagNode>();
    const edges = new Map<string, Set<string>>();
    const reverseEdges = new Map<string, Set<string>>();

    for (const nodeDto of dto.nodes) {
      const deps: DagDependency[] = (nodeDto.dependsOn || []).map((d) => ({
        jobId: d.jobId,
        condition: d.condition ?? DependencyCondition.ON_SUCCESS,
      }));

      nodes.set(nodeDto.jobId, {
        jobId: nodeDto.jobId,
        type: nodeDto.type,
        payload: nodeDto.payload,
        userId: nodeDto.userId ?? dto.userId,
        priority: nodeDto.priority,
        groupKey: nodeDto.groupKey,
        metadata: nodeDto.metadata,
        dependsOn: deps,
        status: DagNodeStatus.PENDING,
      });

      edges.set(nodeDto.jobId, new Set());
      reverseEdges.set(nodeDto.jobId, new Set());
    }

    // Populate adjacency lists.
    for (const [nodeId, deps] of depMap) {
      for (const dep of deps) {
        edges.get(dep.jobId)?.add(nodeId);
        reverseEdges.get(nodeId)?.add(dep.jobId);
      }
    }

    const workflow: DagWorkflow = {
      workflowId,
      name: dto.name,
      nodes,
      edges,
      reverseEdges,
      status: DagWorkflowStatus.RUNNING,
      topologicalOrder: validation.topologicalOrder!,
      createdAt: new Date(),
      userId: dto.userId,
      metadata: dto.metadata,
    };

    this.workflows.set(workflowId, workflow);
    this.logger.log(`Workflow ${workflowId} created with ${nodes.size} nodes`);

    // Enqueue root nodes (no dependencies).
    const readyJobs = this.resolveReadyJobs(workflow);
    for (const jobId of readyJobs) {
      await this.enqueueNode(workflow, jobId);
    }

    return workflow;
  }

  /**
   * Validate a DAG structure without submitting it.
   * Useful for dry-run / pre-flight checks.
   */
  validateWorkflow(dto: CreateDagWorkflowDto): DagValidationResult {
    const depMap = new Map<string, DagDependency[]>();
    const seenIds = new Set<string>();

    for (const node of dto.nodes) {
      if (seenIds.has(node.jobId)) {
        return {
          valid: false,
          errors: [`Duplicate node ID "${node.jobId}" in workflow`],
        };
      }
      seenIds.add(node.jobId);

      const deps: DagDependency[] = (node.dependsOn || []).map((d) => ({
        jobId: d.jobId,
        condition: d.condition ?? DependencyCondition.ON_SUCCESS,
      }));
      depMap.set(node.jobId, deps);
    }

    return this.dagValidator.validate(depMap);
  }

  /**
   * Retrieve a workflow by ID.
   */
  getWorkflow(workflowId: string): DagWorkflow {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new NotFoundException(`Workflow "${workflowId}" not found`);
    }
    return workflow;
  }

  /**
   * Cancel a running workflow.
   * Nodes that are still PENDING or QUEUED are marked CANCELLED.
   */
  async cancelWorkflow(workflowId: string): Promise<DagWorkflow> {
    const workflow = this.getWorkflow(workflowId);

    if (
      workflow.status === DagWorkflowStatus.COMPLETED ||
      workflow.status === DagWorkflowStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Workflow "${workflowId}" is already ${workflow.status}`,
      );
    }

    for (const node of workflow.nodes.values()) {
      if (
        node.status === DagNodeStatus.PENDING ||
        node.status === DagNodeStatus.QUEUED
      ) {
        node.status = DagNodeStatus.CANCELLED;
      }
    }

    workflow.status = DagWorkflowStatus.CANCELLED;
    workflow.completedAt = new Date();

    this.logger.log(`Workflow ${workflowId} cancelled`);
    return workflow;
  }

  /**
   * List all workflows (lightweight – returns workflow IDs and statuses).
   */
  listWorkflows(): Array<{
    workflowId: string;
    name?: string;
    status: DagWorkflowStatus;
    nodeCount: number;
    createdAt: Date;
  }> {
    return Array.from(this.workflows.values()).map((wf) => ({
      workflowId: wf.workflowId,
      name: wf.name,
      status: wf.status,
      nodeCount: wf.nodes.size,
      createdAt: wf.createdAt,
    }));
  }

  // ---------------------------------------------------------------------------
  // Dependency resolution
  // ---------------------------------------------------------------------------

  /**
   * Determine which nodes are ready to execute.
   *
   * A node is "ready" when it is PENDING and every upstream dependency
   * satisfies its declared condition.
   */
  resolveReadyJobs(workflow: DagWorkflow): string[] {
    const ready: string[] = [];

    for (const [nodeId, node] of workflow.nodes) {
      if (node.status !== DagNodeStatus.PENDING) continue;

      const allSatisfied = node.dependsOn.every((dep) => {
        const parent = workflow.nodes.get(dep.jobId);
        if (!parent) return false;
        return this.isConditionMet(parent, dep.condition);
      });

      if (allSatisfied) {
        ready.push(nodeId);
      }
    }

    return ready;
  }

  // ---------------------------------------------------------------------------
  // Event handling
  // ---------------------------------------------------------------------------

  private registerEventListeners(): void {
    this.eventEmitter.on(
      "dag.job.completed",
      (event: { workflowId: string; nodeId: string; result: any }) => {
        this.handleNodeCompletion(
          event.workflowId,
          event.nodeId,
          event.result,
        ).catch((err) =>
          this.logger.error(
            `Error handling completion for ${event.nodeId}: ${err.message}`,
            err.stack,
          ),
        );
      },
    );

    this.eventEmitter.on(
      "dag.job.failed",
      (event: { workflowId: string; nodeId: string; error: string }) => {
        this.handleNodeFailure(
          event.workflowId,
          event.nodeId,
          event.error,
        ).catch((err) =>
          this.logger.error(
            `Error handling failure for ${event.nodeId}: ${err.message}`,
            err.stack,
          ),
        );
      },
    );
  }

  /**
   * Handle a node completing successfully.
   */
  private async handleNodeCompletion(
    workflowId: string,
    nodeId: string,
    result: any,
  ): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    const node = workflow.nodes.get(nodeId);
    if (!node) return;

    node.status = DagNodeStatus.COMPLETED;
    node.result = result;

    this.logger.log(`Node "${nodeId}" in workflow ${workflowId} completed`);

    await this.advanceWorkflow(workflow);
  }

  /**
   * Handle a node failing.
   */
  private async handleNodeFailure(
    workflowId: string,
    nodeId: string,
    error: string,
  ): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    const node = workflow.nodes.get(nodeId);
    if (!node) return;

    node.status = DagNodeStatus.FAILED;
    node.error = error;

    this.logger.warn(
      `Node "${nodeId}" in workflow ${workflowId} failed: ${error}`,
    );

    await this.advanceWorkflow(workflow);
  }

  /**
   * After a node completes or fails, re-evaluate the DAG and enqueue
   * any newly-ready downstream nodes. If nothing is left to run,
   * finalize the workflow.
   */
  private async advanceWorkflow(workflow: DagWorkflow): Promise<void> {
    if (workflow.status === DagWorkflowStatus.CANCELLED) return;

    // Skip nodes whose conditions can never be met.
    this.skipUnreachableNodes(workflow);

    const readyJobs = this.resolveReadyJobs(workflow);

    for (const jobId of readyJobs) {
      await this.enqueueNode(workflow, jobId);
    }

    // Check if the workflow is finished.
    const allDone = Array.from(workflow.nodes.values()).every(
      (n) =>
        n.status === DagNodeStatus.COMPLETED ||
        n.status === DagNodeStatus.FAILED ||
        n.status === DagNodeStatus.SKIPPED ||
        n.status === DagNodeStatus.CANCELLED,
    );

    if (allDone) {
      this.finalizeWorkflow(workflow);
    }
  }

  /**
   * Mark PENDING nodes as SKIPPED when their dependency conditions
   * can never be satisfied (e.g. parent failed but condition is onSuccess
   * and there are no other paths).
   */
  private skipUnreachableNodes(workflow: DagWorkflow): void {
    let changed = true;

    while (changed) {
      changed = false;

      for (const [, node] of workflow.nodes) {
        if (node.status !== DagNodeStatus.PENDING) continue;

        const unreachable = node.dependsOn.some((dep) => {
          const parent = workflow.nodes.get(dep.jobId);
          if (!parent) return true;

          // If the parent is in a terminal state and the condition isn't met,
          // and the condition isn't ALWAYS, this node can never run.
          const parentTerminal =
            parent.status === DagNodeStatus.COMPLETED ||
            parent.status === DagNodeStatus.FAILED ||
            parent.status === DagNodeStatus.SKIPPED ||
            parent.status === DagNodeStatus.CANCELLED;

          if (parentTerminal && !this.isConditionMet(parent, dep.condition)) {
            return true;
          }

          return false;
        });

        if (unreachable) {
          node.status = DagNodeStatus.SKIPPED;
          changed = true;
        }
      }
    }
  }

  /**
   * Determine the final workflow status based on node outcomes.
   */
  private finalizeWorkflow(workflow: DagWorkflow): void {
    const statuses = Array.from(workflow.nodes.values()).map((n) => n.status);
    const hasFailures = statuses.includes(DagNodeStatus.FAILED);
    const hasCompleted = statuses.includes(DagNodeStatus.COMPLETED);

    if (hasFailures && hasCompleted) {
      workflow.status = DagWorkflowStatus.PARTIALLY_COMPLETED;
    } else if (hasFailures) {
      workflow.status = DagWorkflowStatus.FAILED;
    } else {
      workflow.status = DagWorkflowStatus.COMPLETED;
    }

    workflow.completedAt = new Date();

    this.logger.log(
      `Workflow ${workflow.workflowId} finalized as ${workflow.status}`,
    );

    this.eventEmitter.emit("dag.workflow.completed", {
      workflowId: workflow.workflowId,
      status: workflow.status,
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Enqueue a single DAG node into the Bull compute queue.
   * Attaches upstream results in the job's metadata so the processor
   * can access them via DagJobContext.
   */
  private async enqueueNode(
    workflow: DagWorkflow,
    nodeId: string,
  ): Promise<void> {
    const node = workflow.nodes.get(nodeId);
    if (!node) return;

    node.status = DagNodeStatus.QUEUED;

    const upstreamResults: Record<string, any> = {};
    for (const dep of node.dependsOn) {
      const parent = workflow.nodes.get(dep.jobId);
      if (parent?.result !== undefined) {
        upstreamResults[dep.jobId] = parent.result;
      }
    }

    const dagContext: DagJobContext = {
      workflowId: workflow.workflowId,
      nodeId,
      upstreamResults,
    };

    const jobData: ComputeJobData = {
      type: node.type,
      payload: node.payload,
      userId: node.userId,
      priority: node.priority,
      groupKey: node.groupKey,
      metadata: {
        ...node.metadata,
        dagContext,
      },
    };

    try {
      const job = await this.queueService.addComputeJob(jobData);
      node.queueJobId = String(job.id);
      node.status = DagNodeStatus.RUNNING;

      this.logger.log(
        `Node "${nodeId}" enqueued as Bull job ${job.id} in workflow ${workflow.workflowId}`,
      );
    } catch (err) {
      node.status = DagNodeStatus.FAILED;
      node.error = `Failed to enqueue: ${err.message}`;
      this.logger.error(
        `Failed to enqueue node "${nodeId}": ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Check whether a dependency condition is satisfied by the parent node's
   * current status.
   */
  private isConditionMet(
    parent: DagNode,
    condition: DependencyCondition,
  ): boolean {
    switch (condition) {
      case DependencyCondition.ON_SUCCESS:
        return parent.status === DagNodeStatus.COMPLETED;

      case DependencyCondition.ON_FAILURE:
        return parent.status === DagNodeStatus.FAILED;

      case DependencyCondition.ON_PARTIAL_SUCCESS:
        return (
          parent.status === DagNodeStatus.COMPLETED ||
          parent.status === DagNodeStatus.FAILED
        );

      case DependencyCondition.ALWAYS:
        return (
          parent.status === DagNodeStatus.COMPLETED ||
          parent.status === DagNodeStatus.FAILED ||
          parent.status === DagNodeStatus.SKIPPED ||
          parent.status === DagNodeStatus.CANCELLED
        );

      default:
        return false;
    }
  }

  private generateWorkflowId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 8);
    return `wf-${ts}-${rand}`;
  }
}
