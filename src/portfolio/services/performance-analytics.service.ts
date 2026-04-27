import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PerformanceMetric } from "../entities/performance-metric.entity";
import { Portfolio } from "../entities/portfolio.entity";
import { PortfolioAsset } from "../entities/portfolio-asset.entity";

@Injectable()
export class PerformanceAnalyticsService {
  private readonly logger = new Logger(PerformanceAnalyticsService.name);

  constructor(
    @InjectRepository(PerformanceMetric)
    private metricRepository: Repository<PerformanceMetric>,
    @InjectRepository(Portfolio)
    private portfolioRepository: Repository<Portfolio>,
  ) {}

  /**
   * Record performance metrics for a portfolio
   */
  async recordMetrics(
    portfolioId: string,
    portfolioValue: number,
    allocation: Record<string, number>,
    previousValue?: number,
  ): Promise<PerformanceMetric> {
    const dailyReturn =
      previousValue && previousValue > 0
        ? (portfolioValue - previousValue) / previousValue
        : 0;

    const metric = this.metricRepository.create({
      portfolioId,
      dateTime: new Date(),
      portfolioValue,
      previousValue,
      dailyReturn,
      allocation,
    });

    return this.metricRepository.save(metric);
  }

  /**
   * Calculate cumulative return
   */
  async calculateCumulativeReturn(
    portfolioId: string,
    startDate?: Date,
  ): Promise<number> {
    let query = this.metricRepository.createQueryBuilder();

    query = query
      .where("metric.portfolioId = :portfolioId", {
        portfolioId,
      })
      .orderBy("metric.dateTime", "ASC");

    if (startDate) {
      query = query.andWhere("metric.dateTime >= :startDate", { startDate });
    }

    const metrics = await query.getMany();

    if (metrics.length < 2) return 0;

    const firstValue = metrics[0].portfolioValue;
    const lastValue = metrics[metrics.length - 1].portfolioValue;

    return (lastValue - firstValue) / firstValue;
  }

  /**
   * Calculate volatility (standard deviation of returns)
   */
  async calculateVolatility(
    portfolioId: string,
    days: number = 252,
  ): Promise<number> {
    const metrics = await this.metricRepository.find({
      where: { portfolioId },
      order: { dateTime: "DESC" },
      take: days + 1,
    });

    if (metrics.length < 2) return 0;

    const returns: number[] = [];
    for (let i = 0; i < metrics.length - 1; i++) {
      const ret =
        (metrics[i].portfolioValue - metrics[i + 1].portfolioValue) /
        metrics[i + 1].portfolioValue;
      returns.push(ret);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((sum, ret) => sum + (ret - mean) ** 2, 0) / returns.length;
    const volatility = Math.sqrt(variance);

    // Annualize
    return volatility * Math.sqrt(252);
  }

  /**
   * Calculate Sharpe ratio
   */
  async calculateSharpeRatio(
    portfolioId: string,
    riskFreeRate: number = 0.02,
  ): Promise<number> {
    const cumulativeReturn = await this.calculateCumulativeReturn(portfolioId);
    const volatility = await this.calculateVolatility(portfolioId);

    if (volatility === 0) return 0;

    return (cumulativeReturn - riskFreeRate) / volatility || 0;
  }

  /**
   * Calculate Sortino ratio (downside deviation)
   */
  async calculateSortinoRatio(
    portfolioId: string,
    targetReturn: number = 0,
    riskFreeRate: number = 0.02,
  ): Promise<number> {
    const metrics = await this.metricRepository.find({
      where: { portfolioId },
      order: { dateTime: "ASC" },
      take: 252,
    });

    const downreturns: number[] = [];

    for (let i = 0; i < metrics.length - 1; i++) {
      const ret =
        (metrics[i + 1].portfolioValue - metrics[i].portfolioValue) /
        metrics[i].portfolioValue;

      if (ret < targetReturn) {
        downreturns.push(ret - targetReturn);
      }
    }

    if (downreturns.length === 0) return 0;

    const downsideDeviation = Math.sqrt(
      downreturns.reduce((sum, ret) => sum + ret ** 2, 0) / downreturns.length,
    );

    const cumulativeReturn = await this.calculateCumulativeReturn(portfolioId);

    if (downsideDeviation === 0) return 0;

    return (cumulativeReturn - riskFreeRate) / downsideDeviation;
  }

  /**
   * Calculate maximum drawdown
   */
  async calculateMaxDrawdown(portfolioId: string): Promise<number> {
    const metrics = await this.metricRepository.find({
      where: { portfolioId },
      order: { dateTime: "ASC" },
    });

    if (metrics.length === 0) return 0;

    let maxValue = metrics[0].portfolioValue;
    let maxDrawdown = 0;

    for (const metric of metrics) {
      if (metric.portfolioValue > maxValue) {
        maxValue = metric.portfolioValue;
      }

      const drawdown = (maxValue - metric.portfolioValue) / maxValue;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * Calculate Value at Risk (parametric)
   */
  async calculateVaR(
    portfolioId: string,
    confidence: number = 0.95,
  ): Promise<number> {
    const metrics = await this.metricRepository.find({
      where: { portfolioId },
      order: { dateTime: "DESC" },
      take: 252,
    });

    const returns: number[] = [];
    for (let i = 0; i < metrics.length - 1; i++) {
      const ret =
        (metrics[i].portfolioValue - metrics[i + 1].portfolioValue) /
        metrics[i + 1].portfolioValue;
      returns.push(ret);
    }

    returns.sort((a, b) => a - b);
    const index = Math.floor(returns.length * (1 - confidence));

    return returns[index] || 0;
  }

  /**
   * Calculate Calmar ratio
   */
  async calculateCalmarRatio(portfolioId: string): Promise<number> {
    const cumulativeReturn = await this.calculateCumulativeReturn(portfolioId);
    const maxDrawdown = await this.calculateMaxDrawdown(portfolioId);

    if (maxDrawdown === 0) return 0;

    return cumulativeReturn / Math.abs(maxDrawdown);
  }

  /**
   * Get performance summary
   */
  async getPerformanceSummary(
    portfolioId: string,
    startDate?: Date,
  ): Promise<any> {
    const [
      cumulativeReturn,
      volatility,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      calmarRatio,
    ] = await Promise.all([
      this.calculateCumulativeReturn(portfolioId, startDate),
      this.calculateVolatility(portfolioId),
      this.calculateSharpeRatio(portfolioId),
      this.calculateSortinoRatio(portfolioId),
      this.calculateMaxDrawdown(portfolioId),
      this.calculateCalmarRatio(portfolioId),
    ]);

    return {
      cumulativeReturn,
      volatility,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      calmarRatio,
    };
  }

  /**
   * Get metrics for date range
   */
  async getMetricsForDateRange(
    portfolioId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PerformanceMetric[]> {
    return this.metricRepository.find({
      where: {
        portfolioId,
      },
      order: { dateTime: "ASC" },
    });
  }

  /**
   * Calculate attribution analysis
   */
  async getAttributionAnalysis(
    portfolioId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Record<string, number>> {
    const metrics = await this.metricRepository.find({
      where: { portfolioId },
      order: { dateTime: "ASC" },
    });

    const attribution: Record<string, number> = {};

    for (const metric of metrics) {
      if (metric.assetContribution) {
        for (const [asset, contribution] of Object.entries(
          metric.assetContribution,
        )) {
          attribution[asset] =
            (attribution[asset] || 0) + (contribution as number);
        }
      }
    }

    return attribution;
  }
}
