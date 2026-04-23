import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventSchedulerService } from './event-scheduler.service';
import { SchedulingController } from './scheduling.controller';
import { TimeBasedEvent } from './entities/time-based-event.entity';
import { EventParticipation } from './entities/event-participation.entity';
import { RewardEngineModule } from '../reward-engine/reward-engine.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TimeBasedEvent, EventParticipation]),
    ScheduleModule.forRoot(),
    RewardEngineModule,
  ],
  controllers: [SchedulingController],
  providers: [EventSchedulerService],
  exports: [EventSchedulerService],
})
export class SchedulingModule {}