import { Module } from "@nestjs/common";
import { ComplianceController } from "./compliance.controller";
import { ComplianceService } from "./compliance.service";
import { KycStatusTransitionService } from "./kyc-status-transition.service";
import { AuditModule } from "../audit/audit.module";
import { RiskManagementModule } from "../risk-management/risk-management.module";
import { RolesGuard } from "../common/rbac/roles.guard";

@Module({
  imports: [AuditModule, RiskManagementModule],
  controllers: [ComplianceController],
  providers: [ComplianceService, RolesGuard, KycStatusTransitionService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
