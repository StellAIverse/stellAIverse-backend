import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Portfolio } from "../entities/portfolio.entity";
import { PortfolioAsset } from "../entities/portfolio-asset.entity";
import {
  OptimizationHistory,
  OptimizationMethod,
  OptimizationStatus,
} from "../entities/optimization-history.entity";
import { RiskProfile } from "../entities/risk-profile.entity";
import { CreatePortfolioDto, UpdatePortfolioDto } from "../dto/portfolio.dto";
import { CreateOptimizationDto } from "../dto/optimization.dto";
import { PortfolioStatus } from "../entities/portfolio.entity";
import { ModernPortfolioTheory } from "../algorithms/modern-portfolio-theory";
import { BlackLittermanModel } from "../algorithms/black-litterman";
import { ConstraintOptimizer } from "../algorithms/constraint-optimizer";

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    @InjectRepository(Portfolio)
    private portfolioRepository: Repository<Portfolio>,
    @InjectRepository(PortfolioAsset)
    private portfolioAssetRepository: Repository<PortfolioAsset>,
    @InjectRepository(OptimizationHistory)
    private optimizationRepository: Repository<OptimizationHistory>,
    @InjectRepository(RiskProfile)
    private riskProfileRepository: Repository<RiskProfile>,
  ) {}

  /**
   * Create a new portfolio for a user
   */
  async createPortfolio(
    userId: string,
    dto: CreatePortfolioDto,
  ): Promise<Portfolio> {
    const portfolio = this.portfolioRepository.create({
      ...dto,
      userId,
      status: PortfolioStatus.ACTIVE,
      currentAllocation: {},
      targetAllocation: {},
    });

    return this.portfolioRepository.save(portfolio);
  }

  /**
   * Get portfolio by ID
   */
  async getPortfolio(portfolioId: string): Promise<Portfolio> {
    const portfolio = await this.portfolioRepository.findOne({
      where: { id: portfolioId },
      relations: ["assets", "optimizationHistory", "performanceMetrics"],
    });

    if (!portfolio) {
      throw new BadRequestException("Portfolio not found");
    }

    return portfolio;
  }

  /**
   * Get all portfolios for user
   */
  async getUserPortfolios(userId: string): Promise<Portfolio[]> {
    return this.portfolioRepository.find({
      where: { userId },
      relations: ["assets", "performanceMetrics"],
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Update portfolio
   */
  async updatePortfolio(
    portfolioId: string,
    dto: UpdatePortfolioDto,
  ): Promise<Portfolio> {
    const portfolio = await this.getPortfolio(portfolioId);

    Object.assign(portfolio, dto);

    return this.portfolioRepository.save(portfolio);
  }

  /**
   * Add asset to portfolio
   */
  async addAsset(
    portfolioId: string,
    ticker: string,
    name: string,
    quantity: number,
    currentPrice: number = 0,
    costBasis: number = 0,
  ): Promise<PortfolioAsset> {
    const portfolio = await this.getPortfolio(portfolioId);

    // Check if asset already exists
    let asset = await this.portfolioAssetRepository.findOne({
      where: { portfolioId, ticker },
    });

    if (!asset) {
      asset = this.portfolioAssetRepository.create({
        portfolioId,
        ticker,
        name,
        quantity: 0,
        value: 0,
        allocationPercentage: 0,
        costBasis,
        costBasisPerShare: currentPrice,
      });
    }

    // Update asset
    asset.quantity = quantity;
    asset.currentPrice = currentPrice;
    asset.value = quantity * currentPrice;

    asset = await this.portfolioAssetRepository.save(asset);

    // Update portfolio allocation
    await this.updatePortfolioAllocation(portfolioId);

    return asset;
  }

  /**
   * Update asset price and calculate allocation
   */
  async updateAssetPrice(
    assetId: string,
    currentPrice: number,
  ): Promise<PortfolioAsset> {
    const asset = await this.portfolioAssetRepository.findOne({
      where: { id: assetId },
    });

    if (!asset) {
      throw new BadRequestException("Asset not found");
    }

    asset.currentPrice = currentPrice;
    asset.value = asset.quantity * currentPrice;
    asset.lastPriceUpdate = new Date();

    const updated = await this.portfolioAssetRepository.save(asset);

    // Recalculate allocation
    await this.updatePortfolioAllocation(asset.portfolioId);

    return updated;
  }

  /**
   * Update portfolio allocation percentages
   */
  async updatePortfolioAllocation(portfolioId: string): Promise<void> {
    const portfolio = await this.getPortfolio(portfolioId);
    const assets = await this.portfolioAssetRepository.find({
      where: { portfolioId },
    });

    let totalValue = 0;
    for (const asset of assets) {
      totalValue += asset.value || 0;
    }

    portfolio.totalValue = totalValue;

    const allocation: Record<string, number> = {};

    for (const asset of assets) {
      const percentage = totalValue > 0 ? (asset.value / totalValue) * 100 : 0;
      asset.allocationPercentage = percentage;
      allocation[asset.ticker] = percentage;
    }

    portfolio.currentAllocation = allocation;

    await this.portfolioRepository.save(portfolio);
    await this.portfolioAssetRepository.save(assets);
  }

  /**
   * Run portfolio optimization
   */
  async runOptimization(
    portfolioId: string,
    dto: CreateOptimizationDto,
  ): Promise<OptimizationHistory> {
    const portfolio = await this.getPortfolio(portfolioId);
    const assets = await this.portfolioAssetRepository.find({
      where: { portfolioId },
    });

    if (assets.length === 0) {
      throw new BadRequestException("Portfolio has no assets to optimize");
    }

    // Create optimization history record
    const optimization = this.optimizationRepository.create({
      portfolioId,
      method: dto.method,
      status: OptimizationStatus.IN_PROGRESS,
      parameters: dto.parameters || {},
      suggestedAllocation: {},
      currentAllocation: portfolio.currentAllocation,
    });

    let result = await this.optimizationRepository.save(optimization);

    try {
      // Prepare data
      const expectedReturns = assets.map((a) => a.expectedReturn || 0.07);
      const volatilities = assets.map((a) => a.volatility || 0.15);

      // Simple correlation matrix (could be enhanced with historical data)
      const correlationMatrix = this.generateCorrelationMatrix(assets.length);

      const covarianceMatrix = ModernPortfolioTheory.calculateCovarianceMatrix(
        volatilities,
        correlationMatrix,
      );

      let suggestedWeights: number[] = [];

      // Run optimization based on method
      switch (dto.method) {
        case OptimizationMethod.MEAN_VARIANCE:
          suggestedWeights = ModernPortfolioTheory.meanVarianceOptimization(
            expectedReturns,
            covarianceMatrix,
          );
          break;

        case OptimizationMethod.MIN_VARIANCE:
          suggestedWeights =
            ModernPortfolioTheory.minVarianceOptimization(covarianceMatrix);
          break;

        case OptimizationMethod.RISK_PARITY:
          suggestedWeights =
            ModernPortfolioTheory.riskParityOptimization(covarianceMatrix);
          break;

        case OptimizationMethod.MAX_SHARPE:
          suggestedWeights = ModernPortfolioTheory.meanVarianceOptimization(
            expectedReturns,
            covarianceMatrix,
            {},
            0.02,
          );
          break;

        default:
          suggestedWeights = new Array(assets.length).fill(1 / assets.length);
      }

      // Build allocation
      const suggestedAllocation: Record<string, number> = {};
      for (let i = 0; i < assets.length; i++) {
        suggestedAllocation[assets[i].ticker] = suggestedWeights[i] * 100;
        assets[i].suggestedAllocation = suggestedWeights[i] * 100;
      }

      // Calculate metrics
      const metrics = ModernPortfolioTheory.calculatePortfolioMetrics(
        suggestedWeights,
        expectedReturns,
        covarianceMatrix,
      );

      // Calculate improvement score
      const currentReturn = 0;
      const currentVolatility = 0;

      const currentWeights = assets.map(
        (a) => (a.allocationPercentage || 0) / 100,
      );

      const currentMetrics = ModernPortfolioTheory.calculatePortfolioMetrics(
        currentWeights,
        expectedReturns,
        covarianceMatrix,
      );

      const improvementScore =
        currentMetrics.volatility > 0
          ? ((currentMetrics.volatility - metrics.volatility) /
              currentMetrics.volatility) *
            100
          : 0;

      // Update optimization result
      result.status = OptimizationStatus.COMPLETED;
      result.suggestedAllocation = suggestedAllocation;
      result.expectedReturn = metrics.expectedReturn;
      result.expectedVolatility = metrics.volatility;
      result.expectedSharpeRatio = metrics.sharpeRatio;
      result.improvementScore = improvementScore;
      result.completedAt = new Date();

      result = await this.optimizationRepository.save(result);

      // Save suggested allocation to assets
      await this.portfolioAssetRepository.save(assets);

      this.logger.log(`Optimization completed for portfolio ${portfolioId}`);

      return result;
    } catch (error) {
      this.logger.error(`Optimization failed: ${error.message}`);
      result.status = OptimizationStatus.FAILED;
      result.errorMessage = error.message;
      await this.optimizationRepository.save(result);
      throw error;
    }
  }

  /**
   * Generate simple correlation matrix
   */
  private generateCorrelationMatrix(size: number): number[][] {
    const matrix: number[][] = [];

    for (let i = 0; i < size; i++) {
      matrix[i] = [];
      for (let j = 0; j < size; j++) {
        if (i === j) {
          matrix[i][j] = 1;
        } else {
          // Simplified correlation
          matrix[i][j] = 0.5 + Math.random() * 0.2;
        }
      }
    }

    return matrix;
  }

  /**
   * Approve optimization
   */
  async approveOptimization(
    optimizationId: string,
    notes?: string,
  ): Promise<OptimizationHistory> {
    const optimization = await this.optimizationRepository.findOne({
      where: { id: optimizationId },
    });

    if (!optimization) {
      throw new BadRequestException("Optimization not found");
    }

    optimization.status = OptimizationStatus.APPROVED;
    if (notes) optimization.notes = notes;

    return this.optimizationRepository.save(optimization);
  }

  /**
   * Implement optimization (apply to portfolio)
   */
  async implementOptimization(optimizationId: string): Promise<Portfolio> {
    const optimization = await this.optimizationRepository.findOne({
      where: { id: optimizationId },
    });

    if (!optimization) {
      throw new BadRequestException("Optimization not found");
    }

    const portfolio = await this.getPortfolio(optimization.portfolioId);

    // Apply suggested allocation
    portfolio.targetAllocation = optimization.suggestedAllocation;
    portfolio.lastRebalanceDate = new Date();

    optimization.status = OptimizationStatus.IMPLEMENTED;
    optimization.implementedAt = new Date();

    await this.optimizationRepository.save(optimization);

    return this.portfolioRepository.save(portfolio);
  }

  /**
   * Get optimization history
   */
  async getOptimizationHistory(
    portfolioId: string,
    limit: number = 10,
  ): Promise<OptimizationHistory[]> {
    return this.optimizationRepository.find({
      where: { portfolioId },
      order: { createdAt: "DESC" },
      take: limit,
    });
  }

  /**
   * Delete portfolio
   */
  async deletePortfolio(portfolioId: string): Promise<void> {
    await this.portfolioRepository.delete(portfolioId);
  }
}
