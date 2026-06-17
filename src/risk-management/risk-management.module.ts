import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { RiskManagementService } from "./risk-management.service";
import { RiskManagementController } from "./risk-management.controller";
import { CircuitBreakerService } from "./circuit-breaker.service";
import { RiskManagementHealthIndicator } from "./health/risk-management.health";

@Module({
  imports: [EventEmitterModule.forRoot()],
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
