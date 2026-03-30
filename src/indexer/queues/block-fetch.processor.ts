import { Processor, Process, OnQueueFailed, InjectQueue } from "@nestjs/bull";
import { Logger, Injectable } from "@nestjs/common";
import { Job, Queue } from "bull";
import { ConfigService } from "@nestjs/config";
import { ethers } from "ethers";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { BlockRange, IndexerEvent } from "../interfaces/indexer.interface";
import { ShardManagerService } from "../services/shard-manager.service";
import { BlockCoordinatorService } from "../services/block-coordinator.service";

interface BlockFetchJob {
  range: BlockRange;
  instanceId: number;
  retryCount?: number;
}

interface ReorgCheckJob {
  blockNumber: number;
  expectedHash: string;
  instanceId: number;
}

@Injectable()
@Processor("indexer-blocks")
export class BlockFetchProcessor {
  private readonly logger = new Logger(BlockFetchProcessor.name);
  private readonly provider: ethers.Provider;
  private readonly confirmations: number;
  private readonly maxRetries = 3;
  private readonly batchSize = 500;

  constructor(
    private readonly configService: ConfigService,
    private readonly shardManager: ShardManagerService,
    private readonly blockCoordinator: BlockCoordinatorService,
    @InjectQueue("indexer-events")
    private readonly eventQueue: Queue,
    @InjectQueue("indexer-blocks")
    private readonly blockQueue: Queue,
    private readonly eventEmitter: EventEmitter2,
  ) {
    const rpcUrl =
      this.configService.get<string>("INDEXER_RPC_URL") ||
      this.configService.get<string>("RPC_URL") ||
      "http://localhost:8545";
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.confirmations = this.configService.get<number>(
      "INDEXER_CONFIRMATIONS",
      6,
    );
  }

  /**
   * Process a block range - fetch logs and queue for ingestion
   */
  @Process("fetch-range")
  async handleBlockRange(job: Job<BlockFetchJob>): Promise<{
    success: boolean;
    eventsFound: number;
    blocksProcessed: number;
  }> {
    const { range, instanceId, retryCount = 0 } = job.data;
    const startTime = Date.now();

    this.logger.log(
      `Instance ${instanceId} fetching blocks ${range.fromBlock}-${range.toBlock} (shard: ${range.shardId})`,
    );

    try {
      // Extend lock to prevent expiration during long processing
      await this.blockCoordinator.extendRangeLock(range, instanceId);

      const contractAddress = this.configService.get<string>(
        "INDEXER_CONTRACT_ADDRESS",
      );
      const topic0 = this.configService.get<string>("INDEXER_TOPIC0");

      const events: IndexerEvent[] = [];
      let currentFrom = range.fromBlock;

      // Fetch logs in smaller batches to avoid RPC limits
      while (currentFrom <= range.toBlock) {
        const currentTo = Math.min(
          currentFrom + this.batchSize - 1,
          range.toBlock,
        );

        const filter: ethers.Filter = {
          fromBlock: currentFrom,
          toBlock: currentTo,
        };

        if (contractAddress) filter.address = contractAddress;
        if (topic0) filter.topics = [topic0];

        try {
          const logs = await this.provider.getLogs(filter);

          for (const log of logs) {
            const block = await this.provider.getBlock(Number(log.blockNumber));

            const event: IndexerEvent = {
              blockNumber: String(Number(log.blockNumber)),
              blockHash: block ? block.hash : log.blockHash,
              txHash: log.transactionHash,
              logIndex: Number(log.index),
              address: log.address,
              topic0:
                log.topics && log.topics.length > 0
                  ? String(log.topics[0])
                  : undefined,
              data: log.data,
              topics: log.topics,
              shardId: range.shardId,
            };

            events.push(event);
          }
        } catch (error) {
          this.logger.error(
            `Failed to fetch logs for blocks ${currentFrom}-${currentTo}: ${error.message}`,
          );
          throw error;
        }

        // Update progress and extend lock periodically
        if ((currentTo - range.fromBlock) % 5000 === 0) {
          await this.blockCoordinator.extendRangeLock(range, instanceId);
          this.logger.debug(`Progress: ${currentTo}/${range.toBlock} blocks`);
        }

        currentFrom = currentTo + 1;
      }

      // Queue events for ingestion in batches
      if (events.length > 0) {
        await this.queueEventsForIngestion(events, range);
      }

      // Mark range as complete
      await this.blockCoordinator.markRangeComplete(range);

      const duration = Date.now() - startTime;
      this.logger.log(
        `Range ${range.fromBlock}-${range.toBlock} completed: ${events.length} events in ${duration}ms`,
      );

      // Emit metrics
      this.eventEmitter.emit("indexer.range.completed", {
        instanceId,
        shardId: range.shardId,
        fromBlock: range.fromBlock,
        toBlock: range.toBlock,
        eventsFound: events.length,
        duration,
      });

      return {
        success: true,
        eventsFound: events.length,
        blocksProcessed: range.toBlock - range.fromBlock + 1,
      };
    } catch (error) {
      this.logger.error(
        `Failed to process range ${range.fromBlock}-${range.toBlock}: ${error.message}`,
      );

      // Handle retry logic
      if (retryCount < this.maxRetries) {
        const delay = Math.pow(2, retryCount) * 5000; // 5s, 10s, 20s
        await this.blockQueue.add(
          "fetch-range",
          {
            range,
            instanceId,
            retryCount: retryCount + 1,
          },
          { delay },
        );
        this.logger.warn(
          `Re-queued range with ${delay}ms delay (retry ${retryCount + 1})`,
        );
      } else {
        // Release the range so another instance can try
        await this.blockCoordinator.releaseBlockRange(range);
        throw error;
      }

      return {
        success: false,
        eventsFound: 0,
        blocksProcessed: 0,
      };
    }
  }

  /**
   * Check for chain reorganization
   */
  @Process("check-reorg")
  async handleReorgCheck(job: Job<ReorgCheckJob>): Promise<{
    hasReorg: boolean;
    reorgBlock: number | null;
  }> {
    const { blockNumber, expectedHash, instanceId } = job.data;

    try {
      const block = await this.provider.getBlock(blockNumber);

      if (!block) {
        this.logger.warn(`Block ${blockNumber} not found during reorg check`);
        return { hasReorg: true, reorgBlock: blockNumber };
      }

      if (block.hash !== expectedHash) {
        this.logger.warn(
          `Reorg detected at block ${blockNumber}: expected ${expectedHash}, got ${block.hash}`,
        );

        // Emit reorg event
        this.eventEmitter.emit("indexer.reorg.detected", {
          blockNumber,
          expectedHash,
          actualHash: block.hash,
          instanceId,
        });

        return { hasReorg: true, reorgBlock: blockNumber };
      }

      return { hasReorg: false, reorgBlock: null };
    } catch (error) {
      this.logger.error(
        `Reorg check failed for block ${blockNumber}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Queue events for ingestion in optimally sized batches
   */
  private async queueEventsForIngestion(
    events: IndexerEvent[],
    range: BlockRange,
  ): Promise<void> {
    const batchSize = 100; // Optimal batch size for database inserts

    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);

      await this.eventQueue.add("batch-ingest", {
        events: batch,
        shardId: range.shardId,
        blockRange: {
          fromBlock: range.fromBlock,
          toBlock: range.toBlock,
        },
      });
    }

    this.logger.debug(
      `Queued ${events.length} events for ingestion in ${Math.ceil(events.length / batchSize)} batches`,
    );
  }

  /**
   * Handle job failure
   */
  @OnQueueFailed()
  async onFailed(job: Job<BlockFetchJob | ReorgCheckJob>, error: Error) {
    this.logger.error(
      `Block processor job ${job.id} (${job.name}) failed: ${error.message}`,
      error.stack,
    );

    this.eventEmitter.emit("indexer.block.failed", {
      jobId: job.id,
      jobName: job.name,
      error: error.message,
      data: job.data,
    });
  }
}
