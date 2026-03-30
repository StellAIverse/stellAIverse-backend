import * as numeric from "numeric";

/**
 * Modern Portfolio Theory (Markowitz) algorithms for portfolio optimization
 */

export interface AssetMetrics {
  ticker: string;
  expectedReturn: number;
  volatility: number;
  price: number;
  name: string;
}

export interface PortfolioMetrics {
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
  allocation: Record<string, number>;
  weights: number[];
}

export interface OptimizationConstraints {
  minWeight?: number;
  maxWeight?: number;
  assetLimits?: Record<string, { min: number; max: number }>;
  sectors?: Record<string, { min: number; max: number }>;
}

export class ModernPortfolioTheory {
  /**
   * Calculate covariance matrix from correlation matrix and volatilities
   */
  static calculateCovarianceMatrix(
    volatilities: number[],
    correlationMatrix: number[][],
  ): number[][] {
    const n = volatilities.length;
    const covarianceMatrix: number[][] = [];

    for (let i = 0; i < n; i++) {
      covarianceMatrix[i] = [];
      for (let j = 0; j < n; j++) {
        covarianceMatrix[i][j] =
          volatilities[i] * volatilities[j] * correlationMatrix[i][j];
      }
    }

    return covarianceMatrix;
  }

  /**
   * Calculate correlation matrix from historical returns
   */
  static calculateCorrelationMatrix(returns: number[][]): number[][] {
    const n = returns[0].length;
    const correlations: number[][] = [];

    for (let i = 0; i < n; i++) {
      correlations[i] = [];
      for (let j = 0; j < n; j++) {
        const column1 = returns.map((row) => row[i]);
        const column2 = returns.map((row) => row[j]);
        const correlation = this.pearsonCorrelation(column1, column2);
        correlations[i][j] = correlation;
      }
    }

    return correlations;
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  static pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    const meanX = x.reduce((a, b) => a + b) / n;
    const meanY = y.reduce((a, b) => a + b) / n;

    let numerator = 0;
    let sumXSquared = 0;
    let sumYSquared = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      sumXSquared += dx * dx;
      sumYSquared += dy * dy;
    }

    const denominator = Math.sqrt(sumXSquared * sumYSquared);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Calculate portfolio metrics given weights
   */
  static calculatePortfolioMetrics(
    weights: number[],
    expectedReturns: number[],
    covarianceMatrix: number[][],
    riskFreeRate: number = 0.02,
  ): PortfolioMetrics {
    let portfolioReturn = 0;
    for (let i = 0; i < weights.length; i++) {
      portfolioReturn += weights[i] * expectedReturns[i];
    }

    let portfolioVariance = 0;
    for (let i = 0; i < weights.length; i++) {
      for (let j = 0; j < weights.length; j++) {
        portfolioVariance += weights[i] * weights[j] * covarianceMatrix[i][j];
      }
    }
    const portfolioVolatility = Math.sqrt(portfolioVariance);

    const sharpeRatio =
      (portfolioReturn - riskFreeRate) / portfolioVolatility || 0;

    // Convert weights back to allocation
    const allocation: Record<string, number> = {};

    return {
      expectedReturn: portfolioReturn,
      volatility: portfolioVolatility,
      sharpeRatio: sharpeRatio,
      allocation,
      weights,
    };
  }

  /**
   * Mean-Variance Optimization (Markowitz)
   * Finds the portfolio that maximizes Sharpe ratio
   */
  static meanVarianceOptimization(
    expectedReturns: number[],
    covarianceMatrix: number[][],
    constraints: OptimizationConstraints = {},
    riskFreeRate: number = 0.02,
  ): number[] {
    const n = expectedReturns.length;

    // Initialize with equal weights
    let weights = new Array(n).fill(1 / n);

    // Simple gradient-based optimization
    const learningRate = 0.001;
    let iterations = 0;
    const maxIterations = 1000;
    let improvement = Infinity;

    while (improvement > 0.0001 && iterations < maxIterations) {
      // Calculate current portfolio metrics
      const metrics = this.calculatePortfolioMetrics(
        weights,
        expectedReturns,
        covarianceMatrix,
        riskFreeRate,
      );
      const currentSharpe = metrics.sharpeRatio;

      // Calculate gradient of Sharpe ratio
      const gradient = this.calculateSharpeGradient(
        weights,
        expectedReturns,
        covarianceMatrix,
        riskFreeRate,
      );

      // Update weights
      const oldWeights = [...weights];
      for (let i = 0; i < n; i++) {
        weights[i] += learningRate * gradient[i];
      }

      // Normalize weights to sum to 1
      const sum = weights.reduce((a, b) => a + b);
      for (let i = 0; i < n; i++) {
        weights[i] /= sum;
      }

      // Apply constraints
      weights = this.applyConstraints(weights, constraints);

      // Calculate new Sharpe ratio
      const newMetrics = this.calculatePortfolioMetrics(
        weights,
        expectedReturns,
        covarianceMatrix,
        riskFreeRate,
      );
      improvement = newMetrics.sharpeRatio - currentSharpe;

      iterations++;
    }

    return weights;
  }

  /**
   * Calculate gradient of Sharpe ratio
   */
  static calculateSharpeGradient(
    weights: number[],
    expectedReturns: number[],
    covarianceMatrix: number[][],
    riskFreeRate: number,
  ): number[] {
    const n = weights.length;
    const gradient: number[] = [];

    const metrics = this.calculatePortfolioMetrics(
      weights,
      expectedReturns,
      covarianceMatrix,
      riskFreeRate,
    );

    for (let i = 0; i < n; i++) {
      let covariance = 0;
      for (let j = 0; j < n; j++) {
        covariance += 2 * weights[j] * covarianceMatrix[i][j];
      }

      gradient[i] =
        (expectedReturns[i] - riskFreeRate) / metrics.volatility -
        ((metrics.expectedReturn - riskFreeRate) * covariance) /
          metrics.volatility ** 3;
    }

    return gradient;
  }

  /**
   * Risk Parity - Equal risk contribution from all assets
   */
  static riskParityOptimization(
    covarianceMatrix: number[][],
    constraints: OptimizationConstraints = {},
  ): number[] {
    const n = covarianceMatrix.length;
    let weights = new Array(n).fill(1 / n);

    // Iteratively find weights that contribute equally to portfolio volatility
    for (let iteration = 0; iteration < 100; iteration++) {
      // Calculate portfolio volatility
      let portfolioVariance = 0;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          portfolioVariance += weights[i] * weights[j] * covarianceMatrix[i][j];
        }
      }
      const portfolioVolatility = Math.sqrt(portfolioVariance);

      // Calculate risk contribution for each asset
      const riskContribution: number[] = [];
      for (let i = 0; i < n; i++) {
        let marginalRisk = 0;
        for (let j = 0; j < n; j++) {
          marginalRisk += weights[j] * covarianceMatrix[i][j];
        }
        riskContribution[i] = (weights[i] * marginalRisk) / portfolioVolatility;
      }

      // Update weights to equalize risk contribution
      const targetRisk = 1 / n;
      for (let i = 0; i < n; i++) {
        if (riskContribution[i] > 0) {
          weights[i] *= targetRisk / riskContribution[i];
        }
      }

      // Normalize
      const sum = weights.reduce((a, b) => a + b);
      for (let i = 0; i < n; i++) {
        weights[i] /= sum;
      }

      weights = this.applyConstraints(weights, constraints);
    }

    return weights;
  }

  /**
   * Minimum Variance Portfolio
   */
  static minVarianceOptimization(
    covarianceMatrix: number[][],
    constraints: OptimizationConstraints = {},
  ): number[] {
    const n = covarianceMatrix.length;

    // Start with equal weights
    let weights = new Array(n).fill(1 / n);

    // Gradient descent to minimize variance
    const learningRate = 0.001;
    for (let iteration = 0; iteration < 1000; iteration++) {
      // Calculate gradient of portfolio variance
      const gradient: number[] = [];
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) {
          sum += 2 * weights[j] * covarianceMatrix[i][j];
        }
        gradient[i] = sum;
      }

      // Update weights
      for (let i = 0; i < n; i++) {
        weights[i] -= learningRate * gradient[i];
      }

      // Normalize
      const sum = weights.reduce((a, b) => a + b);
      for (let i = 0; i < n; i++) {
        weights[i] /= sum;
      }

      weights = this.applyConstraints(weights, constraints);
    }

    return weights;
  }

  /**
   * Efficient Frontier - Multiple portfolios at different risk levels
   */
  static efficientFrontier(
    expectedReturns: number[],
    covarianceMatrix: number[][],
    numberOfPoints: number = 50,
    constraints: OptimizationConstraints = {},
  ): PortfolioMetrics[] {
    const frontier: PortfolioMetrics[] = [];
    const targetReturns: number[] = [];

    const minReturn = Math.min(...expectedReturns);
    const maxReturn = Math.max(...expectedReturns);

    for (let i = 0; i < numberOfPoints; i++) {
      const targetReturn =
        minReturn + ((maxReturn - minReturn) * i) / numberOfPoints;
      targetReturns.push(targetReturn);
    }

    // For each target return, find minimum variance portfolio
    for (const targetReturn of targetReturns) {
      const weights = this.minVariancePortfolioWithTarget(
        expectedReturns,
        covarianceMatrix,
        targetReturn,
        constraints,
      );

      const metrics = this.calculatePortfolioMetrics(
        weights,
        expectedReturns,
        covarianceMatrix,
      );

      frontier.push(metrics);
    }

    return frontier;
  }

  /**
   * Find minimum variance portfolio with target return
   */
  static minVariancePortfolioWithTarget(
    expectedReturns: number[],
    covarianceMatrix: number[][],
    targetReturn: number,
    constraints: OptimizationConstraints = {},
  ): number[] {
    const n = expectedReturns.length;
    let weights = new Array(n).fill(1 / n);

    const learningRate = 0.001;
    for (let iteration = 0; iteration < 1000; iteration++) {
      // Calculate current return and variance
      let currentReturn = 0;
      let variance = 0;

      for (let i = 0; i < n; i++) {
        currentReturn += weights[i] * expectedReturns[i];
        for (let j = 0; j < n; j++) {
          variance += weights[i] * weights[j] * covarianceMatrix[i][j];
        }
      }

      // If return is already at target, minimize variance only
      if (Math.abs(currentReturn - targetReturn) < 0.001) {
        // Minimize variance gradient
        for (let i = 0; i < n; i++) {
          let sum = 0;
          for (let j = 0; j < n; j++) {
            sum += 2 * weights[j] * covarianceMatrix[i][j];
          }
          weights[i] -= learningRate * sum;
        }
      } else {
        // Adjust weights to reach target return
        const returnDifference = currentReturn - targetReturn;
        for (let i = 0; i < n; i++) {
          weights[i] -=
            (learningRate * returnDifference * expectedReturns[i]) / 100;
        }
      }

      // Normalize
      const sum = weights.reduce((a, b) => a + b);
      for (let i = 0; i < n; i++) {
        weights[i] /= sum;
      }

      weights = this.applyConstraints(weights, constraints);
    }

    return weights;
  }

  /**
   * Apply weight constraints
   */
  static applyConstraints(
    weights: number[],
    constraints: OptimizationConstraints,
  ): number[] {
    const result = [...weights];
    const minWeight = constraints.minWeight || 0;
    const maxWeight = constraints.maxWeight || 1;

    for (let i = 0; i < result.length; i++) {
      result[i] = Math.max(minWeight, Math.min(maxWeight, result[i]));
    }

    // Normalize to ensure sum = 1
    const sum = result.reduce((a, b) => a + b);
    for (let i = 0; i < result.length; i++) {
      result[i] /= sum;
    }

    return result;
  }

  /**
   * Calculate Value at Risk (VaR) - parametric method
   */
  static calculateValueAtRisk(
    portfolioReturn: number,
    volatility: number,
    confidence: number = 0.95,
    capital: number = 100000,
  ): number {
    // Inverse normal distribution for Z-score
    const zScore = this.inverseNormalDistribution(confidence);
    return Math.abs(portfolioReturn - zScore * volatility) * capital;
  }

  /**
   * Inverse normal distribution approximation
   */
  static inverseNormalDistribution(p: number): number {
    if (p < 0.5) {
      const t = Math.sqrt(-2 * Math.log(p));
      return (
        -(
          (2.515517 + 0.802853 * t + 0.010328 * t * t) /
          (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t)
        ) * t
      );
    } else {
      const t = Math.sqrt(-2 * Math.log(1 - p));
      return (
        ((2.515517 + 0.802853 * t + 0.010328 * t * t) /
          (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t)) *
        t
      );
    }
  }
}
