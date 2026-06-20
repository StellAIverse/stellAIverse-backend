import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  RebalancingEvent,
  RebalanceTrigger,
  RebalanceStatus,
} from "../entities/rebalancing-event.entity";
import { Portfolio } from "../entities/portfolio.entity";
import { PortfolioAsset } from "../entities/portfolio-asset.entity";
import { PortfolioService } from "./portfolio.service";

interface RebalancingResult {
  event?: RebalancingEvent;
  allocationBefore: Record<string, number>;
  allocationAfter: Record<string, number>;
  trades: Array<{
    ticker: string;
    action: "buy" | "sell";
    quantity: number;
    price: number;
    value: number;
  }>;
  estimatedCost: number;
  taxImpact: number;
  allocationDrift: Record<string, number>;
  maxAllocationDrift: number;
  avgAllocationDrift: number;
}

@Injectable()
export class RebalancingService {
  private readonly logger = new Logger(RebalancingService.name);
  private readonly TRANSACTION_FEE_PERCENTAGE = 0.1; // 0.1% fee

  constructor(
    @InjectRepository(RebalancingEvent)
    private rebalancingRepository: Repository<RebalancingEvent>,
    @InjectRepository(Portfolio)
    private portfolioRepository: Repository<Portfolio>,
    @InjectRepository(PortfolioAsset)
    private portfolioAssetRepository: Repository<PortfolioAsset>,
    private portfolioService: PortfolioService,
  ) {}

  /**
   * Check if portfolio needs rebalancing
   */
  async checkRebalancingNeeded(portfolioId: string): Promise<boolean> {
    const portfolio = await this.portfolioService.getPortfolio(portfolioId);

    if (!portfolio.targetAllocation) {
      return false;
    }

    // Check drift from target allocation
    const maxDrift = portfolio.rebalanceThreshold || 5;
    const drift = await this.calculateAllocationDrift(portfolioId);
    const maxDriftValue = Math.max(...Object.values(drift).map(Math.abs));

    return maxDriftValue > maxDrift;
  }

  /**
   * Calculate rebalancing trades
   */
  async calculateRebalancingTrades(portfolioId: string): Promise<
    Array<{
      ticker: string;
      action: "buy" | "sell";
      quantity: number;
      price: number;
      value: number;
    }>
  > {
    const portfolio = await this.portfolioService.getPortfolio(portfolioId);
    const assets = await this.portfolioAssetRepository.find({
      where: { portfolioId },
    });

    const trades: Array<{
      ticker: string;
      action: "buy" | "sell";
      quantity: number;
      price: number;
      value: number;
    }> = [];

    for (const asset of assets) {
      const targetPercentage = portfolio.targetAllocation?.[asset.ticker] || 0;
      const currentPercentage = asset.allocationPercentage || 0;
      const difference = targetPercentage - currentPercentage;

      if (Math.abs(difference) > 0.5) {
        // Significant difference
        const targetValue = (targetPercentage / 100) * portfolio.totalValue;
        const currentValue = (currentPercentage / 100) * portfolio.totalValue;
        const valueDifference = targetValue - currentValue;

        const quantity = valueDifference / (asset.currentPrice || 1);

        trades.push({
          ticker: asset.ticker,
          action: quantity > 0 ? "buy" : "sell",
          quantity: Math.abs(quantity),
          price: asset.currentPrice || 0,
          value: Math.abs(valueDifference),
        });
      }
    }

    return trades;
  }

  /**
   * Calculate transaction costs
   */
  calculateTransactionCosts(
    trades: Array<{
      ticker: string;
      action: "buy" | "sell";
      quantity: number;
      price: number;
      value: number;
    }>,
  ): number {
    const totalTradeValue = trades.reduce((sum, trade) => sum + trade.value, 0);
    return totalTradeValue * (this.TRANSACTION_FEE_PERCENTAGE / 100);
  }

  /**
   * Calculate tax impact (simplified capital gains tax)
   */
  async calculateTaxImpact(
    portfolioId: string,
    trades: Array<{
      ticker: string;
      action: "buy" | "sell";
      quantity: number;
      price: number;
      value: number;
    }>,
  ): Promise<number> {
    const assets = await this.portfolioAssetRepository.find({
      where: { portfolioId },
    });

    let totalTaxImpact = 0;
    const CAPITAL_GAINS_TAX_RATE = 0.15; // 15% capital gains tax

    for (const trade of trades) {
      if (trade.action === "sell") {
        const asset = assets.find((a) => a.ticker === trade.ticker);
        if (asset && asset.costBasisPerShare && asset.currentPrice) {
          const gainPerShare = asset.currentPrice - asset.costBasisPerShare;
          const totalGain = gainPerShare * trade.quantity;
          if (totalGain > 0) {
            totalTaxImpact += totalGain * CAPITAL_GAINS_TAX_RATE;
          }
        }
      }
    }

    return totalTaxImpact;
  }

  /**
   * Calculate allocation drift
   */
  async calculateAllocationDrift(
    portfolioId: string,
  ): Promise<Record<string, number>> {
    const portfolio = await this.portfolioService.getPortfolio(portfolioId);
    const assets = await this.portfolioAssetRepository.find({
      where: { portfolioId },
    });

    const drift: Record<string, number> = {};

    for (const asset of assets) {
      const targetPercentage = portfolio.targetAllocation?.[asset.ticker] || 0;
      drift[asset.ticker] =
        asset.allocationPercentage - (targetPercentage as number);
    }

    return drift;
  }

  /**
   * Trigger rebalancing
   */
  async triggerRebalancing(
    portfolioId: string,
    trigger: RebalanceTrigger,
    reason?: string,
    dryRun: boolean = false,
  ): Promise<RebalancingResult> {
    const portfolio = await this.portfolioService.getPortfolio(portfolioId);
    const assets = await this.portfolioAssetRepository.find({
      where: { portfolioId },
    });

    const allocationBefore = { ...portfolio.currentAllocation };
    const trades = await this.calculateRebalancingTrades(portfolioId);
    const allocationDrift = await this.calculateAllocationDrift(portfolioId);
    const driftValues = Object.values(allocationDrift).map(Math.abs);
    const maxAllocationDrift = Math.max(...driftValues);
    const avgAllocationDrift =
      driftValues.reduce((a, b) => a + b, 0) / driftValues.length || 0;
    const estimatedCost = this.calculateTransactionCosts(trades);
    const taxImpact = await this.calculateTaxImpact(portfolioId, trades);

    const allocationAfter = portfolio.targetAllocation || portfolio.currentAllocation;

    if (dryRun) {
      return {
        allocationBefore,
        allocationAfter,
        trades,
        estimatedCost,
        taxImpact,
        allocationDrift,
        maxAllocationDrift,
        avgAllocationDrift,
      };
    }

    // Create rebalancing event
    const event = this.rebalancingRepository.create({
      portfolioId,
      trigger,
      status: RebalanceStatus.PENDING,
      triggerReason: reason,
      allocationBefore,
      allocationAfter,
      trades,
      estimatedCost,
      taxImpact,
      allocationDrift,
      maxAllocationDrift,
      avgAllocationDrift,
    });

    this.logger.log(
      `Rebalancing triggered for ${portfolioId}: ${trades.length} trades`,
    );

    const savedEvent = await this.rebalancingRepository.save(event);

    return {
      event: savedEvent,
      allocationBefore,
      allocationAfter,
      trades,
      estimatedCost,
      taxImpact,
      allocationDrift,
      maxAllocationDrift,
      avgAllocationDrift,
    };
  }

  /**
   * Approve rebalancing
   */
  async approveRebalancing(
    rebalancingEventId: string,
  ): Promise<RebalancingEvent> {
    const event = await this.rebalancingRepository.findOne({
      where: { id: rebalancingEventId },
    });

    if (!event) {
      throw new BadRequestException("Rebalancing event not found");
    }

    event.status = RebalanceStatus.IN_PROGRESS;

    return this.rebalancingRepository.save(event);
  }

  /**
   * Execute rebalancing
   */
  async executeRebalancing(
    rebalancingEventId: string,
    actualCost?: number,
    slippage?: number,
    notes?: string,
  ): Promise<RebalancingEvent> {
    const event = await this.rebalancingRepository.findOne({
      where: { id: rebalancingEventId },
      relations: ["portfolio"],
    });

    if (!event) {
      throw new BadRequestException("Rebalancing event not found");
    }

    // Update portfolio allocation
    const portfolio = event.portfolio;
    portfolio.currentAllocation = event.allocationAfter;
    portfolio.lastRebalanceDate = new Date();

    await this.portfolioRepository.save(portfolio);

    // Update rebalancing event
    event.status = RebalanceStatus.COMPLETED;
    event.actualCost = actualCost || event.estimatedCost;
    event.executionSlippage = slippage || 0;
    event.executionNotes = notes;
    event.executedAt = new Date();
    event.completedAt = new Date();

    this.logger.log(`Rebalancing executed for portfolio ${event.portfolioId}`);

    return this.rebalancingRepository.save(event);
  }

  /**
   * Cancel rebalancing
   */
  async cancelRebalancing(
    rebalancingEventId: string,
    reason: string,
  ): Promise<RebalancingEvent> {
    const event = await this.rebalancingRepository.findOne({
      where: { id: rebalancingEventId },
    });

    if (!event) {
      throw new BadRequestException("Rebalancing event not found");
    }

    event.status = RebalanceStatus.CANCELLED;
    event.failureReason = reason;

    return this.rebalancingRepository.save(event);
  }

  /**
   * Get rebalancing history
   */
  async getRebalancingHistory(
    portfolioId: string,
    limit: number = 10,
  ): Promise<RebalancingEvent[]> {
    return this.rebalancingRepository.find({
      where: { portfolioId },
      order: { createdAt: "DESC" },
      take: limit,
    });
  }

  /**
   * Check automatic rebalancing triggers
   */
  async checkAutoRebalancingTriggers(portfolioId: string): Promise<boolean> {
    const portfolio = await this.portfolioService.getPortfolio(portfolioId);

    if (!portfolio.autoRebalanceEnabled) {
      return false;
    }

    // Check time-based trigger
    if (portfolio.rebalanceFrequency) {
      const lastRebalance = portfolio.lastRebalanceDate || portfolio.createdAt;
      const now = new Date();
      const daysSinceRebalance =
        (now.getTime() - lastRebalance.getTime()) / (1000 * 60 * 60 * 24);

      const frequencyDays = this.frequencyToDays(portfolio.rebalanceFrequency);

      if (daysSinceRebalance >= frequencyDays) {
        this.logger.log(`Time-based rebalancing triggered for ${portfolioId}`);
        return true;
      }
    }

    // Check drift-based trigger
    const needsRebalancing = await this.checkRebalancingNeeded(portfolioId);

    if (needsRebalancing) {
      this.logger.log(`Drift-based rebalancing triggered for ${portfolioId}`);
    }

    return needsRebalancing;
  }

  /**
   * Convert rebalance frequency to days
   */
  private frequencyToDays(
    frequency: "daily" | "weekly" | "monthly" | "quarterly",
  ): number {
    switch (frequency) {
      case "daily":
        return 1;
      case "weekly":
        return 7;
      case "monthly":
        return 30;
      case "quarterly":
        return 90;
      default:
        return 90;
    }
  }
}
