import { Module } from "@nestjs/common";
import { ComplianceController } from "./compliance.controller";
import { ComplianceService } from "./compliance.service";
import { AuditModule } from "../audit/audit.module";
import { RiskManagementModule } from "../risk-management/risk-management.module";

@Module({
  imports: [AuditModule, RiskManagementModule],
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
