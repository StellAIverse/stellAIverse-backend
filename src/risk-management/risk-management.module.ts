import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { RiskManagementService } from "./risk-management.service";
import { RiskManagementController } from "./risk-management.controller";
import { CircuitBreakerService } from "./circuit-breaker.service";
import { AlertsModule } from "../alerts/alerts.module";
import { AlertPublisherService } from "../alerts/alert-publisher.service";
import { RiskManagementHealthIndicator } from "./risk-management.health-indicator";

@Module({
  imports: [AlertsModule],
  controllers: [RiskManagementController],
  providers: [
    RiskManagementService,
    CircuitBreakerService,
    RiskManagementHealthIndicator,
  ],
  exports: [
    RiskManagementService,
    CircuitBreakerService,
    RiskManagementHealthIndicator,
  ],
})
export class RiskManagementModule {}
