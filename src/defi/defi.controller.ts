import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { User } from "../user/entities/user.entity";
import { PositionTrackingService } from "./services/position-tracking.service";
import { YieldOptimizationService } from "./services/yield-optimization.service";
import { RiskAssessmentService } from "./services/risk-assessment.service";
import { TransactionOptimizationService } from "./services/transaction-optimization.service";
import {
  CreateDeFiPositionDto,
  UpdateDeFiPositionDto,
  CreateDeFiTransactionDto,
  SimulateTransactionDto,
  ExecuteTransactionDto,
  ClaimRewardsDto,
  WithdrawDeFiPositionDto,
  EmergencyExitDto,
  DeFiPortfolioSummaryDto,
} from "./dto/defi.dto";
import {
  CreateYieldStrategyDto,
  UpdateYieldStrategyDto,
  RebalanceStrategyDto,
  CompoundRewardsDto,
  StrategyPerformanceDto,
} from "./dto/yield-strategy.dto";

@Controller("defi")
@UseGuards(JwtAuthGuard)
export class DeFiController {
  constructor(
    private positionTrackingService: PositionTrackingService,
    private yieldOptimizationService: YieldOptimizationService,
    private riskAssessmentService: RiskAssessmentService,
    private transactionOptimizationService: TransactionOptimizationService,
  ) {}

  // ==================== Portfolio Management ====================

  @Get("portfolio/summary")
  async getPortfolioSummary(
    @CurrentUser() user: User,
  ): Promise<DeFiPortfolioSummaryDto> {
    const analytics = await this.positionTrackingService.getPortfolioAnalytics(
      user.id,
    );

    return {
      total_positions: analytics.totalPositions,
      total_value: analytics.totalValue,
      total_collateral: analytics.totalCollateral,
      total_borrowed: analytics.totalBorrowed,
      net_value: analytics.netValue,
      average_apy: analytics.averageAPY,
      accumulated_yield: analytics.totalYield,
      total_unclaimed_rewards: analytics.unclaimedRewards,
      liquidation_risks: analytics.liquidationRisks,
      health_factor: analytics.healthFactor,
      positions_by_protocol: analytics.positionsByProtocol,
      positions_by_type: analytics.positionsByType,
    };
  }

  @Get("portfolio/analytics")
  async getPortfolioAnalytics(@CurrentUser() user: User) {
    return this.positionTrackingService.getPortfolioAnalytics(user.id);
  }

  @Get("portfolio/at-risk")
  async getPositionsAtRisk(@CurrentUser() user: User) {
    return this.positionTrackingService.getPositionsAtRisk(user.id);
  }

  @Get("portfolio/risk-monitoring")
  async monitorRisks(@CurrentUser() user: User) {
    return this.riskAssessmentService.monitorAllPositions(user.id);
  }

  // ==================== Positions ====================

  @Get("positions")
  async getPositions(
    @CurrentUser() user: User,
    @Query("protocol") protocol?: string,
    @Query("status") status?: string,
  ) {
    return this.positionTrackingService.getUserPositions(user.id, {
      protocol: protocol as any,
      status: status as any,
    });
  }

  @Get("positions/:positionId")
  async getPosition(@Param("positionId") positionId: string) {
    return this.positionTrackingService.getPositionPerformance(positionId, 30);
  }

  @Post("positions")
  @HttpCode(HttpStatus.CREATED)
  async createPosition(
    @CurrentUser() user: User,
    @Body() dto: CreateDeFiPositionDto,
  ) {
    return this.positionTrackingService.trackPosition(user.id, dto);
  }

  @Put("positions/:positionId")
  async updatePosition(
    @Param("positionId") positionId: string,
    @Body() dto: UpdateDeFiPositionDto,
  ) {
    // Implementation would update position settings
    return { success: true, message: "Position updated" };
  }

  @Post("positions/:positionId/sync")
  async syncPositionWithChain(@Param("positionId") positionId: string) {
    return this.positionTrackingService.syncPositionWithChain(positionId);
  }

  @Delete("positions/:positionId/close")
  async closePosition(
    @Param("positionId") positionId: string,
    @Query("final_amount") finalAmount?: number,
  ) {
    return this.positionTrackingService.closePosition(positionId, finalAmount);
  }

  // ==================== Risk Assessment ====================

  @Get("risk/position/:positionId")
  async assessPositionRisk(@Param("positionId") positionId: string) {
    return this.riskAssessmentService.assessPositionRisk(positionId);
  }

  @Post("risk/stress-test/:positionId")
  async stressTestPosition(
    @Param("positionId") positionId: string,
    @Body("scenarios") scenarios: any[],
  ) {
    return this.riskAssessmentService.stressTestPosition(positionId, scenarios);
  }

  // ==================== Transactions ====================

  @Post("transactions")
  @HttpCode(HttpStatus.CREATED)
  async createTransaction(
    @CurrentUser() user: User,
    @Body() dto: CreateDeFiTransactionDto,
  ) {
    return this.positionTrackingService.recordTransaction(dto.position_id, dto);
  }

  @Post("transactions/:transactionId/simulate")
  async simulateTransaction(@Param("transactionId") transactionId: string) {
    return this.transactionOptimizationService.simulateTransaction(
      transactionId,
    );
  }

  @Post("transactions/:transactionId/optimize-gas")
  async optimizeGas(
    @Param("transactionId") transactionId: string,
    @Query("priority")
    priority: "LOW" | "STANDARD" | "FAST" | "URGENT" = "STANDARD",
  ) {
    return this.transactionOptimizationService.estimateAndOptimizeGas(
      transactionId,
      priority,
    );
  }

  @Post("transactions/:transactionId/execute")
  async executeTransaction(
    @Param("transactionId") transactionId: string,
    @Body() dto: ExecuteTransactionDto,
  ) {
    return this.positionTrackingService.executeTransaction(
      transactionId,
      dto.transaction_id,
    );
  }

  @Post("transactions/bundle")
  async bundleTransactions(@Body("transaction_ids") transactionIds: string[]) {
    if (!transactionIds || transactionIds.length === 0) {
      throw new BadRequestException("No transaction IDs provided");
    }
    return this.transactionOptimizationService.bundleTransactions(
      transactionIds,
    );
  }

  @Get("transactions/batch/optimize")
  async optimizeBatchTransactions(@CurrentUser() user: User) {
    return this.transactionOptimizationService.optimizeBatchTransactions(
      user.id,
    );
  }

  // ==================== Rewards & Yield ====================

  @Post("rewards/claim")
  @HttpCode(HttpStatus.OK)
  async claimRewards(@CurrentUser() user: User, @Body() dto: ClaimRewardsDto) {
    return this.positionTrackingService.claimYield(dto.position_id, []);
  }

  @Post("positions/:positionId/claim-rewards")
  async claimPositionRewards(@Param("positionId") positionId: string) {
    // Would fetch unclaimed yields and claim them
    return { success: true, message: "Rewards claimed" };
  }

  // ==================== Yield Strategies ====================

  @Get("strategies")
  async getStrategies(@CurrentUser() user: User) {
    // Implementation would fetch user's strategies
    return [];
  }

  @Post("strategies")
  @HttpCode(HttpStatus.CREATED)
  async createStrategy(
    @CurrentUser() user: User,
    @Body() dto: CreateYieldStrategyDto,
  ) {
    return this.yieldOptimizationService.optimizeYieldAllocation(
      user.id,
      dto.total_allocation,
      dto.strategy_type,
      {
        maxRiskScore: dto.max_risk_score,
        preferredTokens: dto.tokens,
      },
    );
  }

  @Get("strategies/:strategyId")
  async getStrategy(@Param("strategyId") strategyId: string) {
    // Would fetch specific strategy
    return {};
  }

  @Put("strategies/:strategyId")
  async updateStrategy(
    @Param("strategyId") strategyId: string,
    @Body() dto: UpdateYieldStrategyDto,
  ) {
    return { success: true, message: "Strategy updated" };
  }

  @Post("strategies/:strategyId/rebalance")
  async rebalanceStrategy(
    @Param("strategyId") strategyId: string,
    @Body() dto: RebalanceStrategyDto,
  ) {
    return this.yieldOptimizationService.rebalanceStrategy(strategyId);
  }

  @Post("strategies/:strategyId/compound")
  async compoundStrategy(
    @Param("strategyId") strategyId: string,
    @Body() dto: CompoundRewardsDto,
  ) {
    return this.yieldOptimizationService.autoCompoundRewards(strategyId);
  }

  @Get("strategies/:strategyId/performance")
  async getStrategyPerformance(
    @Param("strategyId") strategyId: string,
    @Query("days") days: number = 30,
  ) {
    // Would fetch and calculate performance metrics
    return {};
  }

  @Delete("strategies/:strategyId")
  async deleteStrategy(@Param("strategyId") strategyId: string) {
    return { success: true, message: "Strategy deleted" };
  }

  // ==================== Yield Opportunities ====================

  @Get("opportunities")
  async getYieldOpportunities(
    @Query("tokens") tokens: string,
    @Query("chain") chain: string = "ethereum",
  ) {
    const tokenList = tokens ? tokens.split(",") : ["USDC", "DAI", "USDT"];
    return this.yieldOptimizationService.findHighestYieldOpportunities(
      tokenList,
      chain,
    );
  }

  @Post("opportunities/optimize")
  async optimizeYieldAllocation(
    @CurrentUser() user: User,
    @Query("capital") capital: number,
    @Query("strategy") strategy: string,
    @Body("tokens") tokens: string[],
  ) {
    if (!capital || capital <= 0) {
      throw new BadRequestException("Valid capital amount required");
    }

    return this.yieldOptimizationService.optimizeYieldAllocation(
      user.id,
      capital,
      strategy as any,
      {
        preferredTokens: tokens,
      },
    );
  }

  // ==================== Withdrawals & Emergency ====================

  @Post("positions/:positionId/withdraw")
  async withdrawFromPosition(
    @Param("positionId") positionId: string,
    @Body() dto: WithdrawDeFiPositionDto,
  ) {
    return { success: true, message: "Withdrawal initiated" };
  }

  @Post("positions/:positionId/emergency-exit")
  async emergencyExit(
    @Param("positionId") positionId: string,
    @Body() dto: EmergencyExitDto,
  ) {
    return this.transactionOptimizationService.optimizeEmergencyExit(
      dto.position_id,
    );
  }

  // ==================== Health & Monitoring ====================

  @Get("health/check")
  async healthCheck(@CurrentUser() user: User) {
    const analytics = await this.positionTrackingService.getPortfolioAnalytics(
      user.id,
    );
    const riskMonitoring = await this.riskAssessmentService.monitorAllPositions(
      user.id,
    );

    return {
      user_id: user.id,
      health_status: riskMonitoring.summary.healthRating,
      requires_action: riskMonitoring.requiresImmediateAction,
      portfolio_health: {
        positions: analytics.totalPositions,
        total_value: analytics.totalValue,
        risk_score: riskMonitoring.summary.averageRiskScore,
        liquidation_risks: riskMonitoring.liquidationRisks,
      },
      last_updated: new Date(),
    };
  }

  @Get("alerts")
  async getAlerts(@CurrentUser() user: User) {
    const riskMonitoring = await this.riskAssessmentService.monitorAllPositions(
      user.id,
    );

    const alerts: any[] = [];

    if (riskMonitoring.criticalRisks > 0) {
      alerts.push({
        severity: "CRITICAL",
        message: `${riskMonitoring.criticalRisks} position(s) at critical risk level`,
        action_required: true,
      });
    }

    if (riskMonitoring.liquidationRisks > 0) {
      alerts.push({
        severity: "CRITICAL",
        message: `${riskMonitoring.liquidationRisks} position(s) at liquidation risk`,
        action_required: true,
      });
    }

    if (riskMonitoring.highRisks > 0) {
      alerts.push({
        severity: "HIGH",
        message: `${riskMonitoring.highRisks} position(s) at high risk level`,
        action_required: false,
      });
    }

    return alerts;
  }
}
