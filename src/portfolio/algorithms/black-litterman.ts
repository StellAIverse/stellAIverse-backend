/**
 * Black-Litterman model for portfolio optimization
 * Combines market equilibrium with investor views
 */

export interface BlView {
  asset: string;
  expectedReturn: number;
  confidence: number; // 0-1
}

export interface MarketData {
  returns: number[];
  marketCapWeights: number[];
  riskFreeRate: number;
}

export class BlackLittermanModel {
  /**
   * Calculate Black-Litterman adjusted expected returns
   */
  static calculateAdjustedReturns(
    marketReturns: number[],
    marketCapWeights: number[],
    views: BlView[],
    covarianceMatrix: number[][],
    riskFreeRate: number = 0.02,
    riskAversion: number = 2.5,
  ): number[] {
    const n = marketReturns.length;

    // Step 1: Calculate implied market return (equilibrium return)
    let portfolioReturn = 0;
    for (let i = 0; i < n; i++) {
      portfolioReturn += marketCapWeights[i] * marketReturns[i];
    }

    // Step 2: Calculate portfolio variance
    let portfolioVariance = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        portfolioVariance +=
          marketCapWeights[i] * marketCapWeights[j] * covarianceMatrix[i][j];
      }
    }

    // Implied excess return (market return - risk-free rate adjusted)
    const tau = 0.025; // Scaling parameter
    const adjustedCovMatrix = this.multiplyMatrix(covarianceMatrix, tau);

    // Step 3: Build view matrix and view returns
    const viewMatrix = this.buildViewMatrix(n, views);
    const viewReturns = views.map((v) => v.expectedReturn);
    const viewConfidence = views.map((v) => v.confidence);

    // Step 4: Calculate posterior expected returns
    const posteriorReturns = this.calculatePosterior(
      marketReturns,
      viewMatrix,
      viewReturns,
      viewConfidence,
      adjustedCovMatrix,
      covarianceMatrix,
    );

    return posteriorReturns;
  }

  /**
   * Build view matrix from investor views
   */
  static buildViewMatrix(n: number, views: BlView[]): number[][] {
    const viewMatrix: number[][] = [];

    for (const view of views) {
      const row = new Array(n).fill(0);
      // This is simplified - in practice you'd map asset names to indices
      row[0] = 1; // Placeholder
      viewMatrix.push(row);
    }

    return viewMatrix;
  }

  /**
   * Calculate posterior expected returns
   */
  static calculatePosterior(
    priorReturns: number[],
    viewMatrix: number[][],
    viewReturns: number[],
    viewConfidence: number[],
    tau_cov: number[][],
    cov: number[][],
  ): number[] {
    const n = priorReturns.length;
    const k = viewMatrix.length;

    // Uncertainty in views (inverse of confidence)
    const omega = new Array(k)
      .fill(0)
      .map((_, i) => [1 / Math.max(viewConfidence[i], 0.01)]);

    // Posterior precision = prior precision + view precision
    const precision = this.invertMatrix(tau_cov);

    // Updated expected returns
    const adjusted = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      adjusted[i] = priorReturns[i];
    }

    // Update based on views (simplified Bayesian update)
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < n; j++) {
        adjusted[j] += viewMatrix[i][j] * viewReturns[i] * viewConfidence[i];
      }
    }

    // Normalize
    const sum = adjusted.reduce((a, b) => a + b);
    for (let i = 0; i < n; i++) {
      adjusted[i] /= sum / n;
    }

    return adjusted;
  }

  /**
   * Multiply matrix by scalar
   */
  static multiplyMatrix(matrix: number[][], scalar: number): number[][] {
    return matrix.map((row) => row.map((val) => val * scalar));
  }

  /**
   * Invert 2x2 matrix (simplified)
   */
  static invertMatrix(matrix: number[][]): number[][] {
    if (matrix.length === 1) {
      return [[1 / matrix[0][0]]];
    }

    if (matrix.length === 2) {
      const det = matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
      return [
        [matrix[1][1] / det, -matrix[0][1] / det],
        [-matrix[1][0] / det, matrix[0][0] / det],
      ];
    }

    // For larger matrices, use simplified approach
    return matrix.map((row) => row.map((val) => (1 / val) * 0.1));
  }
}
