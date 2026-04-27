import { ModernPortfolioTheory } from '../../src/portfolio/algorithms/modern-portfolio-theory';

describe('ModernPortfolioTheory', () => {
  describe('calculatePortfolioMetrics', () => {
    it('should calculate portfolio metrics correctly', () => {
      const weights = [0.6, 0.4];
      const expectedReturns = [0.08, 0.12];
      const correlationMatrix = [
        [1, 0.5],
        [0.5, 1],
      ];
      const volatilities = [0.15, 0.20];

      const covarianceMatrix =
        ModernPortfolioTheory.calculateCovarianceMatrix(
          volatilities,
          correlationMatrix,
        );

      const metrics =
        ModernPortfolioTheory.calculatePortfolioMetrics(
          weights,
          expectedReturns,
          covarianceMatrix,
        );

      expect(metrics.weights).toEqual(weights);
      expect(metrics.expectedReturn).toBeCloseTo(0.096);
      expect(metrics.volatility).toBeGreaterThan(0);
      expect(metrics.sharpeRatio).toBeGreaterThan(0);
    });
  });

  describe('calculateCovarianceMatrix', () => {
    it('should calculate covariance matrix from correlation and volatilities', () => {
      const volatilities = [0.15, 0.20];
      const correlationMatrix = [
        [1, 0.5],
        [0.5, 1],
      ];

      const covMatrix =
        ModernPortfolioTheory.calculateCovarianceMatrix(
          volatilities,
          correlationMatrix,
        );

      expect(covMatrix[0][0]).toBeCloseTo(0.0225); // 0.15^2
      expect(covMatrix[1][1]).toBeCloseTo(0.04); // 0.20^2
      expect(covMatrix[0][1]).toBeCloseTo(0.015); // 0.15*0.20*0.5
    });
  });

  describe('pearsonCorrelation', () => {
    it('should calculate Pearson correlation correctly', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];

      const correlation =
        ModernPortfolioTheory.pearsonCorrelation(x, y);

      expect(correlation).toBeCloseTo(1, 5); // Perfect positive correlation
    });

    it('should handle negative correlation', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [10, 8, 6, 4, 2];

      const correlation =
        ModernPortfolioTheory.pearsonCorrelation(x, y);

      expect(correlation).toBeCloseTo(-1, 5); // Perfect negative correlation
    });
  });

  describe('meanVarianceOptimization', () => {
    it('should optimize portfolio using mean-variance', () => {
      const expectedReturns = [0.08, 0.10, 0.12];
      const correlationMatrix = [
        [1, 0.5, 0.3],
        [0.5, 1, 0.4],
        [0.3, 0.4, 1],
      ];
      const volatilities = [0.15, 0.18, 0.20];

      const covarianceMatrix =
        ModernPortfolioTheory.calculateCovarianceMatrix(
          volatilities,
          correlationMatrix,
        );

      const weights =
        ModernPortfolioTheory.meanVarianceOptimization(
          expectedReturns,
          covarianceMatrix,
        );

      const sum = weights.reduce((a, b) => a + b);
      expect(sum).toBeCloseTo(1, 5);
      expect(weights.length).toBe(3);
    });
  });

  describe('minVarianceOptimization', () => {
    it('should find minimum variance portfolio', () => {
      const correlationMatrix = [
        [1, 0.5],
        [0.5, 1],
      ];
      const volatilities = [0.15, 0.20];

      const covarianceMatrix =
        ModernPortfolioTheory.calculateCovarianceMatrix(
          volatilities,
          correlationMatrix,
        );

      const weights =
        ModernPortfolioTheory.minVarianceOptimization(
          covarianceMatrix,
        );

      const sum = weights.reduce((a, b) => a + b);
      expect(sum).toBeCloseTo(1, 5);
      expect(weights.length).toBe(2);
    });
  });

  describe('riskParityOptimization', () => {
    it('should create risk parity portfolio', () => {
      const correlationMatrix = [
        [1, 0.3],
        [0.3, 1],
      ];
      const volatilities = [0.10, 0.20];

      const covarianceMatrix =
        ModernPortfolioTheory.calculateCovarianceMatrix(
          volatilities,
          correlationMatrix,
        );

      const weights =
        ModernPortfolioTheory.riskParityOptimization(
          covarianceMatrix,
        );

      const sum = weights.reduce((a, b) => a + b);
      expect(sum).toBeCloseTo(1, 5);
      expect(weights.length).toBe(2);
      // Risk parity should weight lower volatility assets more
      expect(weights[0]).toBeGreaterThan(weights[1]);
    });
  });

  describe('calculateValueAtRisk', () => {
    it('should calculate VaR correctly', () => {
      const var95 =
        ModernPortfolioTheory.calculateValueAtRisk(
          0.05,
          0.15,
          0.95,
          100000,
        );

      expect(var95).toBeGreaterThan(0);
      expect(var95).toBeLessThan(100000);
    });
  });

  describe('efficientFrontier', () => {
    it('should generate efficient frontier', () => {
      const expectedReturns = [0.08, 0.10, 0.12];
      const correlationMatrix = [
        [1, 0.5, 0.3],
        [0.5, 1, 0.4],
        [0.3, 0.4, 1],
      ];
      const volatilities = [0.15, 0.18, 0.20];

      const covarianceMatrix =
        ModernPortfolioTheory.calculateCovarianceMatrix(
          volatilities,
          correlationMatrix,
        );

      const frontier =
        ModernPortfolioTheory.efficientFrontier(
          expectedReturns,
          covarianceMatrix,
          10,
        );

      expect(frontier.length).toBe(10);
      expect(frontier[0].volatility).toBeLessThanOrEqual(
        frontier[frontier.length - 1].volatility,
      );
    });
  });

  describe('applyConstraints', () => {
    it('should apply weight constraints', () => {
      const weights = [0.3, 0.5, 0.2];
      const constraints = {
        minWeight: 0.1,
        maxWeight: 0.6,
      };

      const constrained =
        ModernPortfolioTheory.applyConstraints(
          weights,
          constraints,
        );

      for (const w of constrained) {
        expect(w).toBeGreaterThanOrEqual(0.1);
        expect(w).toBeLessThanOrEqual(0.6);
      }

      const sum = constrained.reduce((a, b) => a + b);
      expect(sum).toBeCloseTo(1, 5);
    });
  });
});
