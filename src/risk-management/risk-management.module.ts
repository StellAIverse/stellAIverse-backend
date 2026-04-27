import { Module } from "@nestjs/common";
import { RiskManagementService } from "./risk-management.service";
import { RiskManagementController } from "./risk-management.controller";

@Module({
  controllers: [RiskManagementController],
  providers: [RiskManagementService],
  exports: [RiskManagementService],
})
export class RiskManagementModule {}
