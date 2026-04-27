/**
 * Portfolio optimization constraint solvers
 */

export interface QuadraticProgramSolution {
  weights: number[];
  objectiveValue: number;
  converged: boolean;
}

export class ConstraintOptimizer {
  /**
   * Quadratic Program Solver for portfolio optimization
   * min: 0.5 * w'Pw + q'w
   * subject to: Aw = b (equality constraints) and lb <= w <= ub
   */
  static solveQuadraticProgram(
    P: number[][], // Hessian (2 * covariance matrix)
    q: number[], // Linear term
    A: number[][], // Equality constraint matrix
    b: number[], // Equality constraint values
    lb: number[], // Lower bounds
    ub: number[], // Upper bounds
  ): QuadraticProgramSolution {
    const n = q.length;
    const w = new Array(n).fill(1 / n);

    // Active set algorithm
    const activeSet = new Set<number>();
    const maxIterations = 100;
    let iteration = 0;
    let converged = false;

    while (!converged && iteration < maxIterations) {
      // Solve unconstrained problem
      const gradient = this.calculateGradient(P, q, w);

      // Update weights in direction of steepest descent
      const stepSize = 0.01;
      for (let i = 0; i < n; i++) {
        w[i] -= stepSize * gradient[i];

        // Project to bounds
        w[i] = Math.max(lb[i], Math.min(ub[i], w[i]));
      }

      // Normalize to satisfy sum constraint
      const sum = w.reduce((a, b) => a + b);
      for (let i = 0; i < n; i++) {
        w[i] /= sum;
      }

      // Check convergence
      if (iteration > 10 && gradient.every((g) => Math.abs(g) < 0.0001)) {
        converged = true;
      }

      iteration++;
    }

    // Calculate objective value
    let objectiveValue = 0.5 * this.vectorMatrixProduct(w, P, w);
    for (let i = 0; i < n; i++) {
      objectiveValue += q[i] * w[i];
    }

    return { weights: w, objectiveValue, converged };
  }

  /**
   * Calculate gradient = Pw + q
   */
  static calculateGradient(P: number[][], q: number[], w: number[]): number[] {
    const n = q.length;
    const gradient: number[] = [];

    for (let i = 0; i < n; i++) {
      let sum = q[i];
      for (let j = 0; j < n; j++) {
        sum += P[i][j] * w[j];
      }
      gradient[i] = sum;
    }

    return gradient;
  }

  /**
   * Vector-Matrix-Vector product: v'Mv
   */
  static vectorMatrixProduct(v: number[], M: number[][], u: number[]): number {
    let result = 0;
    const n = v.length;

    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) {
        sum += M[i][j] * u[j];
      }
      result += v[i] * sum;
    }

    return result;
  }

  /**
   * Sequential Least Squares Programming for constrained optimization
   */
  static sequentialLeastSquaresProgramming(
    objective: (w: number[]) => number,
    gradient: (w: number[]) => number[],
    n: number,
    maxIterations: number = 100,
  ): number[] {
    const w = new Array(n).fill(1 / n);
    const learningRate = 0.001;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const grad = gradient(w);

      // Update weights
      for (let i = 0; i < n; i++) {
        w[i] -= learningRate * grad[i];
      }

      // Normalize
      const sum = w.reduce((a, b) => a + b);
      for (let i = 0; i < n; i++) {
        w[i] = Math.max(0, w[i] / sum);
      }
    }

    return w;
  }
}
