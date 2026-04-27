import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bull";

// Entities
import { Portfolio } from "./entities/portfolio.entity";
import { PortfolioAsset } from "./entities/portfolio-asset.entity";
import { RiskProfile } from "./entities/risk-profile.entity";
import { OptimizationHistory } from "./entities/optimization-history.entity";
import { RebalancingEvent } from "./entities/rebalancing-event.entity";
import { PerformanceMetric } from "./entities/performance-metric.entity";
import { BacktestResult } from "./entities/backtest-result.entity";

// Services
import { PortfolioService } from "./services/portfolio.service";
import { RebalancingService } from "./services/rebalancing.service";
import { PerformanceAnalyticsService } from "./services/performance-analytics.service";
import { BacktestingService } from "./services/backtesting.service";
import { MLPredictionService } from "./services/ml-prediction.service";

// Controllers
import { PortfolioController } from "./portfolio.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Portfolio,
      PortfolioAsset,
      RiskProfile,
      OptimizationHistory,
      RebalancingEvent,
      PerformanceMetric,
      BacktestResult,
    ]),
    BullModule.registerQueue(
      {
        name: "portfolio-optimization",
      },
      {
        name: "rebalancing",
      },
      {
        name: "performance-analytics",
      },
      {
        name: "backtesting",
      },
      {
        name: "ml-predictions",
      },
    ),
  ],
  providers: [
    PortfolioService,
    RebalancingService,
    PerformanceAnalyticsService,
    BacktestingService,
    MLPredictionService,
  ],
  controllers: [PortfolioController],
  exports: [
    PortfolioService,
    RebalancingService,
    PerformanceAnalyticsService,
    BacktestingService,
    MLPredictionService,
  ],
})
export class PortfolioModule {}
