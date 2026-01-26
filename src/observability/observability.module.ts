import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { MetricsController } from "./metrics.controller";
import { ObservabilityMiddleware } from "./observability.middleware";

@Module({
  controllers: [MetricsController],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ObservabilityMiddleware).forRoutes("*");
  }
}
