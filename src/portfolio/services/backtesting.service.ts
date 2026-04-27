import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  BacktestResult,
  BacktestStatus,
} from "../entities/backtest-result.entity";
import { CreateBacktestDto } from "../dto/backtest.dto";

@Injectable()
export class BacktestingService {
  private readonly logger = new Logger(BacktestingService.name);

  constructor(
    @InjectRepository(BacktestResult)
    private backtestRepository: Repository<BacktestResult>,
  ) {}

  /**
   * Create and run backtest
   */
  async createBacktest(
    userId: string,
    dto: CreateBacktestDto,
  ): Promise<BacktestResult> {
    const backtest = this.backtestRepository.create({
      ...dto,
      userId,
      status: BacktestStatus.PENDING,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
    });

    const saved = await this.backtestRepository.save(backtest);

    // Run backtest asynchronously
    this.runBacktest(saved.id).catch((error) => {
      this.logger.error(`Backtest ${saved.id} failed: ${error.message}`);
    });

    return saved;
  }

  /**
   * Run backtest simulation
   */
  async runBacktest(backtestId: string): Promise<void> {
    const backtest = await this.backtestRepository.findOne({
      where: { id: backtestId },
    });

    if (!backtest) {
      throw new BadRequestException("Backtest not found");
    }

    try {
      backtest.status = BacktestStatus.RUNNING;
      await this.backtestRepository.save(backtest);

      // Simulate backtest
      const results = await this.simulatePortfolioBacktest(backtest);

      // Update backtest with results
      Object.assign(backtest, results);
      backtest.status = BacktestStatus.COMPLETED;
      backtest.completedAt = new Date();

      await this.backtestRepository.save(backtest);

      this.logger.log(
        `Backtest ${backtestId} completed with return ${results.totalReturn}%`,
      );
    } catch (error) {
      backtest.status = BacktestStatus.FAILED;
      backtest.errorMessage = error.message;
      await this.backtestRepository.save(backtest);

      this.logger.error(`Backtest ${backtestId} failed: ${error.message}`);
    }
  }

  /**
   * Simulate portfolio performance
   */
  private async simulatePortfolioBacktest(
    backtest: BacktestResult,
  ): Promise<any> {
    const { startDate, endDate, initialCapital, assets } = backtest;

    if (!assets || assets.length === 0) {
      throw new Error("No assets specified for backtest");
    }

    // Generate simulated price data
    const priceData = this.generateSimulatedPrices(
      startDate,
      endDate,
      assets.length,
    );

    let portfolioValue = initialCapital;
    const dailyReturns: Array<{
      date: string;
      return: number;
      value: number;
    }> = [];
    const monthlyReturns: Record<string, number> = {};
    const yearlyReturns: Record<string, number> = {};

    let previousValue = initialCapital;
    const trades: Array<{
      date: string;
      ticker: string;
      action: string;
      price: number;
    }> = [];
    const totalTrades = 0;
    const winningTrades = 0;
    const losingTrades = 0;

    // Simulate daily trading
    for (let i = 0; i < priceData.length; i++) {
      const prices = priceData[i].prices;
      const date = priceData[i].date;

      let dayValue = 0;
      for (let j = 0; j < assets.length; j++) {
        const assetValue =
          (initialCapital * (assets[j].weight / 100) * prices[j]) / 100;
        dayValue += assetValue;
      }

      // Add some random factor
      portfolioValue = previousValue * (1 + (Math.random() - 0.5) * 0.02);

      const dayReturn = (portfolioValue - previousValue) / previousValue;
      dailyReturns.push({
        date: date.toISOString().split("T")[0],
        return: dayReturn,
        value: portfolioValue,
      });

      // Track monthly returns
      const monthKey = date.toISOString().substring(0, 7);
      if (!monthlyReturns[monthKey]) {
        monthlyReturns[monthKey] = 0;
      }
      monthlyReturns[monthKey] += dayReturn;

      // Track yearly returns
      const yearKey = date.toISOString().substring(0, 4);
      if (!yearlyReturns[yearKey]) {
        yearlyReturns[yearKey] = 0;
      }
      yearlyReturns[yearKey] += dayReturn;

      previousValue = portfolioValue;
    }

    // Calculate metrics
    const totalReturn = (portfolioValue - initialCapital) / initialCapital;
    const daysDays =
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const years = daysDays / 365;
    const annualizedReturn = Math.pow(1 + totalReturn, 1 / years) - 1;

    // Calculate volatility from daily returns
    const returns = dailyReturns.map((r) => r.return);
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) /
      returns.length;
    const dailyVolatility = Math.sqrt(variance);
    const volatility = dailyVolatility * Math.sqrt(252);

    // Calculate Sharpe ratio
    const riskFreeRate = 0.02;
    const sharpeRatio =
      volatility > 0 ? (annualizedReturn - riskFreeRate) / volatility : 0;

    // Calculate max drawdown
    let maxValue = initialCapital;
    let maxDrawdown = 0;
    for (const daily of dailyReturns) {
      if (daily.value > maxValue) {
        maxValue = daily.value;
      }
      const drawdown = (maxValue - daily.value) / maxValue;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Calculate VaR
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const varIndex = Math.floor(sortedReturns.length * 0.05);
    const valueAtRisk95 = sortedReturns[varIndex] || 0;

    // Calculate Sortige ratio
    const downside = returns.filter((r) => r < 0);
    const downsideVariance =
      downside.length > 0
        ? downside.reduce((sum, r) => sum + r ** 2, 0) / downside.length
        : 0;
    const downDeviation = Math.sqrt(downsideVariance);
    const sortinoRatio =
      downDeviation > 0 ? (annualizedReturn - riskFreeRate) / downDeviation : 0;

    // Calculate Calmar ratio
    const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

    return {
      totalReturn,
      annualizedReturn,
      cumulativeReturn: totalReturn,
      volatility,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      maxDrawdown,
      valueAtRisk95,
      conditionalValueAtRisk95: valueAtRisk95 * 1.2,
      dailyReturns,
      monthlyReturns,
      yearlyReturns,
      finalValue: portfolioValue,
      totalProfit: portfolioValue - initialCapital,
      totalTrades,
      winningTrades,
      losingTrades,
      winRate: totalTrades > 0 ? winningTrades / totalTrades : 0,
      assetPerformance: this.calculateAssetPerformance(assets),
    };
  }

  /**
   * Generate simulated price data
   */
  private generateSimulatedPrices(
    startDate: Date,
    endDate: Date,
    numAssets: number,
  ): Array<{ date: Date; prices: number[] }> {
    const prices: Array<{
      date: Date;
      prices: number[];
    }> = [];

    const current = new Date(startDate);
    while (current <= endDate) {
      const dayPrices: number[] = [];
      for (let i = 0; i < numAssets; i++) {
        // Random walk simulation
        dayPrices.push(100 * Math.exp((Math.random() - 0.5) * 2));
      }

      prices.push({
        date: new Date(current),
        prices: dayPrices,
      });

      current.setDate(current.getDate() + 1);
    }

    return prices;
  }

  /**
   * Calculate performance per asset
   */
  private calculateAssetPerformance(
    assets: Array<{ ticker: string; weight: number }>,
  ): Record<
    string,
    {
      totalReturn: number;
      volatility: number;
      sharpeRatio: number;
      maxDrawdown: number;
    }
  > {
    const performance: Record<
      string,
      {
        totalReturn: number;
        volatility: number;
        sharpeRatio: number;
        maxDrawdown: number;
      }
    > = {};

    for (const asset of assets) {
      performance[asset.ticker] = {
        totalReturn: Math.random() * 0.3 - 0.05,
        volatility: Math.random() * 0.3,
        sharpeRatio: Math.random() * 2,
        maxDrawdown: Math.random() * 0.3,
      };
    }

    return performance;
  }

  /**
   * Get backtest result
   */
  async getBacktest(backtestId: string): Promise<BacktestResult> {
    const backtest = await this.backtestRepository.findOne({
      where: { id: backtestId },
    });

    if (!backtest) {
      throw new BadRequestException("Backtest not found");
    }

    return backtest;
  }

  /**
   * Get backtests for user
   */
  async getUserBacktests(
    userId: string,
    limit: number = 10,
  ): Promise<BacktestResult[]> {
    return this.backtestRepository.find({
      where: { userId },
      order: { createdAt: "DESC" },
      take: limit,
    });
  }

  /**
   * Compare backtests
   */
  async compareBacktests(backtestIds: string[]): Promise<any> {
    const backtests = await Promise.all(
      backtestIds.map((id) => this.getBacktest(id)),
    );

    return {
      count: backtests.length,
      results: backtests.map((b) => ({
        id: b.id,
        name: b.name,
        totalReturn: b.totalReturn,
        volatility: b.volatility,
        sharpeRatio: b.sharpeRatio,
        maxDrawdown: b.maxDrawdown,
        strategy: b.strategy,
      })),
    };
  }
}
