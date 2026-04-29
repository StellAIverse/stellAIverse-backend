import { Module } from "@nestjs/common";
import { RiskManagementService } from "./risk-management.service";
import { RiskManagementController } from "./risk-management.controller";
import { CircuitBreakerService } from "./circuit-breaker.service";

@Module({
  controllers: [RiskManagementController],
  providers: [RiskManagementService, CircuitBreakerService],
  exports: [RiskManagementService, CircuitBreakerService],
})
export class RiskManagementModule {}
