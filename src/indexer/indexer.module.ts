import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bull";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";

// Legacy service (kept for backward compatibility)
import { IndexerService } from "./indexer.service";

// New scalable indexer components
import { ScalableIndexerService } from "./scalable-indexer.service";
import { IndexerController } from "./indexer.controller";

// Services
import { ShardManagerService } from "./services/shard-manager.service";
import { BlockCoordinatorService } from "./services/block-coordinator.service";
import { IndexerMetricsService } from "./services/indexer-metrics.service";

// Queue components
import { IndexerQueueService } from "./queues/indexer-queue.service";
import { EventIngestionProcessor } from "./queues/event-ingestion.processor";
import { BlockFetchProcessor } from "./queues/block-fetch.processor";

// Entities
import { IndexedEvent } from "./entities/indexed-event.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([IndexedEvent]),
    ConfigModule,
    EventEmitterModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get("REDIS_HOST", "localhost"),
          port: configService.get("REDIS_PORT", 6379),
          password: configService.get("REDIS_PASSWORD"),
          db: configService.get("REDIS_DB", 0),
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
          removeOnComplete: {
            age: 3600,
            count: 1000,
          },
          removeOnFail: false,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      {
        name: "indexer-blocks",
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
        },
      },
      {
        name: "indexer-events",
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
        },
      },
      {
        name: "indexer-dead-letter",
        defaultJobOptions: {
          attempts: 1,
          removeOnComplete: false,
          removeOnFail: false,
        },
      },
    ),
  ],
  controllers: [IndexerController],
  providers: [
    // Legacy service
    IndexerService,

    // New scalable indexer services
    ScalableIndexerService,
    ShardManagerService,
    BlockCoordinatorService,
    IndexerMetricsService,
    IndexerQueueService,

    // Queue processors
    EventIngestionProcessor,
    BlockFetchProcessor,
  ],
  exports: [
    IndexerService,
    ScalableIndexerService,
    ShardManagerService,
    BlockCoordinatorService,
    IndexerQueueService,
    IndexerMetricsService,
  ],
})
export class IndexerModule {}
