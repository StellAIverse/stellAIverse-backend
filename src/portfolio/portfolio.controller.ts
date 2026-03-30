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
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { PortfolioService } from "../services/portfolio.service";
import { RebalancingService } from "../services/rebalancing.service";
import { PerformanceAnalyticsService } from "../services/performance-analytics.service";
import { BacktestingService } from "../services/backtesting.service";
import { MLPredictionService } from "../services/ml-prediction.service";
import { CreatePortfolioDto, UpdatePortfolioDto } from "../dto/portfolio.dto";
import {
  CreateOptimizationDto,
  ApproveOptimizationDto,
} from "../dto/optimization.dto";
import {
  TriggerRebalancingDto,
  ApproveRebalancingDto,
  ExecuteRebalancingDto,
} from "../dto/rebalancing.dto";
import {
  AddAssetToPortfolioDto,
  UpdatePortfolioAssetDto,
} from "../dto/portfolio-asset.dto";
import { CreateBacktestDto } from "../dto/backtest.dto";
import { GetPerformanceMetricsDto } from "../dto/performance.dto";

@Controller("portfolio")
@ApiTags("Portfolio Optimization")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
  @ApiOperation({ summary: "Get all portfolios for user" })
  async getUserPortfolios(@Request() req: any) {
    return this.portfolioService.getUserPortfolios(req.user.id);
  }

  @Get("portfolios/:id")
  @ApiOperation({ summary: "Get portfolio details" })
  async getPortfolio(@Param("id") portfolioId: string) {
    return this.portfolioService.getPortfolio(portfolioId);
  }

  @Put("portfolios/:id")
  @ApiOperation({ summary: "Update portfolio" })
  async updatePortfolio(
    @Param("id") portfolioId: string,
    @Body() dto: UpdatePortfolioDto,
  ) {
    return this.portfolioService.updatePortfolio(portfolioId, dto);
  }

  @Delete("portfolios/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete portfolio" })
  async deletePortfolio(@Param("id") portfolioId: string) {
    return this.portfolioService.deletePortfolio(portfolioId);
  }

  // Asset Management Endpoints

  @Post("portfolios/:portfolioId/assets")
  @ApiOperation({ summary: "Add asset to portfolio" })
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
  async getAllocationDrift(@Param("portfolioId") portfolioId: string) {
    return this.rebalancingService.calculateAllocationDrift(portfolioId);
  }

  // Performance Analytics Endpoints

  @Get("portfolios/:portfolioId/performance-summary")
  @ApiOperation({
    summary: "Get portfolio performance summary",
  })
  async getPerformanceSummary(@Param("portfolioId") portfolioId: string) {
    return this.performanceService.getPerformanceSummary(portfolioId);
  }

  @Get("portfolios/:portfolioId/metrics")
  @ApiOperation({
    summary: "Get performance metrics for date range",
  })
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
