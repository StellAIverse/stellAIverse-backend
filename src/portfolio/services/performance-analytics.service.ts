import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, Repository } from "typeorm";
import { PerformanceMetric } from "../entities/performance-metric.entity";
import { Portfolio } from "../entities/portfolio.entity";
import { PortfolioAsset } from "../entities/portfolio-asset.entity";
import { PerformancePeriod } from "../dto/performance.dto";

/**
 * Number of trading days in a year (used for annualising volatility).
 * 252 is the trading-day convention for US equity markets.
 */
const TRADING_DAYS_PER_YEAR = 252;

/** Number of calendar days in a year, used for lookback windows. */
const CALENDAR_DAYS_PER_YEAR = 365;

@Injectable()
export class PerformanceAnalyticsService {
  private readonly logger = new Logger(PerformanceAnalyticsService.name);

  constructor(
    @InjectRepository(PerformanceMetric)
    private metricRepository: Repository<PerformanceMetric>,
    @InjectRepository(Portfolio)
    private portfolioRepository: Repository<Portfolio>,
    @InjectRepository(PortfolioAsset)
    private assetRepository: Repository<PortfolioAsset>,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Resolve a PerformancePeriod enum value to a start Date. */
  resolvePeriodStartDate(period: PerformancePeriod): Date {
    const now = new Date();
    switch (period) {
      case PerformancePeriod.DAY:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case PerformancePeriod.WEEK:
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case PerformancePeriod.MONTH:
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case PerformancePeriod.THREE_MONTHS:
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      case PerformancePeriod.SIX_MONTHS:
        return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      case PerformancePeriod.YEAR_TO_DATE: {
        const ytd = new Date(now.getFullYear(), 0, 1);
        return ytd;
      }
      case PerformancePeriod.ONE_YEAR:
        return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      case PerformancePeriod.THREE_YEARS:
        return new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000);
      case PerformancePeriod.ALL:
      default:
        return new Date(0);
    }
  }

  // ─── Recording ──────────────────────────────────────────────────────────────

  /**
   * Record performance metrics for a portfolio.
   *
   * Also computes and persists period-specific returns (YTD/1Y/3Y/5Y) and
   * the live drawdown against the all-time peak so callers can render
   * dashboards without re-querying the entire history. Both derived
   * quantities default to 0 when the recorded history is too short or
   * unavailable.
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

    const [periodReturns, currentDrawdown] = await Promise.all([
      this.calculatePeriodReturns(portfolioId),
      this.calculateCurrentDrawdown(portfolioId),
    ]);

    const metric = this.metricRepository.create({
      portfolioId,
      dateTime: new Date(),
      portfolioValue,
      previousValue,
      dailyReturn,
      allocation,
      yearToDateReturn: periodReturns.yearToDateReturn,
      oneYearReturn: periodReturns.oneYearReturn,
      threeYearReturn: periodReturns.threeYearReturn,
      fiveYearReturn: periodReturns.fiveYearReturn,
      currentDrawdown,
    });

    return this.metricRepository.save(metric);
  }

  // ─── Calculations ────────────────────────────────────────────────────────────

  /**
   * Calculate cumulative return over an optional date range.
   */
  async calculateCumulativeReturn(
    portfolioId: string,
    startDate?: Date,
  ): Promise<number> {
    const where: any = { portfolioId };
    if (startDate) {
      where.dateTime = Between(startDate, new Date());
    }

    const metrics = await this.metricRepository.find({
      where,
      order: { dateTime: "ASC" },
    });

    if (metrics.length < 2) return 0;

    const firstValue = metrics[0].portfolioValue;
    const lastValue = metrics[metrics.length - 1].portfolioValue;

    return firstValue > 0 ? (lastValue - firstValue) / firstValue : 0;
  }

  /**
   * Calculate annualised volatility (std-dev of daily returns).
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
      const curr = metrics[i].portfolioValue;
      const prev = metrics[i + 1].portfolioValue;
      if (prev > 0) returns.push((curr - prev) / prev);
    }

    if (returns.length === 0) return 0;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;

    return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
  }

  /**
   * Calculate Sharpe ratio.
   */
  async calculateSharpeRatio(
    portfolioId: string,
    riskFreeRate: number = 0.02,
  ): Promise<number> {
    const [cumulativeReturn, volatility] = await Promise.all([
      this.calculateCumulativeReturn(portfolioId),
      this.calculateVolatility(portfolioId),
    ]);

    if (volatility === 0) return 0;
    return (cumulativeReturn - riskFreeRate) / volatility;
  }

  /**
   * Calculate Sortino ratio (uses downside deviation only).
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

    const downReturns: number[] = [];
    for (let i = 0; i < metrics.length - 1; i++) {
      const ret =
        (metrics[i + 1].portfolioValue - metrics[i].portfolioValue) /
        metrics[i].portfolioValue;
      if (ret < targetReturn) downReturns.push(ret - targetReturn);
    }

    if (downReturns.length === 0) return 0;

    const downsideDeviation = Math.sqrt(
      downReturns.reduce((sum, r) => sum + r ** 2, 0) / downReturns.length,
    );

    if (downsideDeviation === 0) return 0;

    const cumulativeReturn = await this.calculateCumulativeReturn(portfolioId);
    return (cumulativeReturn - riskFreeRate) / downsideDeviation;
  }

  /**
   * Calculate the live drawdown of the most recent portfolio value
   * relative to the all-time peak in the recorded history.
   *
   * Unlike {@link calculateMaxDrawdown}, this returns the drawdown *right
   * now* – useful for surfacing red/green on a dashboard. Returns 0 when
   * the portfolio is at or above its historical peak.
   */
  async calculateCurrentDrawdown(portfolioId: string): Promise<number> {
    const metrics = await this.metricRepository.find({
      where: { portfolioId },
      order: { dateTime: "ASC" },
    });

    if (metrics.length === 0) return 0;

    let peak = metrics[0].portfolioValue;
    for (const metric of metrics) {
      if (metric.portfolioValue > peak) peak = metric.portfolioValue;
    }

    const lastValue = metrics[metrics.length - 1].portfolioValue;
    if (peak <= 0 || lastValue >= peak) return 0;

    return (peak - lastValue) / peak;
  }

  /**
   * Calculate Return on Investment (ROI) for a portfolio relative to its
   * invested capital.
   *
   * ROI = (current value − cost basis) / cost basis. This differs from
   * `cumulativeReturn` because `cumulativeReturn` is a time-series price
   * return, whereas ROI is a profit on the actual capital the user put in.
   *
   * Current portfolio value is derived from `asset.quantity * asset.currentPrice`
   * rather than the persisted `asset.value` column, which is only refreshed
   * when `PortfolioService.updatePortfolioAllocation` runs. Computing it
   * inline avoids a stale-value bug for assets whose `value` field has not
   * yet been rebalanced after the latest price change.
   *
   * If no assets are recorded, or their cost basis sums to zero, returns 0
   * to avoid a divide-by-zero result.
   */
  async calculateROI(portfolioId: string): Promise<number> {
    const assets = await this.assetRepository.find({ where: { portfolioId } });

    if (assets.length === 0) return 0;

    let totalValue = 0;
    let totalCostBasis = 0;

    for (const asset of assets) {
      const quantity = asset.quantity ?? 0;
      const currentPrice = asset.currentPrice ?? 0;
      totalValue += quantity * currentPrice;
      totalCostBasis += asset.costBasis ?? 0;
    }

    if (totalCostBasis <= 0) return 0;
    return (totalValue - totalCostBasis) / totalCostBasis;
  }

  /**
   * Calculate the standard period-specific returns that most reporting
   * dashboards expect: YTD, 1 year, 3 years and 5 years.
   *
   * Each return is computed from the corresponding lookback date to the
   * most recent snapshot and falls back to 0 when the history is too
   * short to compute the period.
   */
  async calculatePeriodReturns(portfolioId: string): Promise<{
    yearToDateReturn: number;
    oneYearReturn: number;
    threeYearReturn: number;
    fiveYearReturn: number;
  }> {
    const now = new Date();
    const ytdStart = new Date(now.getFullYear(), 0, 1);
    const oneYearAgo = new Date(
      now.getTime() - CALENDAR_DAYS_PER_YEAR * 24 * 60 * 60 * 1000,
    );
    const threeYearAgo = new Date(
      now.getTime() - 3 * CALENDAR_DAYS_PER_YEAR * 24 * 60 * 60 * 1000,
    );
    const fiveYearAgo = new Date(
      now.getTime() - 5 * CALENDAR_DAYS_PER_YEAR * 24 * 60 * 60 * 1000,
    );

    const [yearToDateReturn, oneYearReturn, threeYearReturn, fiveYearReturn] =
      await Promise.all([
        this.calculateCumulativeReturn(portfolioId, ytdStart),
        this.calculateCumulativeReturn(portfolioId, oneYearAgo),
        this.calculateCumulativeReturn(portfolioId, threeYearAgo),
        this.calculateCumulativeReturn(portfolioId, fiveYearAgo),
      ]);

    return {
      yearToDateReturn,
      oneYearReturn,
      threeYearReturn,
      fiveYearReturn,
    };
  }

  /**
   * Return the latest allocation breakdown for a portfolio (ticker → %).
   *
   * Source of truth is `Portfolio.currentAllocation`, which is kept in
   * sync with the running holdings by `PortfolioService.updatePortfolioAllocation`.
   * Returns an empty object if no portfolio is found or the allocation map
   * has not yet been populated.
   */
  async getAllocationBreakdown(
    portfolioId: string,
  ): Promise<Record<string, number>> {
    const portfolio = await this.portfolioRepository.findOne({
      where: { id: portfolioId },
    });

    if (!portfolio) return {};

    const allocation = portfolio.currentAllocation ?? {};
    return allocation && typeof allocation === "object" ? allocation : {};
  }

  /**
   * Calculate maximum drawdown over the full history.
   */
  async calculateMaxDrawdown(portfolioId: string): Promise<number> {
    const metrics = await this.metricRepository.find({
      where: { portfolioId },
      order: { dateTime: "ASC" },
    });

    if (metrics.length === 0) return 0;

    let peak = metrics[0].portfolioValue;
    let maxDrawdown = 0;

    for (const metric of metrics) {
      if (metric.portfolioValue > peak) peak = metric.portfolioValue;
      const drawdown = peak > 0 ? (peak - metric.portfolioValue) / peak : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return maxDrawdown;
  }

  /**
   * Calculate Value at Risk (parametric, historical simulation).
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
      const curr = metrics[i].portfolioValue;
      const prev = metrics[i + 1].portfolioValue;
      if (prev > 0) returns.push((curr - prev) / prev);
    }

    if (returns.length === 0) return 0;

    returns.sort((a, b) => a - b);
    const index = Math.floor(returns.length * (1 - confidence));
    return returns[index] ?? 0;
  }

  /**
   * Calculate Calmar ratio (annualised return / max drawdown).
   */
  async calculateCalmarRatio(portfolioId: string): Promise<number> {
    const [cumulativeReturn, maxDrawdown] = await Promise.all([
      this.calculateCumulativeReturn(portfolioId),
      this.calculateMaxDrawdown(portfolioId),
    ]);

    if (maxDrawdown === 0) return 0;
    return cumulativeReturn / Math.abs(maxDrawdown);
  }

  // ─── Queries ─────────────────────────────────────────────────────────────────

  /**
   * Get raw metric snapshots for a specific date range.
   * Properly filters by dateTime using a Between condition.
   */
  async getMetricsForDateRange(
    portfolioId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PerformanceMetric[]> {
    return this.metricRepository.find({
      where: {
        portfolioId,
        dateTime: Between(startDate, endDate),
      },
      order: { dateTime: "ASC" },
    });
  }

  /**
   * Get raw metric snapshots for a predefined period.
   */
  async getMetricsForPeriod(
    portfolioId: string,
    period: PerformancePeriod,
  ): Promise<PerformanceMetric[]> {
    const startDate = this.resolvePeriodStartDate(period);
    return this.getMetricsForDateRange(portfolioId, startDate, new Date());
  }

  /**
   * Compare portfolio performance against a benchmark.
   * Returns alpha, beta, correlation, tracking error and information ratio.
   */
  async getBenchmarkComparison(
    portfolioId: string,
    benchmarkTicker: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    portfolioReturn: number;
    benchmarkReturn: number;
    alpha: number;
    beta: number;
    correlation: number;
    trackingError: number;
    informationRatio: number;
    benchmarkTicker: string;
  }> {
    const start = startDate ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const end = endDate ?? new Date();

    const metrics = await this.getMetricsForDateRange(portfolioId, start, end);

    // Extract portfolio daily returns
    const portfolioReturns: number[] = [];
    for (let i = 1; i < metrics.length; i++) {
      const prev = metrics[i - 1].portfolioValue;
      const curr = metrics[i].portfolioValue;
      if (prev > 0) portfolioReturns.push((curr - prev) / prev);
    }

    const portfolioReturn =
      metrics.length >= 2 && metrics[0].portfolioValue > 0
        ? (metrics[metrics.length - 1].portfolioValue -
            metrics[0].portfolioValue) /
          metrics[0].portfolioValue
        : 0;

    // Use stored benchmark returns from the metrics where available,
    // otherwise approximate as a flat zero benchmark for calculations.
    const benchmarkReturns: number[] = metrics
      .slice(1)
      .map((m) => (m.benchmarkReturn != null ? m.benchmarkReturn : 0));

    const benchmarkReturn = benchmarkReturns.reduce((a, b) => a + b, 0);

    // Beta = Cov(portfolio, benchmark) / Var(benchmark)
    const beta = this.computeBeta(portfolioReturns, benchmarkReturns);
    const alpha = portfolioReturn - beta * benchmarkReturn;
    const correlation = this.computeCorrelation(
      portfolioReturns,
      benchmarkReturns,
    );

    // Tracking error = std-dev of active returns, annualised
    const activeReturns = portfolioReturns.map(
      (r, i) => r - (benchmarkReturns[i] ?? 0),
    );
    const trackingError = this.stdDev(activeReturns) * Math.sqrt(252);

    const informationRatio =
      trackingError > 0
        ? ((portfolioReturn - benchmarkReturn) / trackingError) * Math.sqrt(252)
        : 0;

    return {
      portfolioReturn,
      benchmarkReturn,
      alpha,
      beta,
      correlation,
      trackingError,
      informationRatio,
      benchmarkTicker,
    };
  }

  /**
   * Get comprehensive performance summary for a portfolio.
   *
   * Includes the legacy risk-adjusted metrics (Sharpe, Sortino, Calmar,
   * max drawdown, VaR, volatility) as well as the explicit reporting
   * metrics called out in the Portfolio Performance API spec:
   * total/cumulative return, ROI relative to the invested cost basis,
   * the current allocation breakdown, the live drawdown vs. the all-time
   * peak, and period-specific returns (YTD/1Y/3Y/5Y).
   */
  async getPerformanceSummary(
    portfolioId: string,
    startDate?: Date,
  ): Promise<{
    cumulativeReturn: number;
    volatility: number;
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    calmarRatio: number;
    valueAtRisk95: number;
    roi: number;
    currentDrawdown: number;
    allocationBreakdown: Record<string, number>;
    periodReturns: {
      yearToDateReturn: number;
      oneYearReturn: number;
      threeYearReturn: number;
      fiveYearReturn: number;
    };
  }> {
    const [
      cumulativeReturn,
      volatility,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      calmarRatio,
      valueAtRisk95,
      roi,
      currentDrawdown,
      allocationBreakdown,
      periodReturns,
    ] = await Promise.all([
      this.calculateCumulativeReturn(portfolioId, startDate),
      this.calculateVolatility(portfolioId),
      this.calculateSharpeRatio(portfolioId),
      this.calculateSortinoRatio(portfolioId),
      this.calculateMaxDrawdown(portfolioId),
      this.calculateCalmarRatio(portfolioId),
      this.calculateVaR(portfolioId),
      this.calculateROI(portfolioId),
      this.calculateCurrentDrawdown(portfolioId),
      this.getAllocationBreakdown(portfolioId),
      this.calculatePeriodReturns(portfolioId),
    ]);

    return {
      cumulativeReturn,
      volatility,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      calmarRatio,
      valueAtRisk95,
      roi,
      currentDrawdown,
      allocationBreakdown,
      periodReturns,
    };
  }

  /**
   * Calculate attribution analysis (per-asset return contribution).
   */
  async getAttributionAnalysis(
    portfolioId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Record<string, number>> {
    const metrics = await this.getMetricsForDateRange(
      portfolioId,
      startDate,
      endDate,
    );

    const attribution: Record<string, number> = {};
    for (const metric of metrics) {
      if (metric.assetContribution) {
        for (const [asset, contribution] of Object.entries(
          metric.assetContribution,
        )) {
          attribution[asset] =
            (attribution[asset] ?? 0) + (contribution as number);
        }
      }
    }

    return attribution;
  }

  // ─── Private statistics helpers ──────────────────────────────────────────────

  private stdDev(arr: number[]): number {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance =
      arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  }

  private computeBeta(portfolio: number[], benchmark: number[]): number {
    const n = Math.min(portfolio.length, benchmark.length);
    if (n < 2) return 1;

    const p = portfolio.slice(0, n);
    const b = benchmark.slice(0, n);
    const bMean = b.reduce((a, v) => a + v, 0) / n;
    const pMean = p.reduce((a, v) => a + v, 0) / n;

    const covariance =
      p.reduce((sum, v, i) => sum + (v - pMean) * (b[i] - bMean), 0) / n;
    const benchVariance = b.reduce((sum, v) => sum + (v - bMean) ** 2, 0) / n;

    return benchVariance === 0 ? 1 : covariance / benchVariance;
  }

  private computeCorrelation(a: number[], b: number[]): number {
    const n = Math.min(a.length, b.length);
    if (n < 2) return 0;

    const aSlice = a.slice(0, n);
    const bSlice = b.slice(0, n);
    const aMean = aSlice.reduce((s, v) => s + v, 0) / n;
    const bMean = bSlice.reduce((s, v) => s + v, 0) / n;

    const covariance =
      aSlice.reduce((sum, v, i) => sum + (v - aMean) * (bSlice[i] - bMean), 0) /
      n;
    const aStd = this.stdDev(aSlice);
    const bStd = this.stdDev(bSlice);

    return aStd * bStd === 0 ? 0 : covariance / (aStd * bStd);
  }
}
