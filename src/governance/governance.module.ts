import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { GovernanceProposal } from './entities/governance-proposal.entity';
import { GovernanceService } from './governance.service';
import { GovernanceController } from './governance.controller';
import { RolesGuard } from '../common/rbac/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([GovernanceProposal]),
    ScheduleModule.forRoot(),
  ],
  providers: [GovernanceService, RolesGuard],
  controllers: [GovernanceController],
  exports: [GovernanceService],
})
export class GovernanceModule {}
