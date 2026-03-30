import {
  Processor,
  Process,
  OnQueueFailed,
  OnQueueCompleted,
  InjectQueue,
} from "@nestjs/bull";
import { Logger, Injectable } from "@nestjs/common";
import { Job, Queue } from "bull";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { IndexedEvent } from "../entities/indexed-event.entity";
import { IndexerEvent, IngestionResult } from "../interfaces/indexer.interface";
import { EventEmitter2 } from "@nestjs/event-emitter";

interface EventBatchJob {
  events: IndexerEvent[];
  shardId: string;
  blockRange: {
    fromBlock: number;
    toBlock: number;
  };
  retryCount?: number;
}

interface SingleEventJob {
  event: IndexerEvent;
  shardId: string;
  retryCount?: number;
}

@Injectable()
@Processor("indexer-events")
export class EventIngestionProcessor {
  private readonly logger = new Logger(EventIngestionProcessor.name);
  private readonly maxRetries = 3;
  private readonly batchSize = 100;

  constructor(
    @InjectRepository(IndexedEvent)
    private readonly indexedRepo: Repository<IndexedEvent>,
    @InjectQueue("indexer-events")
    private readonly eventQueue: Queue,
    @InjectQueue("indexer-dead-letter")
    private readonly deadLetterQueue: Queue,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Process a batch of events
   */
  @Process("batch-ingest")
  async handleBatchIngest(job: Job<EventBatchJob>): Promise<IngestionResult> {
    const { events, shardId, blockRange } = job.data;
    const startTime = Date.now();

    this.logger.log(
      `Processing batch of ${events.length} events for shard ${shardId}, blocks ${blockRange.fromBlock}-${blockRange.toBlock}`,
    );

    const result: IngestionResult = {
      success: true,
      eventsProcessed: 0,
      eventsFailed: 0,
      errors: [],
    };

    // Process events in smaller sub-batches for better error isolation
    for (let i = 0; i < events.length; i += this.batchSize) {
      const subBatch = events.slice(i, i + this.batchSize);

      try {
        await this.processSubBatch(subBatch, shardId);
        result.eventsProcessed += subBatch.length;
      } catch (error) {
        this.logger.error(
          `Failed to process sub-batch ${i / this.batchSize + 1}: ${error.message}`,
        );

        // Try individual processing for failed sub-batch
        for (const event of subBatch) {
          try {
            await this.processSingleEvent(event, shardId);
            result.eventsProcessed++;
          } catch (singleError) {
            result.eventsFailed++;
            result.errors.push(
              `Event ${event.txHash}-${event.logIndex}: ${singleError.message}`,
            );

            // Send to dead letter queue if max retries reached
            if ((job.data.retryCount || 0) >= this.maxRetries) {
              await this.sendToDeadLetter(event, shardId, singleError.message);
            } else {
              // Re-queue for retry
              await this.requeueEvent(
                event,
                shardId,
                (job.data.retryCount || 0) + 1,
              );
            }
          }
        }
      }
    }

    const duration = Date.now() - startTime;
    this.logger.log(
      `Batch processing completed: ${result.eventsProcessed} succeeded, ${result.eventsFailed} failed in ${duration}ms`,
    );

    // Emit metrics
    this.eventEmitter.emit("indexer.batch.completed", {
      shardId,
      blockRange,
      eventsProcessed: result.eventsProcessed,
      eventsFailed: result.eventsFailed,
      duration,
    });

    // If all events failed, mark job as failed
    if (result.eventsFailed === events.length && events.length > 0) {
      result.success = false;
      throw new Error(`All ${events.length} events in batch failed to process`);
    }

    return result;
  }

  /**
   * Process a single event (for retry scenarios)
   */
  @Process("single-ingest")
  async handleSingleIngest(job: Job<SingleEventJob>): Promise<IngestionResult> {
    const { event, shardId, retryCount = 0 } = job.data;

    this.logger.debug(
      `Processing single event ${event.txHash}-${event.logIndex}`,
    );

    try {
      await this.processSingleEvent(event, shardId);

      this.eventEmitter.emit("indexer.event.completed", {
        txHash: event.txHash,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
      });

      return {
        success: true,
        eventsProcessed: 1,
        eventsFailed: 0,
      };
    } catch (error) {
      this.logger.error(
        `Failed to process event ${event.txHash}-${event.logIndex}: ${error.message}`,
      );

      if (retryCount >= this.maxRetries) {
        await this.sendToDeadLetter(event, shardId, error.message);
      } else {
        await this.requeueEvent(event, shardId, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Process a sub-batch of events using bulk insert
   */
  private async processSubBatch(
    events: IndexerEvent[],
    shardId: string,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const entities = events.map((event) =>
        this.indexedRepo.create({
          blockNumber: event.blockNumber,
          blockHash: event.blockHash,
          txHash: event.txHash,
          logIndex: event.logIndex,
          address: event.address,
          topic0: event.topic0,
          data: event.data,
          topics: event.topics,
          processedAt: new Date(),
        }),
      );

      // Use bulk insert with ON CONFLICT DO NOTHING for upsert behavior
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(IndexedEvent)
        .values(entities)
        .orIgnore()
        .execute();

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Process a single event
   */
  private async processSingleEvent(
    event: IndexerEvent,
    shardId: string,
  ): Promise<void> {
    const entity = this.indexedRepo.create({
      blockNumber: event.blockNumber,
      blockHash: event.blockHash,
      txHash: event.txHash,
      logIndex: event.logIndex,
      address: event.address,
      topic0: event.topic0,
      data: event.data,
      topics: event.topics,
      processedAt: new Date(),
    });

    try {
      await this.indexedRepo.insert(entity);
    } catch (error) {
      // Handle duplicate key errors gracefully
      if (error.code === "23505") {
        // PostgreSQL unique violation
        this.logger.debug(
          `Duplicate event ${event.txHash}-${event.logIndex}, skipping`,
        );
        return;
      }
      throw error;
    }
  }

  /**
   * Re-queue an event for retry with exponential backoff
   */
  private async requeueEvent(
    event: IndexerEvent,
    shardId: string,
    retryCount: number,
  ): Promise<void> {
    const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 2s, 4s, 8s

    await this.eventQueue.add(
      "single-ingest",
      {
        event,
        shardId,
        retryCount,
      },
      {
        delay,
        attempts: 1, // We handle retries manually
      },
    );

    this.logger.debug(
      `Re-queued event ${event.txHash}-${event.logIndex} with ${delay}ms delay`,
    );
  }

  /**
   * Send failed event to dead letter queue
   */
  private async sendToDeadLetter(
    event: IndexerEvent,
    shardId: string,
    errorMessage: string,
  ): Promise<void> {
    await this.deadLetterQueue.add("failed-event", {
      event,
      shardId,
      errorMessage,
      failedAt: new Date().toISOString(),
      retryCount: this.maxRetries,
    });

    this.eventEmitter.emit("indexer.event.failed", {
      txHash: event.txHash,
      logIndex: event.logIndex,
      blockNumber: event.blockNumber,
      error: errorMessage,
    });

    this.logger.warn(
      `Sent event ${event.txHash}-${event.logIndex} to dead letter queue`,
    );
  }

  /**
   * Handle job completion
   */
  @OnQueueCompleted()
  async onCompleted(
    job: Job<EventBatchJob | SingleEventJob>,
    result: IngestionResult,
  ) {
    this.logger.debug(`Job ${job.id} completed: ${JSON.stringify(result)}`);
  }

  /**
   * Handle job failure
   */
  @OnQueueFailed()
  async onFailed(job: Job<EventBatchJob | SingleEventJob>, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);

    // Emit failure event for monitoring
    this.eventEmitter.emit("indexer.job.failed", {
      jobId: job.id,
      jobName: job.name,
      error: error.message,
      data: job.data,
    });
  }
}
