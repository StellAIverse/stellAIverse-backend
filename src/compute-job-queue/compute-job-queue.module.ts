import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';
import { ComputeJobProcessor } from './processors/compute-job.processor';
import { QueueHealthIndicator } from './health/queue-health.indicator';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
          db: configService.get('REDIS_DB', 0),
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: {
            age: 3600, // Keep completed jobs for 1 hour
            count: 100, // Keep last 100 completed jobs
          },
          removeOnFail: false, // Keep failed jobs for analysis
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      {
        name: 'compute-jobs',
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      },
      {
        name: 'dead-letter-queue',
        defaultJobOptions: {
          attempts: 1, // Dead letter queue doesn't retry
          removeOnComplete: false,
          removeOnFail: false,
        },
      },
    ),
  ],
  providers: [QueueService, ComputeJobProcessor, QueueHealthIndicator],
  exports: [QueueService, BullModule],
})
export class QueueModule {}