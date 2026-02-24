import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AgentEvent } from './entities/agent-event.entity';
import { OracleSubmission } from './entities/oracle-submission.entity';
import { ComputeResult } from './entities/compute-result.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentEvent, OracleSubmission, ComputeResult]),
  ],
  providers: [AuditService],
  exports: [AuditService, TypeOrmModule],
})
export class AuditModule {}