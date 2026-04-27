/**
 * Core interfaces for the DAG-based job orchestration system.
 *
 * A DAG workflow groups multiple compute jobs with explicit
 * dependency edges, optional execution conditions, and a shared
 * result context so downstream jobs can consume upstream outputs.
 */

/** Condition under which a dependent job should execute. */
export enum DependencyCondition {
  ON_SUCCESS = "onSuccess",
  ON_FAILURE = "onFailure",
  ON_PARTIAL_SUCCESS = "onPartialSuccess",
  ALWAYS = "always",
}

/** Lifecycle status of an individual DAG node (job). */
export enum DagNodeStatus {
  PENDING = "pending",
  QUEUED = "queued",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  SKIPPED = "skipped",
  CANCELLED = "cancelled",
}

/** Lifecycle status of the overall DAG workflow. */
export enum DagWorkflowStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  PARTIALLY_COMPLETED = "partially_completed",
  CANCELLED = "cancelled",
}

/** A single dependency edge: "this node depends on `jobId` under `condition`." */
export interface DagDependency {
  jobId: string;
  condition: DependencyCondition;
}

/** One node in the DAG – wraps a compute job with dependency metadata. */
export interface DagNode {
  /** Unique identifier within the workflow (user-supplied or generated). */
  jobId: string;
  /** Job type routed to the processor (maps to ComputeJobData.type). */
  type: string;
  /** Arbitrary payload forwarded to the job processor. */
  payload: any;
  /** Optional owning user. */
  userId?: string;
  /** Queue priority (lower = higher). */
  priority?: number;
  /** Grouping key for correlation. */
  groupKey?: string;
  /** Extra metadata forwarded to the job. */
  metadata?: Record<string, any>;
  /** Upstream dependencies with execution conditions. */
  dependsOn: DagDependency[];
  /** Runtime status – managed by the DAG service. */
  status: DagNodeStatus;
  /** Result stored after the job completes (success or failure). */
  result?: any;
  /** Error message if the job failed. */
  error?: string;
  /** Bull queue job ID once enqueued. */
  queueJobId?: string;
}

/** Full DAG workflow stored in memory / DB. */
export interface DagWorkflow {
  /** Unique workflow identifier. */
  workflowId: string;
  /** Human-readable label. */
  name?: string;
  /** All nodes keyed by jobId for O(1) lookup. */
  nodes: Map<string, DagNode>;
  /** Adjacency list: parent jobId → set of child jobIds. */
  edges: Map<string, Set<string>>;
  /** Reverse adjacency: child jobId → set of parent jobIds. */
  reverseEdges: Map<string, Set<string>>;
  /** Overall status. */
  status: DagWorkflowStatus;
  /** Topologically sorted node IDs (computed once at validation time). */
  topologicalOrder: string[];
  /** Timestamp of workflow creation. */
  createdAt: Date;
  /** Timestamp of workflow completion (success, failure, or cancellation). */
  completedAt?: Date;
  /** The user who submitted the workflow. */
  userId?: string;
  /** Arbitrary workflow-level metadata. */
  metadata?: Record<string, any>;
}

/** Lightweight result struct passed between DAG stages. */
export interface DagJobContext {
  /** Mapping of upstream jobId → its result data. */
  upstreamResults: Record<string, any>;
  /** The workflow this job belongs to. */
  workflowId: string;
  /** This node's jobId within the workflow. */
  nodeId: string;
}

/** Validation result returned by the DAG validator. */
export interface DagValidationResult {
  valid: boolean;
  errors: string[];
  topologicalOrder?: string[];
}
