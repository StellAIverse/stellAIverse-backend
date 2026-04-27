import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { GovernanceProposal } from './entities/governance-proposal.entity';
import { GovernanceService } from './governance.service';
import { GovernanceController } from './governance.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([GovernanceProposal]),
    ScheduleModule.forRoot(),
  ],
  providers: [GovernanceService],
  controllers: [GovernanceController],
  exports: [GovernanceService],
})
export class GovernanceModule {}
