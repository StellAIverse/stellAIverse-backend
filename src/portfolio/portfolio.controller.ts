import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  BadRequestException,
  Query,
  HttpCode,
  HttpStatus,
  Response,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Response as ExpressResponse } from "express";
import { JwtAuthGuard } from "src/auth/jwt.guard";
import { PortfolioService } from "./services/portfolio.service";
import { RebalancingService } from "./services/rebalancing.service";
import { PerformanceAnalyticsService } from "./services/performance-analytics.service";
import { BacktestingService } from "./services/backtesting.service";
import { MLPredictionService } from "./services/ml-prediction.service";
import { TradingTransactionService } from "./services/trading-transaction.service";
import { TransactionHistoryService } from "./services/transaction-history.service";
import { PortfolioOwnerGuard } from "src/common/guard/portfolio-owner.guard";
import {
  CreatePortfolioDto,
  UpdatePortfolioDto,
  QueryPortfolioDto,
} from "./dto/portfolio.dto";
import {
  AddAssetToPortfolioDto,
  UpdatePortfolioAssetDto,
} from "./dto/portfolio-asset.dto";
import {
  ApproveOptimizationDto,
  CreateOptimizationDto,
} from "./dto/optimization.dto";
import {
  ExecuteRebalancingDto,
  TriggerRebalancingDto,
  CancelRebalancingDto,
} from "./dto/rebalancing.dto";
import {
  GetPerformanceMetricsDto,
  GetPerformanceByPeriodDto,
  GetBenchmarkComparisonDto,
  RecordSnapshotDto,
  GetVaRDto,
} from "./dto/performance.dto";
import { CreateBacktestDto } from "./dto/backtest.dto";
import {
  CreateTransactionDto,
  TransactionFilterDto,
  TransactionExportDto,
} from "./dto/transaction.dto";

@Controller("portfolio")
@ApiTags("Portfolio Optimization")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Throttle({ trading: { ttl: 60_000, limit: 20 } })
export class PortfolioController {
  constructor(
    private portfolioService: PortfolioService,
    private rebalancingService: RebalancingService,
    private performanceService: PerformanceAnalyticsService,
    private backtestService: BacktestingService,
    private mlService: MLPredictionService,
    private tradingTransactionService: TradingTransactionService,
    private transactionHistoryService: TransactionHistoryService,
  ) {}

  // Portfolio Management Endpoints

  @Post("portfolios")
  @ApiOperation({ summary: "Create a new portfolio" })
  async createPortfolio(@Request() req: any, @Body() dto: CreatePortfolioDto) {
    return this.portfolioService.createPortfolio(req.user.id, dto);
  }

  @Get("portfolios")
  @ApiOperation({
    summary: "List portfolios for user with pagination and filtering",
  })
  async getUserPortfolios(
    @Request() req: any,
    @Query() query: QueryPortfolioDto,
  ) {
    return this.portfolioService.listPortfolios(req.user.id, query);
  }

  @Get("portfolios/:id")
  @ApiOperation({ summary: "Get portfolio details" })
  @UseGuards(PortfolioOwnerGuard)
  async getPortfolio(@Param("id") portfolioId: string) {
    return this.portfolioService.getPortfolio(portfolioId);
  }

  @Put("portfolios/:id")
  @ApiOperation({ summary: "Update portfolio" })
  @UseGuards(PortfolioOwnerGuard)
  async updatePortfolio(
    @Param("id") portfolioId: string,
    @Body() dto: UpdatePortfolioDto,
  ) {
    return this.portfolioService.updatePortfolio(portfolioId, dto);
  }

  @Post("portfolios/:id/archive")
  @ApiOperation({ summary: "Archive portfolio (soft delete via status)" })
  @UseGuards(PortfolioOwnerGuard)
  async archivePortfolio(@Param("id") portfolioId: string) {
    return this.portfolioService.archivePortfolio(portfolioId);
  }

  @Delete("portfolios/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete portfolio" })
  @UseGuards(PortfolioOwnerGuard)
  async deletePortfolio(@Param("id") portfolioId: string) {
    return this.portfolioService.deletePortfolio(portfolioId);
  }

  // Holding Management Endpoints

  @Post("portfolios/:portfolioId/assets")
  @ApiOperation({ summary: "Add holding (asset) to portfolio" })
  @UseGuards(PortfolioOwnerGuard)
  async addAsset(
    @Param("portfolioId") portfolioId: string,
    @Body() dto: AddAssetToPortfolioDto,
  ) {
    return this.portfolioService.addAsset(
      portfolioId,
      dto.ticker,
      dto.name,
      dto.quantity,
      dto.currentPrice,
      dto.costBasis,
      dto.chain,
    );
  }

  @Put("portfolios/:portfolioId/assets/:assetId")
  @ApiOperation({ summary: "Update holding (asset) in portfolio" })
  @UseGuards(PortfolioOwnerGuard)
  async updateAsset(
    @Param("portfolioId") portfolioId: string,
    @Param("assetId") assetId: string,
    @Body() dto: UpdatePortfolioAssetDto,
  ) {
    return this.portfolioService.updateAsset(portfolioId, assetId, dto);
  }

  @Delete("portfolios/:portfolioId/assets/:assetId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove holding (asset) from portfolio" })
  @UseGuards(PortfolioOwnerGuard)
  async removeAsset(
    @Param("portfolioId") portfolioId: string,
    @Param("assetId") assetId: string,
  ) {
    return this.portfolioService.removeAsset(portfolioId, assetId);
  }

  @Put("portfolios/:portfolioId/assets/:assetId/price")
  @ApiOperation({ summary: "Update asset price" })
  async updateAssetPrice(
    @Param("assetId") assetId: string,
    @Body() body: { price: number },
  ) {
    return this.portfolioService.updateAssetPrice(assetId, body.price);
  }

  // Optimization Endpoints

  @Post("portfolios/:portfolioId/optimize")
  @ApiOperation({ summary: "Run portfolio optimization" })
  @UseGuards(PortfolioOwnerGuard)
  async runOptimization(
    @Param("portfolioId") portfolioId: string,
    @Body() dto: CreateOptimizationDto,
  ) {
    dto.portfolioId = portfolioId; // Ensure portfolio ID matches
    return this.portfolioService.runOptimization(portfolioId, dto);
  }

  @Post("optimizations/:optimizationId/approve")
  @ApiOperation({
    summary: "Approve optimization recommendation",
  })
  async approveOptimization(
    @Param("optimizationId") optimizationId: string,
    @Body() dto: ApproveOptimizationDto,
  ) {
    return this.portfolioService.approveOptimization(optimizationId, dto.notes);
  }

  @Post("optimizations/:optimizationId/implement")
  @ApiOperation({
    summary: "Implement optimization (apply to portfolio)",
  })
  async implementOptimization(@Param("optimizationId") optimizationId: string) {
    return this.portfolioService.implementOptimization(optimizationId);
  }

  @Get("portfolios/:portfolioId/optimization-history")
  @ApiOperation({ summary: "Get optimization history" })
  @UseGuards(PortfolioOwnerGuard)
  async getOptimizationHistory(
    @Param("portfolioId") portfolioId: string,
    @Query("limit") limit: number = 10,
  ) {
    return this.portfolioService.getOptimizationHistory(portfolioId, limit);
  }

  // Rebalancing Endpoints

  @Get("portfolios/:portfolioId/rebalance-check")
  @ApiOperation({
    summary: "Check if portfolio needs rebalancing",
  })
  @UseGuards(PortfolioOwnerGuard)
  async checkRebalancing(@Param("portfolioId") portfolioId: string) {
    const needsRebalancing =
      await this.rebalancingService.checkRebalancingNeeded(portfolioId);
    const allocationDrift =
      await this.rebalancingService.calculateAllocationDrift(portfolioId);

    return {
      needsRebalancing,
      allocationDrift,
    };
  }

  @Post("portfolios/:portfolioId/rebalance")
  @ApiOperation({
    summary: "Trigger portfolio rebalancing",
  })
  @UseGuards(PortfolioOwnerGuard)
  async triggerRebalancing(
    @Param("portfolioId") portfolioId: string,
    @Body() dto: TriggerRebalancingDto,
  ) {
    dto.portfolioId = portfolioId;
    return this.rebalancingService.triggerRebalancing(
      portfolioId,
      dto.trigger,
      dto.triggerReason,
      dto.dryRun,
    );
  }

  @Post("rebalancing/:rebalancingId/approve")
  @ApiOperation({
    summary: "Approve rebalancing event",
  })
  async approveRebalancing(@Param("rebalancingId") rebalancingId: string) {
    return this.rebalancingService.approveRebalancing(rebalancingId);
  }

  @Post("rebalancing/:rebalancingId/execute")
  @ApiOperation({
    summary: "Execute approved rebalancing",
  })
  async executeRebalancing(
    @Param("rebalancingId") rebalancingId: string,
    @Body() dto: ExecuteRebalancingDto,
  ) {
    return this.rebalancingService.executeRebalancing(
      rebalancingId,
      dto.actualCost,
      dto.executionSlippage,
      dto.executionNotes,
    );
  }

  @Post("rebalancing/:rebalancingId/cancel")
  @ApiOperation({
    summary: "Cancel rebalancing event",
  })
  async cancelRebalancing(
    @Param("rebalancingId") rebalancingId: string,
    @Body() dto: CancelRebalancingDto,
  ) {
    return this.rebalancingService.cancelRebalancing(rebalancingId, dto.reason);
  }

  @Get("portfolios/:portfolioId/rebalancing-history")
  @ApiOperation({ summary: "Get rebalancing history" })
  @UseGuards(PortfolioOwnerGuard)
  async getRebalancingHistory(
    @Param("portfolioId") portfolioId: string,
    @Query("limit") limit: number = 10,
  ) {
    return this.rebalancingService.getRebalancingHistory(portfolioId, limit);
  }

  @Get("portfolios/:portfolioId/allocation-drift")
  @ApiOperation({
    summary: "Get current allocation drift from target",
  })
  @UseGuards(PortfolioOwnerGuard)
  async getAllocationDrift(@Param("portfolioId") portfolioId: string) {
    return this.rebalancingService.calculateAllocationDrift(portfolioId);
  }

  // Performance Analytics Endpoints

  @Get("portfolios/:portfolioId/performance-summary")
  @ApiOperation({
    summary: "Get portfolio performance summary",
  })
  @UseGuards(PortfolioOwnerGuard)
  async getPerformanceSummary(@Param("portfolioId") portfolioId: string) {
    return this.performanceService.getPerformanceSummary(portfolioId);
  }

  @Get("portfolios/:portfolioId/metrics")
  @ApiOperation({
    summary: "Get performance metrics for date range",
  })
  @UseGuards(PortfolioOwnerGuard)
  async getMetrics(
    @Param("portfolioId") portfolioId: string,
    @Query() dto: GetPerformanceMetricsDto,
  ) {
    const startDate = dto.startDate
      ? new Date(dto.startDate)
      : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const endDate = dto.endDate ? new Date(dto.endDate) : new Date();

    return this.performanceService.getMetricsForDateRange(
      portfolioId,
      startDate,
      endDate,
    );
  }

  @Get("portfolios/:portfolioId/metrics/attribution")
  @ApiOperation({
    summary: "Get attribution analysis",
  })
  @UseGuards(PortfolioOwnerGuard)
  async getAttributionAnalysis(
    @Param("portfolioId") portfolioId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException("startDate and endDate required");
    }

    return this.performanceService.getAttributionAnalysis(
      portfolioId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get("portfolios/:portfolioId/metrics/period")
  @ApiOperation({
    summary:
      "Get performance metrics for a predefined period (1D/1W/1M/3M/6M/YTD/1Y/3Y/ALL)",
  })
  @UseGuards(PortfolioOwnerGuard)
  async getMetricsByPeriod(
    @Param("portfolioId") portfolioId: string,
    @Query() dto: GetPerformanceByPeriodDto,
  ) {
    return this.performanceService.getMetricsForPeriod(portfolioId, dto.period);
  }

  @Get("portfolios/:portfolioId/metrics/benchmark")
  @ApiOperation({
    summary: "Compare portfolio performance against a benchmark ticker",
  })
  @UseGuards(PortfolioOwnerGuard)
  async getBenchmarkComparison(
    @Param("portfolioId") portfolioId: string,
    @Query() dto: GetBenchmarkComparisonDto,
  ) {
    return this.performanceService.getBenchmarkComparison(
      portfolioId,
      dto.benchmarkTicker,
      dto.startDate ? new Date(dto.startDate) : undefined,
      dto.endDate ? new Date(dto.endDate) : undefined,
    );
  }

  @Get("portfolios/:portfolioId/metrics/var")
  @ApiOperation({
    summary: "Get Value at Risk (VaR) at a given confidence level",
  })
  @UseGuards(PortfolioOwnerGuard)
  async getValueAtRisk(
    @Param("portfolioId") portfolioId: string,
    @Query() dto: GetVaRDto,
  ) {
    const confidence = dto.confidence ?? 0.95;
    const var_ = await this.performanceService.calculateVaR(
      portfolioId,
      confidence,
    );
    return { portfolioId, confidence, valueAtRisk: var_ };
  }

  @Get("portfolios/:portfolioId/metrics/calmar")
  @ApiOperation({
    summary: "Get Calmar ratio (annualised return / max drawdown)",
  })
  @UseGuards(PortfolioOwnerGuard)
  async getCalmarRatio(@Param("portfolioId") portfolioId: string) {
    const calmarRatio =
      await this.performanceService.calculateCalmarRatio(portfolioId);
    return { portfolioId, calmarRatio };
  }

  @Post("portfolios/:portfolioId/metrics/snapshot")
  @ApiOperation({
    summary: "Record a performance snapshot for the portfolio",
  })
  @UseGuards(PortfolioOwnerGuard)
  async recordSnapshot(
    @Param("portfolioId") portfolioId: string,
    @Body() dto: RecordSnapshotDto,
  ) {
    return this.performanceService.recordMetrics(
      portfolioId,
      dto.portfolioValue,
      dto.allocation,
      dto.previousValue,
    );
  }

  @Get("portfolios/:portfolioId/metrics/roi")
  @ApiOperation({
    summary:
      "Get Return on Investment (ROI) relative to the invested cost basis",
  })
  @UseGuards(PortfolioOwnerGuard)
  async getROI(@Param("portfolioId") portfolioId: string) {
    const roi = await this.performanceService.calculateROI(portfolioId);
    return { portfolioId, roi };
  }

  @Get("portfolios/:portfolioId/metrics/drawdown")
  @ApiOperation({
    summary:
      "Get current drawdown relative to the all-time peak portfolio value",
  })
  @UseGuards(PortfolioOwnerGuard)
  async getCurrentDrawdown(@Param("portfolioId") portfolioId: string) {
    const currentDrawdown =
      await this.performanceService.calculateCurrentDrawdown(portfolioId);
    return { portfolioId, currentDrawdown };
  }

  @Get("portfolios/:portfolioId/metrics/periods")
  @ApiOperation({
    summary: "Get standard period returns (YTD, 1Y, 3Y, 5Y) for the portfolio",
  })
  @UseGuards(PortfolioOwnerGuard)
  async getPeriodReturns(@Param("portfolioId") portfolioId: string) {
    return this.performanceService.calculatePeriodReturns(portfolioId);
  }

  @Get("portfolios/:portfolioId/metrics/allocation")
  @ApiOperation({
    summary: "Get the current allocation breakdown (ticker → percentage)",
  })
  @UseGuards(PortfolioOwnerGuard)
  async getAllocationBreakdown(@Param("portfolioId") portfolioId: string) {
    return this.performanceService.getAllocationBreakdown(portfolioId);
  }

  // Backtesting Endpoints

  @Post("backtests")
  @ApiOperation({ summary: "Create and run backtest" })
  async createBacktest(@Request() req: any, @Body() dto: CreateBacktestDto) {
    return this.backtestService.createBacktest(req.user.id, dto);
  }

  @Get("backtests/:backtestId")
  @ApiOperation({ summary: "Get backtest result" })
  async getBacktest(@Param("backtestId") backtestId: string) {
    return this.backtestService.getBacktest(backtestId);
  }

  @Get("backtests")
  @ApiOperation({
    summary: "Get backtests for user",
  })
  async getUserBacktests(
    @Request() req: any,
    @Query("limit") limit: number = 10,
  ) {
    return this.backtestService.getUserBacktests(req.user.id, limit);
  }

  @Post("backtests/compare")
  @ApiOperation({
    summary: "Compare multiple backtests",
  })
  async compareBacktests(@Body() body: { backtestIds: string[] }) {
    return this.backtestService.compareBacktests(body.backtestIds);
  }

  // ML Prediction Endpoints

  @Post("predictions/train/:ticker")
  @ApiOperation({
    summary: "Train ML model for asset",
  })
  async trainPredictor(
    @Param("ticker") ticker: string,
    @Body() body: { historicalPrices: number[] },
  ) {
    return this.mlService.trainAssetPredictor(ticker, body.historicalPrices);
  }

  @Post("predictions/forecast/:ticker")
  @ApiOperation({
    summary: "Get ML price predictions for asset",
  })
  async predictAssetReturns(
    @Param("ticker") ticker: string,
    @Body()
    body: {
      currentPrice: number;
      historicalPrices: number[];
      daysAhead?: number;
    },
  ) {
    return this.mlService.predictAssetReturns(
      ticker,
      body.currentPrice,
      body.historicalPrices,
      body.daysAhead || 30,
    );
  }

  @Get("predictions/stats")
  @ApiOperation({
    summary: "Get ML predictor statistics",
  })
  async getPredictorStats() {
    return this.mlService.getPredictorStats();
  }

  // Transaction Tracking Endpoints

  @Post("portfolios/:portfolioId/transactions")
  @ApiOperation({ summary: "Record a new transaction" })
  @UseGuards(PortfolioOwnerGuard)
  async recordTransaction(
    @Request() req: any,
    @Param("portfolioId") portfolioId: string,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.tradingTransactionService.recordTransaction(
      portfolioId,
      req.user.id,
      dto,
    );
  }

  @Get("portfolios/:portfolioId/transactions")
  @ApiOperation({ summary: "Get transaction history with filtering" })
  @UseGuards(PortfolioOwnerGuard)
  async getTransactionHistory(
    @Request() req: any,
    @Param("portfolioId") portfolioId: string,
    @Query() filter: TransactionFilterDto,
  ) {
    return this.transactionHistoryService.getTransactionHistory(
      portfolioId,
      req.user.id,
      filter,
    );
  }

  @Get("portfolios/:portfolioId/transactions/:transactionId")
  @ApiOperation({ summary: "Get a single transaction" })
  @UseGuards(PortfolioOwnerGuard)
  async getTransaction(
    @Request() req: any,
    @Param("portfolioId") portfolioId: string,
    @Param("transactionId") transactionId: string,
  ) {
    return this.transactionHistoryService.getTransaction(
      transactionId,
      portfolioId,
      req.user.id,
    );
  }

  @Get("portfolios/:portfolioId/transactions/cost-basis/:ticker")
  @ApiOperation({ summary: "Calculate cost basis for a specific ticker" })
  @UseGuards(PortfolioOwnerGuard)
  async getCostBasis(
    @Request() req: any,
    @Param("portfolioId") portfolioId: string,
    @Param("ticker") ticker: string,
    @Query("asOfDate") asOfDate?: string,
  ) {
    return this.transactionHistoryService.calculateCostBasis(
      portfolioId,
      req.user.id,
      ticker,
      asOfDate ? new Date(asOfDate) : undefined,
    );
  }

  @Get("portfolios/:portfolioId/transactions/cost-basis")
  @ApiOperation({ summary: "Calculate cost basis for all holdings" })
  @UseGuards(PortfolioOwnerGuard)
  async getAllCostBasis(
    @Request() req: any,
    @Param("portfolioId") portfolioId: string,
  ) {
    return this.transactionHistoryService.calculateAllCostBasis(
      portfolioId,
      req.user.id,
    );
  }

  @Get("portfolios/:portfolioId/transactions/export/csv")
  @ApiOperation({ summary: "Export transactions as CSV" })
  @UseGuards(PortfolioOwnerGuard)
  async exportTransactionsCSV(
    @Request() req: any,
    @Param("portfolioId") portfolioId: string,
    @Query() filter: TransactionFilterDto,
    @Response() res: ExpressResponse,
  ) {
    const csv = await this.transactionHistoryService.exportTransactionsAsCSV(
      portfolioId,
      req.user.id,
      filter,
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="transactions-${portfolioId}-${Date.now()}.csv"`,
    );
    res.send(csv);
  }

  @Get("portfolios/:portfolioId/transactions/export/json")
  @ApiOperation({ summary: "Export transactions as JSON" })
  @UseGuards(PortfolioOwnerGuard)
  async exportTransactionsJSON(
    @Request() req: any,
    @Param("portfolioId") portfolioId: string,
    @Query() filter: TransactionFilterDto,
  ) {
    return this.transactionHistoryService.exportTransactionsAsJSON(
      portfolioId,
      req.user.id,
      filter,
    );
  }

  @Get("portfolios/:portfolioId/transactions/stats")
  @ApiOperation({ summary: "Get transaction statistics" })
  @UseGuards(PortfolioOwnerGuard)
  async getTransactionStats(
    @Request() req: any,
    @Param("portfolioId") portfolioId: string,
  ) {
    return this.transactionHistoryService.getTransactionStats(
      portfolioId,
      req.user.id,
    );
  }

  @Post("portfolios/:portfolioId/transactions/:transactionId/archive")
  @ApiOperation({ summary: "Archive a transaction" })
  @UseGuards(PortfolioOwnerGuard)
  async archiveTransaction(
    @Request() req: any,
    @Param("portfolioId") portfolioId: string,
    @Param("transactionId") transactionId: string,
  ) {
    await this.transactionHistoryService.archiveTransaction(
      transactionId,
      portfolioId,
      req.user.id,
    );
    return { message: "Transaction archived successfully" };
  }
}
