import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AgentEvent } from "./entities/agent-event.entity";
import { OracleSubmission } from "./entities/oracle-submission.entity";
import { ComputeResult } from "./entities/compute-result.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentEvent, OracleSubmission, ComputeResult]),
  ],
  exports: [TypeOrmModule],
})
export class AuditModule {}
