import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AgentEvent } from "./entities/agent-event.entity";
import { OracleSubmission } from "./entities/oracle-submission.entity";
import { ComputeResult } from "./entities/compute-result.entity";
import { ProvenanceRecord } from "./entities/provenance-record.entity";
import { ProvenanceService } from "./provenance.service";
import { ProvenanceController } from "./provenance.controller";
import { AuditLogService } from "./audit-log.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgentEvent,
      OracleSubmission,
      ComputeResult,
      ProvenanceRecord,
    ]),
  ],
  controllers: [ProvenanceController],
  providers: [ProvenanceService, AuditLogService],
  exports: [TypeOrmModule, ProvenanceService, AuditLogService],
})
export class AuditModule {}
