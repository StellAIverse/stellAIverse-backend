import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MulterModule } from "@nestjs/platform-express";
import { ComplianceController } from "./compliance.controller";
import { ComplianceService } from "./compliance.service";
import { KycStatusTransitionService } from "./kyc-status-transition.service";
import { KycService } from "./kyc.service";
import { KycProfile, KycDocument, KycStatusHistory } from "./entities/kyc.entity";
import { AuditModule } from "../audit/audit.module";
import { RiskManagementModule } from "../risk-management/risk-management.module";
import { RolesGuard } from "../common/rbac/roles.guard";
import { NotificationModule } from "../notification/notification.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([KycProfile, KycDocument, KycStatusHistory]),
    MulterModule.register({
      dest: "./uploads/kyc",
    }),
    AuditModule,
    RiskManagementModule,
    NotificationModule,
  ],
  controllers: [ComplianceController],
  providers: [ComplianceService, RolesGuard, KycService, KycStatusTransitionService],
  exports: [ComplianceService, KycService],
})
export class ComplianceModule {}
