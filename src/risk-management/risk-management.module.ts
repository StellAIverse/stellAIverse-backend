import { Module } from "@nestjs/common";
import { RiskManagementService } from "./risk-management.service";
import { RiskManagementController } from "./risk-management.controller";
import { CircuitBreakerService } from "./circuit-breaker.service";
import { AlertsModule } from "../alerts/alerts.module";
import { AlertPublisherService } from "../alerts/alert-publisher.service";

@Module({
  imports: [AlertsModule],
  controllers: [RiskManagementController],
  providers: [RiskManagementService, CircuitBreakerService],
  exports: [RiskManagementService, CircuitBreakerService],
})
export class RiskManagementModule {}
