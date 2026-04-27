import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MetricsController } from "./metrics.controller";
import { AnalyticsDashboardController } from "./analytics-dashboard.controller";
import { ObservabilityMiddleware } from "./observability.middleware";
import { MetricsService } from "./metrics.service";
import { AnalyticsDashboardService } from "./analytics-dashboard.service";
import { RewardAnalyticsService } from "./reward-analytics.service";
import { QuotaModule } from "../quota/quota.module";

@Module({
  imports: [
    QuotaModule,
    TypeOrmModule.forFeature([]), // Add entities as needed
  ],
  controllers: [MetricsController, AnalyticsDashboardController],
  providers: [MetricsService, AnalyticsDashboardService, RewardAnalyticsService],
  exports: [MetricsService, AnalyticsDashboardService, RewardAnalyticsService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ObservabilityMiddleware)
      .exclude("metrics", "admin/analytics") // ❗ avoid self-instrumentation noise
      .forRoutes("*");
  }
}
