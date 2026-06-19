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
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "src/auth/jwt.guard";
import { PortfolioService } from "./services/portfolio.service";
import { RebalancingService } from "./services/rebalancing.service";
import { PerformanceAnalyticsService } from "./services/performance-analytics.service";
import { BacktestingService } from "./services/backtesting.service";
import { MLPredictionService } from "./services/ml-prediction.service";
import { PortfolioOwnerGuard } from "src/common/guard/portfolio-owner.guard";
import {
  CreatePortfolioDto,
  UpdatePortfolioDto,
  QueryPortfolioDto,
} from "./dto/portfolio.dto";
import { AddAssetToPortfolioDto } from "./dto/portfolio-asset.dto";
import {
  ApproveOptimizationDto,
  CreateOptimizationDto,
} from "./dto/optimization.dto";
import {
  ExecuteRebalancingDto,
  TriggerRebalancingDto,
} from "./dto/rebalancing.dto";
import {
  GetPerformanceMetricsDto,
  GetPerformanceByPeriodDto,
  GetBenchmarkComparisonDto,
  RecordSnapshotDto,
  GetVaRDto,
} from "./dto/performance.dto";
import { CreateBacktestDto } from "./dto/backtest.dto";

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

  // Asset Management Endpoints

  @Post("portfolios/:portfolioId/assets")
  @ApiOperation({ summary: "Add asset to portfolio" })
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
    );
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
    const needed =
      await this.rebalancingService.checkRebalancingNeeded(portfolioId);
    const drift =
      await this.rebalancingService.calculateAllocationDrift(portfolioId);

    return {
      needsRebalancing: needed,
      allocationDrift: drift,
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
    );
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
}
