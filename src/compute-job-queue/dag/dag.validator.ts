import { Injectable, Logger } from "@nestjs/common";
import { DagDependency, DagValidationResult } from "./dag.interfaces";

/**
 * Validates DAG structure at submission time.
 *
 * Responsibilities:
 *  - Detect circular dependencies via DFS-based cycle detection.
 *  - Verify all dependency references point to existing nodes.
 *  - Produce a topological ordering (Kahn's algorithm) for scheduling.
 *  - Enforce structural constraints (no self-loops, non-empty graph).
 *
 * Performance target: < 100 ms for 1 000-node graphs.
 */
@Injectable()
export class DagValidator {
  private readonly logger = new Logger(DagValidator.name);

  /**
   * Validate a DAG described as a mapping of nodeId → dependencies.
   *
   * @param nodes Map of nodeId to its dependency list.
   * @returns Validation result with errors (if any) and topological order.
   */
  validate(nodes: Map<string, DagDependency[]>): DagValidationResult {
    const errors: string[] = [];
    const nodeIds = new Set(nodes.keys());

    if (nodeIds.size === 0) {
      return { valid: false, errors: ["DAG must contain at least one node"] };
    }

    // --- structural checks ---------------------------------------------------

    for (const [nodeId, deps] of nodes) {
      for (const dep of deps) {
        if (dep.jobId === nodeId) {
          errors.push(`Node "${nodeId}" has a self-dependency`);
        }
        if (!nodeIds.has(dep.jobId)) {
          errors.push(
            `Node "${nodeId}" depends on unknown node "${dep.jobId}"`,
          );
        }
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // --- cycle detection (DFS with 3-colour marking) -------------------------

    const cycleErrors = this.detectCycles(nodes);
    if (cycleErrors.length > 0) {
      return { valid: false, errors: cycleErrors };
    }

    // --- topological sort (Kahn's algorithm) ---------------------------------

    const topologicalOrder = this.topologicalSort(nodes);
    if (topologicalOrder.length !== nodeIds.size) {
      // Should not happen if cycle detection is correct, but guard anyway.
      return {
        valid: false,
        errors: [
          "Topological sort produced incomplete ordering – possible cycle",
        ],
      };
    }

    return { valid: true, errors: [], topologicalOrder };
  }

  /**
   * Detect cycles using iterative DFS with a three-colour scheme:
   *  WHITE (unvisited) → GREY (in current path) → BLACK (fully explored).
   *
   * Returns an array of error strings describing each cycle found.
   */
  private detectCycles(nodes: Map<string, DagDependency[]>): string[] {
    const WHITE = 0;
    const GREY = 1;
    const BLACK = 2;

    const colour = new Map<string, number>();
    for (const id of nodes.keys()) {
      colour.set(id, WHITE);
    }

    // Build forward adjacency (parent → children) from dependency edges.
    const children = new Map<string, string[]>();
    for (const id of nodes.keys()) {
      children.set(id, []);
    }
    for (const [nodeId, deps] of nodes) {
      for (const dep of deps) {
        const list = children.get(dep.jobId);
        if (list) {
          list.push(nodeId);
        }
      }
    }

    const errors: string[] = [];

    for (const startId of nodes.keys()) {
      if (colour.get(startId) !== WHITE) continue;

      // Iterative DFS using an explicit stack of [nodeId, childIndex].
      const stack: Array<[string, number]> = [[startId, 0]];
      colour.set(startId, GREY);

      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        const nodeId = top[0];
        const childList = children.get(nodeId) || [];

        if (top[1] < childList.length) {
          const child = childList[top[1]];
          top[1]++;

          const childColour = colour.get(child);
          if (childColour === GREY) {
            // Back-edge detected → cycle.
            const cyclePath = stack
              .map(([id]) => id)
              .slice(stack.findIndex(([id]) => id === child));
            cyclePath.push(child);
            errors.push(
              `Circular dependency detected: ${cyclePath.join(" → ")}`,
            );
          } else if (childColour === WHITE) {
            colour.set(child, GREY);
            stack.push([child, 0]);
          }
        } else {
          colour.set(nodeId, BLACK);
          stack.pop();
        }
      }
    }

    return errors;
  }

  /**
   * Kahn's algorithm – produces a topological ordering.
   * Nodes with no dependencies are processed first.
   */
  private topologicalSort(nodes: Map<string, DagDependency[]>): string[] {
    // In-degree: how many parents must complete before this node.
    const inDegree = new Map<string, number>();
    // Forward adjacency: parent → children.
    const children = new Map<string, string[]>();

    for (const id of nodes.keys()) {
      inDegree.set(id, 0);
      children.set(id, []);
    }

    for (const [nodeId, deps] of nodes) {
      inDegree.set(nodeId, deps.length);
      for (const dep of deps) {
        children.get(dep.jobId)?.push(nodeId);
      }
    }

    // Seed the queue with root nodes (in-degree 0).
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    const sorted: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      for (const child of children.get(current) || []) {
        const newDegree = (inDegree.get(child) || 1) - 1;
        inDegree.set(child, newDegree);
        if (newDegree === 0) {
          queue.push(child);
        }
      }
    }

    return sorted;
  }
}
