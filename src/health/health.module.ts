import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HttpModule } from "@nestjs/axios";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { DatabaseHealthIndicator } from "./indicators/database.health-indicator";
import { QueueHealthIndicator } from "./indicators/queue.health-indicator";
import { OpenAIProviderHealthIndicator } from "./indicators/openai-provider.health-indicator";
import { QueueModule } from "../compute-job-queue/compute-job-queue.module";
import { ComputeModule } from "../compute/compute.module";

@Module({
  imports: [
    TerminusModule,
    HttpModule,
    TypeOrmModule,
    QueueModule,
    ComputeModule,
  ],
  controllers: [HealthController],
  providers: [
    HealthService,
    DatabaseHealthIndicator,
    QueueHealthIndicator,
    OpenAIProviderHealthIndicator,
  ],
  exports: [HealthService],
})
export class HealthModule {}
