import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  DeFiPosition,
  PositionStatus,
  PositionType,
} from "../entities/defi-position.entity";
import {
  DeFiTransaction,
  TransactionStatus,
  TransactionType,
} from "../entities/defi-transaction.entity";
import { DeFiYieldRecord } from "../entities/defi-yield-record.entity";
import { ProtocolRegistry } from "../protocols/protocol-registry";

@Injectable()
export class PositionTrackingService {
  private logger = new Logger("PositionTrackingService");

  constructor(
    @InjectRepository(DeFiPosition)
    private positionRepository: Repository<DeFiPosition>,
    @InjectRepository(DeFiTransaction)
    private transactionRepository: Repository<DeFiTransaction>,
    @InjectRepository(DeFiYieldRecord)
    private yieldRepository: Repository<DeFiYieldRecord>,
    private protocolRegistry: ProtocolRegistry,
  ) {}

  /**
   * Get all DeFi positions for a user
   */
  async getUserPositions(
    userId: string,
    filter?: PositionFilter,
  ): Promise<PositionSummary[]> {
    let query = this.positionRepository
      .createQueryBuilder("p")
      .where("p.user_id = :userId", { userId })
      .leftJoinAndSelect("p.yield_records", "yr")
      .leftJoinAndSelect("p.transactions", "t");

    if (filter?.protocol) {
      query = query.andWhere("p.protocol = :protocol", {
        protocol: filter.protocol,
      });
    }

    if (filter?.status) {
      query = query.andWhere("p.status = :status", { status: filter.status });
    }

    const positions = await query.getMany();

    return positions.map((p) => this.mapPositionToSummary(p));
  }

  /**
   * Get detailed analytics for user's DeFi portfolio
   */
  async getPortfolioAnalytics(userId: string): Promise<PortfolioAnalytics> {
    const positions = await this.positionRepository.find({
      where: { user_id: userId },
      relations: ["yield_records", "transactions"],
    });

    const totalValue = positions.reduce((sum, p) => sum + p.current_amount, 0);
    const totalCollateral = positions
      .filter((p) => p.collateral_amount)
      .reduce((sum, p) => sum + p.collateral_amount, 0);
    const totalBorrowed = positions
      .filter((p) => p.borrowed_amount)
      .reduce((sum, p) => sum + p.borrowed_amount, 0);
    const netValue = totalCollateral - totalBorrowed;

    const totalYield = positions.reduce(
      (sum, p) => sum + p.accumulated_yield,
      0,
    );
    const averageAPY =
      positions.length > 0
        ? positions.reduce((sum, p) => sum + p.apy, 0) / positions.length
        : 0;

    // Group by protocol
    const byProtocol: Record<string, any> = {};
    for (const position of positions) {
      if (!byProtocol[position.protocol]) {
        byProtocol[position.protocol] = {
          count: 0,
          totalValue: 0,
          totalYield: 0,
          averageAPY: 0,
        };
      }
      byProtocol[position.protocol].count++;
      byProtocol[position.protocol].totalValue += position.current_amount;
      byProtocol[position.protocol].totalYield += position.accumulated_yield;
    }

    // Recalculate averages
    for (const protocol in byProtocol) {
      byProtocol[protocol].averageAPY =
        byProtocol[protocol].count > 0
          ? byProtocol[protocol].totalYield / byProtocol[protocol].totalValue
          : 0;
    }

    // Group by type
    const byType: Record<string, { count: number; value: number }> = {};
    for (const position of positions) {
      if (!byType[position.position_type]) {
        byType[position.position_type] = { count: 0, value: 0 };
      }
      byType[position.position_type].count++;
      byType[position.position_type].value += position.current_amount;
    }

    // Calculate unclaimed rewards
    const allRewards = positions.flatMap((p) => p.yield_records || []);
    const unclaimedRewards = allRewards
      .filter((r) => !r.claimed)
      .reduce((sum, r) => sum + r.token_value, 0);

    // Calculate risk factors
    const riskyPositions = positions.filter(
      (p) => p.status === PositionStatus.LIQUIDATION_RISK,
    );
    const liquidationRiskCount = riskyPositions.length;

    // Health factor (aggregate)
    const healthFactors = positions
      .filter((p) => p.metadata?.healthFactor)
      .map((p) => p.metadata.healthFactor);
    const averageHealthFactor =
      healthFactors.length > 0
        ? healthFactors.reduce((a, b) => a + b, 0) / healthFactors.length
        : 10;

    return {
      totalPositions: positions.length,
      totalValue,
      totalCollateral,
      totalBorrowed,
      netValue,
      totalYield,
      averageAPY,
      unclaimedRewards,
      liquidationRisks: liquidationRiskCount,
      healthFactor: averageHealthFactor,
      positionsByProtocol: byProtocol,
      positionsByType: byType,
      recentTransactions: await this.getRecentTransactions(userId, 10),
      yieldHistory: await this.getYieldHistory(userId, 30),
    };
  }

  /**
   * Track a new position
   */
  async trackPosition(
    userId: string,
    positionData: any,
  ): Promise<DeFiPosition> {
    const position = this.positionRepository.create({
      user_id: userId,
      protocol: positionData.protocol,
      position_type: positionData.position_type,
      status: PositionStatus.ACTIVE,
      contract_address: positionData.contract_address,
      wallet_address: positionData.wallet_address,
      token_symbol: positionData.token_symbol,
      principal_amount: positionData.principal_amount,
      current_amount:
        positionData.current_amount || positionData.principal_amount,
      apy: positionData.apy || 0,
      accumulated_yield: 0,
      auto_compound_enabled: positionData.auto_compound_enabled || false,
    });

    return this.positionRepository.save(position);
  }

  /**
   * Update position from on-chain data
   */
  async syncPositionWithChain(positionId: string): Promise<DeFiPosition> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId },
    });

    if (!position) throw new Error("Position not found");

    const adapter = this.protocolRegistry.getAdapter(position.protocol as any);

    try {
      // Fetch current position data from protocol
      const currentData = await adapter.getPosition(
        position.wallet_address,
        position.token_symbol,
        "ethereum",
      );

      // Update position
      position.current_amount = currentData.balance;
      position.apy = currentData.apy;
      position.accumulated_yield =
        (position.accumulated_yield || 0) +
        (currentData.valueUSD - position.current_amount);
      position.last_updated_on_chain = new Date();

      // Update risk score if available
      if (position.borrowed_amount) {
        try {
          const riskMetrics = await adapter.getRiskMetrics(
            position.wallet_address,
            position.token_symbol,
            "ethereum",
          );
          // Calculate risk score from components
          position.risk_score = (Object.values(riskMetrics).reduce(
            (a: number, b: number) => a + b,
            0,
          ) / Object.keys(riskMetrics).length) as any;
        } catch (error) {
          this.logger.warn(
            `Error updating risk metrics for position ${positionId}`,
          );
        }
      }

      return this.positionRepository.save(position);
    } catch (error) {
      this.logger.error(
        `Error syncing position ${positionId} with chain`,
        error,
      );
      throw error;
    }
  }

  /**
   * Record a transaction for a position
   */
  async recordTransaction(
    positionId: string,
    transactionData: any,
  ): Promise<DeFiTransaction> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId },
    });

    if (!position) throw new Error("Position not found");

    const transaction = this.transactionRepository.create({
      position_id: positionId,
      transaction_type: transactionData.transaction_type,
      status: TransactionStatus.SIMULATED,
      amount_in: transactionData.amount_in,
      token_in: transactionData.token_in,
      amount_out: transactionData.amount_out,
      token_out: transactionData.token_out,
      gas_used: transactionData.gas_used || 0,
      gas_price_gwei: transactionData.gas_price_gwei || 0,
      gas_cost_usd: transactionData.gas_cost_usd || 0,
      network: transactionData.network || "ethereum",
    });

    return this.transactionRepository.save(transaction);
  }

  /**
   * Execute a pending transaction
   */
  async executeTransaction(
    transactionId: string,
    txHash: string,
  ): Promise<DeFiTransaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
    });

    if (!transaction) throw new Error("Transaction not found");

    transaction.transaction_hash = txHash;
    transaction.status = TransactionStatus.SUBMITTED;
    transaction.executed_at = new Date();

    return this.transactionRepository.save(transaction);
  }

  /**
   * Record yield/reward earnings
   */
  async recordYield(
    positionId: string,
    yieldData: any,
  ): Promise<DeFiYieldRecord> {
    const yield_record = this.yieldRepository.create({
      position_id: positionId,
      amount: yieldData.amount,
      token_symbol: yieldData.token_symbol,
      token_value: yieldData.token_value,
      apy: yieldData.apy || 0,
      yield_type: yieldData.yield_type,
    });

    return this.yieldRepository.save(yield_record);
  }

  /**
   * Claim yields and update position state
   */
  async claimYield(
    positionId: string,
    yieldIds: string[],
  ): Promise<ClaimResult> {
    const records = await this.yieldRepository.find({
      where: { id: { $in: yieldIds } as any },
    });

    const totalClaimed = records.reduce((sum, r) => sum + r.token_value, 0);
    const updateData = records.map((r) => {
      r.claimed = true;
      r.claim_date = new Date();
      return r;
    });

    await this.yieldRepository.save(updateData);

    // Update position accumulated yield
    const position = await this.positionRepository.findOne({
      where: { id: positionId },
    });
    if (position) {
      position.accumulated_yield =
        (position.accumulated_yield || 0) + totalClaimed;
      await this.positionRepository.save(position);
    }

    return {
      totalClaimed,
      recordsClaimed: records.length,
      timestamp: new Date(),
    };
  }

  /**
   * Close or withdraw from a position
   */
  async closePosition(
    positionId: string,
    finalAmount?: number,
  ): Promise<DeFiPosition> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId },
    });

    if (!position) throw new Error("Position not found");

    position.status = PositionStatus.CLOSED;
    if (finalAmount !== undefined) {
      position.current_amount = finalAmount;
    }

    return this.positionRepository.save(position);
  }

  /**
   * Get position performance over time
   */
  async getPositionPerformance(
    positionId: string,
    days: number = 30,
  ): Promise<PerformanceData[]> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId },
      relations: ["yield_records", "transactions"],
    });

    if (!position) throw new Error("Position not found");

    const performance: PerformanceData[] = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Generate daily performance data from yield records
    const yieldsByDate: Record<string, number> = {};
    for (const record of position.yield_records || []) {
      if (record.created_at >= startDate) {
        const dateKey = record.created_at.toISOString().split("T")[0];
        yieldsByDate[dateKey] =
          (yieldsByDate[dateKey] || 0) + record.token_value;
      }
    }

    // Build performance timeline
    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split("T")[0];

      performance.push({
        date,
        value: position.current_amount,
        yield: yieldsByDate[dateKey] || 0,
        apy: position.apy,
      });
    }

    return performance;
  }

  /**
   * Get positions approaching liquidation
   */
  async getPositionsAtRisk(userId: string): Promise<RiskPosition[]> {
    const positions = await this.positionRepository.find({
      where: { user_id: userId, status: PositionStatus.LIQUIDATION_RISK },
    });

    return positions.map((p) => ({
      positionId: p.id,
      protocol: p.protocol,
      token: p.token_symbol,
      ltv: p.ltv || 0,
      maxLtv: p.max_ltv || 0,
      collateralValue: p.collateral_value || 0,
      borrowedValue: p.borrowed_value || 0,
      riskLevel: this.calculateRiskLevel(p.ltv, p.max_ltv),
      hoursToLiquidation: this.estimateHoursToLiquidation(p),
    }));
  }

  // Helper methods

  private mapPositionToSummary(position: DeFiPosition): PositionSummary {
    return {
      id: position.id,
      protocol: position.protocol,
      type: position.position_type,
      status: position.status,
      token: position.token_symbol,
      balance: position.current_amount,
      value: position.current_amount * (position.apy / 100), // Simplified
      apy: position.apy,
      yield: position.accumulated_yield,
      lastUpdated: position.last_updated_on_chain,
    };
  }

  private async getRecentTransactions(
    userId: string,
    limit: number = 10,
  ): Promise<DeFiTransaction[]> {
    return this.transactionRepository
      .createQueryBuilder("t")
      .innerJoin(DeFiPosition, "p", "t.position_id = p.id")
      .where("p.user_id = :userId", { userId })
      .orderBy("t.created_at", "DESC")
      .limit(limit)
      .getMany();
  }

  private async getYieldHistory(
    userId: string,
    days: number = 30,
  ): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const records = await this.yieldRepository
      .createQueryBuilder("yr")
      .innerJoin(DeFiPosition, "p", "yr.position_id = p.id")
      .where("p.user_id = :userId", { userId })
      .andWhere("yr.created_at >= :startDate", { startDate })
      .orderBy("yr.created_at", "DESC")
      .getMany();

    return records;
  }

  private calculateRiskLevel(
    ltv: number | null,
    maxLtv: number | null,
  ): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
    if (!ltv || !maxLtv) return "LOW";
    const ratio = ltv / maxLtv;
    if (ratio > 0.9) return "CRITICAL";
    if (ratio > 0.8) return "HIGH";
    if (ratio > 0.6) return "MEDIUM";
    return "LOW";
  }

  private estimateHoursToLiquidation(
    position: DeFiPosition,
  ): number | undefined {
    if (!position.ltv || !position.max_ltv || !position.metadata?.volatility)
      return undefined;
    const margin = (position.max_ltv - position.ltv) / position.ltv;
    const hours = (margin / (position.metadata.volatility / 100)) * 24;
    return Math.round(Math.max(0, hours));
  }
}

export interface PositionFilter {
  protocol?: string;
  status?: PositionStatus;
  type?: PositionType;
}

export interface PositionSummary {
  id: string;
  protocol: string;
  type: PositionType;
  status: PositionStatus;
  token: string;
  balance: number;
  value: number;
  apy: number;
  yield: number;
  lastUpdated: Date;
}

export interface PortfolioAnalytics {
  totalPositions: number;
  totalValue: number;
  totalCollateral: number;
  totalBorrowed: number;
  netValue: number;
  totalYield: number;
  averageAPY: number;
  unclaimedRewards: number;
  liquidationRisks: number;
  healthFactor: number;
  positionsByProtocol: Record<string, any>;
  positionsByType: Record<string, any>;
  recentTransactions: DeFiTransaction[];
  yieldHistory: any[];
}

export interface ClaimResult {
  totalClaimed: number;
  recordsClaimed: number;
  timestamp: Date;
}

export interface PerformanceData {
  date: Date;
  value: number;
  yield: number;
  apy: number;
}

export interface RiskPosition {
  positionId: string;
  protocol: string;
  token: string;
  ltv: number;
  maxLtv: number;
  collateralValue: number;
  borrowedValue: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  hoursToLiquidation?: number;
}
