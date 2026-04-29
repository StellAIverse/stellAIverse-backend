import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ComplianceController } from "./compliance.controller";
import { ComplianceService } from "./compliance.service";
import { KycProfile, KycDocument, KycStatusHistory } from "./entities/kyc.entity";
import { AuditModule } from "../audit/audit.module";
import { RiskManagementModule } from "../risk-management/risk-management.module";
import { RolesGuard } from "../common/rbac/roles.guard";
import { NotificationModule } from "../notification/notification.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([KycProfile, KycDocument, KycStatusHistory]),
    AuditModule,
    RiskManagementModule,
    NotificationModule,
  ],
  controllers: [ComplianceController],
  providers: [ComplianceService, RolesGuard],
  exports: [ComplianceService],
})
export class ComplianceModule {}
