import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { RewardAnalyticsService } from './reward-analytics.service';
import { ReportingService } from './reporting.service';
import { RewardAdminController } from './reward-admin.controller';
import { ReportingController } from './reporting.controller';
import { RewardCalculation } from '../reward-engine/entities/reward-calculation.entity';
import { ReferralReward } from '../referral/reward.entity';
import { TimeBasedEvent } from '../scheduling/entities/time-based-event.entity';
import { EventParticipation } from '../scheduling/entities/event-participation.entity';
import { WaitlistAdminController } from './waitlist-admin.controller';
import { WaitlistModule } from '../waitlist/waitlist.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RewardCalculation,
      ReferralReward,
      TimeBasedEvent,
      EventParticipation,
    ]),
    ScheduleModule.forRoot(),
    WaitlistModule,
  ],
  controllers: [RewardAdminController, ReportingController, WaitlistAdminController],
  providers: [RewardAnalyticsService, ReportingService],
  exports: [RewardAnalyticsService, ReportingService],
})
export class AdminModule {}