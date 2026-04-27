import { DagValidator } from "./dag.validator";
import { DagDependency, DependencyCondition } from "./dag.interfaces";

describe("DagValidator", () => {
  let validator: DagValidator;

  beforeEach(() => {
    validator = new DagValidator();
  });

  describe("validate", () => {
    it("should accept a single node with no dependencies", () => {
      const nodes = new Map<string, DagDependency[]>();
      nodes.set("job-a", []);

      const result = validator.validate(nodes);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.topologicalOrder).toEqual(["job-a"]);
    });

    it("should accept a simple linear chain A → B → C", () => {
      const nodes = new Map<string, DagDependency[]>();
      nodes.set("a", []);
      nodes.set("b", [
        { jobId: "a", condition: DependencyCondition.ON_SUCCESS },
      ]);
      nodes.set("c", [
        { jobId: "b", condition: DependencyCondition.ON_SUCCESS },
      ]);

      const result = validator.validate(nodes);

      expect(result.valid).toBe(true);
      expect(result.topologicalOrder).toBeDefined();
      const order = result.topologicalOrder!;
      expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
      expect(order.indexOf("b")).toBeLessThan(order.indexOf("c"));
    });

    it("should accept a diamond-shaped DAG", () => {
      //     A
      //    / \
      //   B   C
      //    \ /
      //     D
      const nodes = new Map<string, DagDependency[]>();
      nodes.set("a", []);
      nodes.set("b", [
        { jobId: "a", condition: DependencyCondition.ON_SUCCESS },
      ]);
      nodes.set("c", [
        { jobId: "a", condition: DependencyCondition.ON_SUCCESS },
      ]);
      nodes.set("d", [
        { jobId: "b", condition: DependencyCondition.ON_SUCCESS },
        { jobId: "c", condition: DependencyCondition.ON_SUCCESS },
      ]);

      const result = validator.validate(nodes);

      expect(result.valid).toBe(true);
      const order = result.topologicalOrder!;
      expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
      expect(order.indexOf("a")).toBeLessThan(order.indexOf("c"));
      expect(order.indexOf("b")).toBeLessThan(order.indexOf("d"));
      expect(order.indexOf("c")).toBeLessThan(order.indexOf("d"));
    });

    it("should accept parallel independent nodes", () => {
      const nodes = new Map<string, DagDependency[]>();
      nodes.set("x", []);
      nodes.set("y", []);
      nodes.set("z", []);

      const result = validator.validate(nodes);

      expect(result.valid).toBe(true);
      expect(result.topologicalOrder).toHaveLength(3);
    });

    it("should reject an empty graph", () => {
      const nodes = new Map<string, DagDependency[]>();

      const result = validator.validate(nodes);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("DAG must contain at least one node");
    });

    it("should reject self-dependencies", () => {
      const nodes = new Map<string, DagDependency[]>();
      nodes.set("a", [
        { jobId: "a", condition: DependencyCondition.ON_SUCCESS },
      ]);

      const result = validator.validate(nodes);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("self-dependency"))).toBe(
        true,
      );
    });

    it("should reject references to unknown nodes", () => {
      const nodes = new Map<string, DagDependency[]>();
      nodes.set("a", []);
      nodes.set("b", [
        { jobId: "ghost", condition: DependencyCondition.ON_SUCCESS },
      ]);

      const result = validator.validate(nodes);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('unknown node "ghost"')),
      ).toBe(true);
    });

    it("should reject a simple two-node cycle A ↔ B", () => {
      const nodes = new Map<string, DagDependency[]>();
      nodes.set("a", [
        { jobId: "b", condition: DependencyCondition.ON_SUCCESS },
      ]);
      nodes.set("b", [
        { jobId: "a", condition: DependencyCondition.ON_SUCCESS },
      ]);

      const result = validator.validate(nodes);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Circular dependency"))).toBe(
        true,
      );
    });

    it("should reject a three-node cycle A → B → C → A", () => {
      const nodes = new Map<string, DagDependency[]>();
      nodes.set("a", [
        { jobId: "c", condition: DependencyCondition.ON_SUCCESS },
      ]);
      nodes.set("b", [
        { jobId: "a", condition: DependencyCondition.ON_SUCCESS },
      ]);
      nodes.set("c", [
        { jobId: "b", condition: DependencyCondition.ON_SUCCESS },
      ]);

      const result = validator.validate(nodes);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Circular dependency"))).toBe(
        true,
      );
    });

    it("should reject a cycle embedded in a larger valid graph", () => {
      // root → a → b → c → a  (cycle among a, b, c)
      //              → d       (valid leaf)
      const nodes = new Map<string, DagDependency[]>();
      nodes.set("root", []);
      nodes.set("a", [
        { jobId: "root", condition: DependencyCondition.ON_SUCCESS },
        { jobId: "c", condition: DependencyCondition.ON_SUCCESS },
      ]);
      nodes.set("b", [
        { jobId: "a", condition: DependencyCondition.ON_SUCCESS },
      ]);
      nodes.set("c", [
        { jobId: "b", condition: DependencyCondition.ON_SUCCESS },
      ]);
      nodes.set("d", [
        { jobId: "b", condition: DependencyCondition.ON_SUCCESS },
      ]);

      const result = validator.validate(nodes);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Circular dependency"))).toBe(
        true,
      );
    });

    it("should handle nodes with multiple dependency conditions", () => {
      const nodes = new Map<string, DagDependency[]>();
      nodes.set("extract", []);
      nodes.set("transform", [
        { jobId: "extract", condition: DependencyCondition.ON_SUCCESS },
      ]);
      nodes.set("error-handler", [
        { jobId: "extract", condition: DependencyCondition.ON_FAILURE },
      ]);
      nodes.set("cleanup", [
        { jobId: "transform", condition: DependencyCondition.ALWAYS },
        { jobId: "error-handler", condition: DependencyCondition.ALWAYS },
      ]);

      const result = validator.validate(nodes);

      expect(result.valid).toBe(true);
      const order = result.topologicalOrder!;
      expect(order.indexOf("extract")).toBeLessThan(order.indexOf("transform"));
      expect(order.indexOf("extract")).toBeLessThan(
        order.indexOf("error-handler"),
      );
      expect(order.indexOf("transform")).toBeLessThan(order.indexOf("cleanup"));
      expect(order.indexOf("error-handler")).toBeLessThan(
        order.indexOf("cleanup"),
      );
    });

    it("should validate a 1000-node graph in under 100ms", () => {
      const nodes = new Map<string, DagDependency[]>();
      // Build a wide fan-out/fan-in graph: root → 998 middle nodes → leaf
      nodes.set("root", []);
      for (let i = 0; i < 998; i++) {
        nodes.set(`mid-${i}`, [
          { jobId: "root", condition: DependencyCondition.ON_SUCCESS },
        ]);
      }
      nodes.set("leaf", [
        { jobId: "mid-0", condition: DependencyCondition.ON_SUCCESS },
      ]);

      const start = performance.now();
      const result = validator.validate(nodes);
      const elapsed = performance.now() - start;

      expect(result.valid).toBe(true);
      expect(result.topologicalOrder).toHaveLength(1000);
      expect(elapsed).toBeLessThan(100);
    });

    it("should report multiple errors at once", () => {
      const nodes = new Map<string, DagDependency[]>();
      nodes.set("a", [
        { jobId: "a", condition: DependencyCondition.ON_SUCCESS },
      ]);
      nodes.set("b", [
        { jobId: "missing", condition: DependencyCondition.ON_SUCCESS },
      ]);

      const result = validator.validate(nodes);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
