import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MetricsController } from "./metrics.controller";
import { AnalyticsDashboardController } from "./analytics-dashboard.controller";
import { ObservabilityMiddleware } from "./observability.middleware";
import { MetricsService } from "./metrics.service";
import { AnalyticsDashboardService } from "./analytics-dashboard.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([]), // Add entities as needed
  ],
  controllers: [MetricsController, AnalyticsDashboardController],
  providers: [MetricsService, AnalyticsDashboardService],
  exports: [MetricsService, AnalyticsDashboardService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ObservabilityMiddleware)
      .exclude("metrics", "admin/analytics") // ❗ avoid self-instrumentation noise
      .forRoutes("*");
  }
}
