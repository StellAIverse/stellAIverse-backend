import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeFiYieldStrategy, StrategyType } from '../entities/defi-yield-strategy.entity';
import { DeFiPosition } from '../entities/defi-position.entity';
import { ProtocolRegistry } from '../protocols/protocol-registry';
import { ProtocolAdapter, PositionData } from '../protocols/protocol-adapter.interface';

@Injectable()
export class YieldOptimizationService {
  private logger = new Logger('YieldOptimizationService');

  constructor(
    @InjectRepository(DeFiYieldStrategy)
    private strategyRepository: Repository<DeFiYieldStrategy>,
    @InjectRepository(DeFiPosition)
    private positionRepository: Repository<DeFiPosition>,
    private protocolRegistry: ProtocolRegistry,
  ) {}

  /**
   * Find highest yield opportunities across protocols
   */
  async findHighestYieldOpportunities(tokens: string[], chain: string = 'ethereum'): Promise<Map<string, YieldOpportunity[]>> {
    const opportunities = new Map<string, YieldOpportunity[]>();

    for (const token of tokens) {
      const tokenOpportunities: YieldOpportunity[] = [];

      for (const adapter of this.protocolRegistry.getAllAdapters()) {
        if (!adapter.supportedChains.includes(chain)) continue;

        try {
          const apy = await adapter.getAPY(token, chain);
          const metrics = await adapter.getProtocolMetrics();

          const opportunity: YieldOpportunity = {
            protocol: adapter.name,
            token,
            apy,
            tvl: metrics.tvl,
            riskScore: this.calculateProtocolRiskScore(metrics),
            jpy: apy - (this.calculateProtocolRiskScore(metrics) * 0.1), // Risk-adjusted
          };

          tokenOpportunities.push(opportunity);
        } catch (error) {
          this.logger.warn(`Error fetching APY for ${adapter.name} ${token}`, error.message);
        }
      }

      // Sort by risk-adjusted yield
      tokenOpportunities.sort((a, b) => b.jpy - a.jpy);
      opportunities.set(token, tokenOpportunities);
    }

    return opportunities;
  }

  /**
   * Optimize yield for a given capital allocation
   */
  async optimizeYieldAllocation(userId: string, totalCapital: number, strategyType: StrategyType, constraints: YieldConstraints): Promise<OptimizationResult> {
    const opportunities = await this.findHighestYieldOpportunities(constraints.preferredTokens || ['USDC', 'DAI', 'USDT']);

    let allocations: AllocationResult[] = [];

    switch (strategyType) {
      case StrategyType.HIGHEST_YIELD:
        allocations = this.allocateForHighestYield(opportunities, totalCapital, constraints);
        break;

      case StrategyType.STABLE_YIELD:
        allocations = this.allocateForStableYield(opportunities, totalCapital, constraints);
        break;

      case StrategyType.RISK_ADJUSTED:
        allocations = this.allocateForRiskAdjusted(opportunities, totalCapital, constraints);
        break;

      case StrategyType.DIVERSIFIED:
        allocations = this.allocateForDiversification(opportunities, totalCapital, constraints);
        break;

      default:
        throw new Error(`Unknown strategy type: ${strategyType}`);
    }

    const expectedApy = this.calculateExpectedAPY(allocations);
    const expectedYield = totalCapital * (expectedApy / 100);

    return {
      strategyType,
      totalCapital,
      expectedApy,
      expectedYield,
      allocations,
      constraints,
    };
  }

  /**
   * Rebalance existing strategy based on new market conditions
   */
  async rebalanceStrategy(strategyId: string): Promise<RebalanceResult> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId },
    });

    if (!strategy) throw new Error('Strategy not found');

    // Get current positions
    const positions = await this.positionRepository.find({
      where: {
        // Filter positions that belong to this strategy
        // This would need to be extended in the entity model
      },
    });

    // Analyze current allocation drift
    const currentAllocation = this.calculateCurrentAllocation(positions);
    const drift = this.calculateAllocationDrift(currentAllocation, strategy.allocation_weights);

    // If drift exceeds threshold, rebalance
    if (drift > (strategy.constraints?.maxDrift || 0.05)) {
      const opportunities = await this.findHighestYieldOpportunities(strategy.tokens);

      const newAllocations = this.allocateForHighestYield(
        opportunities,
        strategy.current_value,
        {
          maxRiskScore: strategy.constraints?.maxRiskScore,
          excludeProtocols: strategy.constraints?.excludeProtocols,
          preferredTokens: strategy.tokens,
        }
      );

      return {
        strategyId,
        currentAllocation,
        targetAllocation: strategy.allocation_weights,
        drift,
        needsRebalance: true,
        suggestedAllocations: newAllocations,
      };
    }

    return {
      strategyId,
      currentAllocation,
      targetAllocation: strategy.allocation_weights,
      drift,
      needsRebalance: false,
    };
  }

  /**
   * Auto-compound rewards back into positions
   */
  async autoCompoundRewards(strategyId: string): Promise<CompoundingResult> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId },
    });

    if (!strategy) throw new Error('Strategy not found');

    // Get positions for this strategy
    const positions = await this.positionRepository.find({
      where: {
        // Filter positions for this strategy
      },
    });

    const compoundingTransactions = [];
    let totalCompounded = 0;

    for (const position of positions) {
      try {
        const adapter = this.protocolRegistry.getAdapter(position.protocol as any);
        const rewards = await adapter.getRewards([position.contract_address], position.wallet_address);

        for (const reward of rewards) {
          if (reward.claimable && reward.amount > 0) {
            totalCompounded += reward.valueUSD;

            compoundingTransactions.push({
              protocol: position.protocol,
              token: reward.token,
              amount: reward.amount,
              value: reward.valueUSD,
            });
          }
        }
      } catch (error) {
        this.logger.warn(`Error compounding rewards for position ${position.id}`, error.message);
      }
    }

    strategy.accumulated_yield = (strategy.accumulated_yield || 0) + totalCompounded;
    strategy.last_compounded_at = new Date();
    await this.strategyRepository.save(strategy);

    return {
      strategyId,
      totalCompounded,
      compoundingCount: compoundingTransactions.length,
      transactions: compoundingTransactions,
    };
  }

  // Helper methods

  private calculateProtocolRiskScore(metrics: any): number {
    let score = 0;

    // TVL factor (higher TVL = lower risk)
    if (metrics.tvl < 10000000) score += 30;
    else if (metrics.tvl < 100000000) score += 20;
    else if (metrics.tvl < 1000000000) score += 10;

    // Age factor (newer = higher risk)
    if (metrics.launchDate) {
      const ageMonths = (Date.now() - new Date(metrics.launchDate).getTime()) / (1000 * 60 * 60 * 24 * 30);
      if (ageMonths < 6) score += 30;
      else if (ageMonths < 12) score += 20;
      else if (ageMonths < 24) score += 10;
    }

    // Audit status
    if (!metrics.audits || metrics.audits.length === 0) score += 20;
    else score -= Math.min(10, metrics.audits.length * 3);

    // Insurance coverage
    if (!metrics.insurance) score += 15;

    return Math.min(100, score);
  }

  private allocateForHighestYield(
    opportunities: Map<string, YieldOpportunity[]>,
    totalCapital: number,
    constraints: YieldConstraints
  ): AllocationResult[] {
    const allocations: AllocationResult[] = [];

    for (const [token, opps] of opportunities) {
      if (opps.length === 0) continue;

      // Take highest yield opportunity
      const topOpp = opps[0];

      if (constraints.maxRiskScore && topOpp.riskScore > constraints.maxRiskScore) {
        // Take next best within risk tolerance
        const safer = opps.find((o) => o.riskScore <= constraints.maxRiskScore);
        if (safer) allocations.push(this.createAllocation(safer, totalCapital * 0.1)); //  Default 10% per token
      } else {
        allocations.push(this.createAllocation(topOpp, totalCapital * 0.1));
      }
    }

    return allocations;
  }

  private allocateForStableYield(
    opportunities: Map<string, YieldOpportunity[]>,
    totalCapital: number,
    constraints: YieldConstraints
  ): AllocationResult[] {
    // Prefer lower-risk protocols
    const allocations: AllocationResult[] = [];

    for (const [token, opps] of opportunities) {
      const stableOpps = opps.filter((o) => o.riskScore < 40);
      if (stableOpps.length > 0) {
        allocations.push(this.createAllocation(stableOpps[0], totalCapital * 0.1));
      }
    }

    return allocations;
  }

  private allocateForRiskAdjusted(opportunities: Map<string, YieldOpportunity[]>, totalCapital: number, constraints: YieldConstraints): AllocationResult[] {
    // Weight by Sharpe-like ratio (JPY = APY - risk adjustment)
    let totalJpy = 0;
    const candidates: { opp: YieldOpportunity; jpy: number }[] = [];

    for (const [token, opps] of opportunities) {
      for (const opp of opps) {
        if (constraints.maxRiskScore && opp.riskScore > constraints.maxRiskScore) continue;
        candidates.push({ opp, jpy: opp.jpy });
        totalJpy += opp.jpy;
      }
    }

    // Allocate proportional to JPY
    return candidates.map((c) => ({
      protocol: c.opp.protocol,
      token: c.opp.token,
      allocation: (c.jpy / totalJpy) * totalCapital,
      expectedApy: c.opp.apy,
    }));
  }

  private allocateForDiversification(opportunities: Map<string, YieldOpportunity[]>, totalCapital: number, constraints: YieldConstraints): AllocationResult[] {
    const allocations: AllocationResult[] = [];
    const tokenCount = opportunities.size;

    for (const [token, opps] of opportunities) {
      if (opps.length > 0) {
        const allocation = totalCapital / tokenCount;
        allocations.push(this.createAllocation(opps[0], allocation));
      }
    }

    return allocations;
  }

  private createAllocation(opportunity: YieldOpportunity, amount: number): AllocationResult {
    return {
      protocol: opportunity.protocol,
      token: opportunity.token,
      allocation: amount,
      expectedApy: opportunity.apy,
    };
  }

  private calculateExpectedAPY(allocations: AllocationResult[]): number {
    const totalAllocation = allocations.reduce((sum, a) => sum + a.allocation, 0);
    const totalYield = allocations.reduce((sum, a) => sum + (a.allocation * a.expectedApy) / 100, 0);
    return (totalYield / totalAllocation) * 100;
  }

  private calculateCurrentAllocation(positions: DeFiPosition[]): Record<string, number> {
    const allocation: Record<string, number> = {};

    for (const position of positions) {
      const key = `${position.protocol}:${position.token_symbol}`;
      allocation[key] = (allocation[key] || 0) + position.current_amount;
    }

    return allocation;
  }

  private calculateAllocationDrift(current: Record<string, number>, target: Record<string, number>): number {
    let totalDrift = 0;
    const allKeys = new Set([...Object.keys(current), ...Object.keys(target)]);

    for (const key of allKeys) {
      const currentVal = current[key] || 0;
      const targetVal = target[key] || 0;
      totalDrift += Math.abs(currentVal - targetVal);
    }

    return totalDrift / (Object.values(target).reduce((a, b) => a + b, 0) || 1);
  }
}

export interface YieldOpportunity {
  protocol: string;
  token: string;
  apy: number;
  tvl: number;
  riskScore: number;
  jpy: number; // JPY = risk-adjusted yield
}

export interface YieldConstraints {
  maxRiskScore?: number;
  minLiquidity?: number;
  preferredTokens?: string[];
  excludeProtocols?: string[];
  maxDrift?: number;
}

export interface AllocationResult {
  protocol: string;
  token: string;
  allocation: number;
  expectedApy: number;
}

export interface OptimizationResult {
  strategyType: StrategyType;
  totalCapital: number;
  expectedApy: number;
  expectedYield: number;
  allocations: AllocationResult[];
  constraints: YieldConstraints;
}

export interface RebalanceResult {
  strategyId: string;
  currentAllocation: Record<string, number>;
  targetAllocation: Record<string, number>;
  drift: number;
  needsRebalance: boolean;
  suggestedAllocations?: AllocationResult[];
}

export interface CompoundingResult {
  strategyId: string;
  totalCompounded: number;
  compoundingCount: number;
  transactions: Array<{
    protocol: string;
    token: string;
    amount: number;
    value: number;
  }>;
}
