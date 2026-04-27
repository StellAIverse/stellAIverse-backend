import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ethers } from "ethers";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { IndexedEvent } from "./entities/indexed-event.entity";
import { ShardManagerService } from "./services/shard-manager.service";
import { BlockCoordinatorService } from "./services/block-coordinator.service";
import { IndexerQueueService } from "./queues/indexer-queue.service";
import { IndexerMetricsService } from "./services/indexer-metrics.service";
import {
  BlockRange,
  ReorgDetectionResult,
} from "./interfaces/indexer.interface";
import { IndexerHealthDto } from "./dto/indexer-job.dto";

@Injectable()
export class ScalableIndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScalableIndexerService.name);
  private readonly provider: ethers.Provider;
  private readonly instanceId: number;
  private readonly confirmations: number;
  private readonly startBlock: number;
  private readonly pollIntervalMs: number;
  private readonly isCoordinator: boolean;
  private readonly rangeSize: number;

  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private assignedRanges: BlockRange[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly shardManager: ShardManagerService,
    private readonly blockCoordinator: BlockCoordinatorService,
    private readonly queueService: IndexerQueueService,
    private readonly metricsService: IndexerMetricsService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(IndexedEvent)
    private readonly indexedRepo: Repository<IndexedEvent>,
  ) {
    // Initialize provider
    const rpcUrl =
      this.configService.get<string>("INDEXER_RPC_URL") ||
      this.configService.get<string>("RPC_URL") ||
      "http://localhost:8545";
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    // Configuration
    this.instanceId = this.configService.get<number>("INDEXER_INSTANCE_ID", 1);
    this.confirmations = this.configService.get<number>(
      "INDEXER_CONFIRMATIONS",
      6,
    );
    this.startBlock = this.configService.get<number>("INDEXER_START_BLOCK", 0);
    this.pollIntervalMs = this.configService.get<number>(
      "INDEXER_POLL_INTERVAL_MS",
      10000,
    );
    this.isCoordinator = this.configService.get<boolean>(
      "INDEXER_IS_COORDINATOR",
      false,
    );
    this.rangeSize = this.configService.get<number>("INDEXER_RANGE_SIZE", 1000);
  }

  async onModuleInit() {
    this.logger.log(
      `Initializing scalable indexer instance ${this.instanceId}`,
    );

    // Register this instance
    await this.shardManager.registerInstance(
      this.instanceId,
      "localhost",
      this.configService.get<number>("PORT", 3000),
    );

    // Initialize sharding if coordinator
    if (this.isCoordinator) {
      await this.initializeCoordinator();
    }

    // Start processing
    await this.start();

    // Start heartbeat
    this.startHeartbeat();

    // Start cleanup task
    this.startCleanupTask();

    this.logger.log(
      `Indexer instance ${this.instanceId} initialized and running`,
    );
  }

  async onModuleDestroy() {
    this.logger.log(`Shutting down indexer instance ${this.instanceId}`);
    await this.stop();

    // Release assigned shards
    const shards = await this.shardManager.getInstanceShards(this.instanceId);
    for (const shardId of shards) {
      await this.shardManager.releaseShard(shardId);
    }
  }

  /**
   * Initialize coordinator-specific tasks
   */
  private async initializeCoordinator(): Promise<void> {
    this.logger.log("Running as coordinator instance");

    // Get current block to initialize ranges
    const currentBlock = await this.getSafeBlockNumber();

    // Initialize shards
    await this.shardManager.initializeShards(
      this.startBlock,
      currentBlock + 100000,
    );

    // Initialize block ranges
    await this.blockCoordinator.initializeRanges(
      this.startBlock,
      currentBlock + 100000,
    );
  }

  /**
   * Start the indexer
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.logger.log("Starting scalable indexer");

    // Initial processing
    await this.processCycle();

    // Start polling
    this.pollTimer = setInterval(() => {
      this.processCycle().catch((error) => {
        this.logger.error(`Error in processing cycle: ${error.message}`);
      });
    }, this.pollIntervalMs);
  }

  /**
   * Stop the indexer
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Release assigned ranges
    for (const range of this.assignedRanges) {
      await this.blockCoordinator.releaseBlockRange(range);
    }
    this.assignedRanges = [];

    this.logger.log("Indexer stopped");
  }

  /**
   * Main processing cycle
   */
  private async processCycle(): Promise<void> {
    try {
      // Update heartbeat
      await this.shardManager.updateHeartbeat(this.instanceId);

      // Get current safe block
      const safeBlock = await this.getSafeBlockNumber();

      // Update metrics
      const currentProgress = await this.blockCoordinator.getGlobalProgress();
      await this.metricsService.updateLagMetric(currentProgress, safeBlock);

      // Try to acquire and process block ranges
      await this.acquireAndProcessRanges(safeBlock);

      // Check for reorgs periodically
      await this.checkForReorgs();

      // Update cluster metrics
      const activeInstances = await this.shardManager.getActiveInstances();
      const shardStats = await this.shardManager.getShardStats();
      await this.metricsService.updateClusterMetrics(
        activeInstances.length,
        shardStats.totalShards,
      );
    } catch (error) {
      this.logger.error(
        `Processing cycle failed: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Acquire block ranges and queue them for processing
   */
  private async acquireAndProcessRanges(safeBlock: number): Promise<void> {
    // Release completed ranges
    this.assignedRanges = this.assignedRanges.filter((range) => {
      // Check if range is still being processed
      return range.toBlock > safeBlock;
    });

    // Try to acquire new ranges (limit concurrent ranges per instance)
    const maxConcurrentRanges = 2;
    while (this.assignedRanges.length < maxConcurrentRanges) {
      const range = await this.blockCoordinator.acquireBlockRange(
        this.instanceId,
      );

      if (!range) {
        break; // No more ranges available
      }

      // Ensure range doesn't exceed safe block
      if (range.fromBlock > safeBlock) {
        await this.blockCoordinator.releaseBlockRange(range);
        break;
      }

      if (range.toBlock > safeBlock) {
        range.toBlock = safeBlock;
      }

      this.assignedRanges.push(range);

      // Queue the range for processing
      await this.queueService.addBlockRange(range);

      this.logger.log(
        `Acquired and queued range ${range.fromBlock}-${range.toBlock}`,
      );
    }
  }

  /**
   * Check for chain reorganizations
   */
  private async checkForReorgs(): Promise<void> {
    // Only check periodically (every 10 cycles)
    if (Math.random() > 0.1) return;

    const checkDepth = 20; // Check last 20 blocks
    const lastIndexed = await this.blockCoordinator.getGlobalProgress();

    if (lastIndexed < checkDepth) return;

    const startCheck = Math.max(this.startBlock, lastIndexed - checkDepth);

    // Get a sample of blocks to check
    const sampleBlocks = await this.indexedRepo
      .createQueryBuilder("e")
      .select(["e.blockNumber", "e.blockHash"])
      .where("CAST(e.blockNumber AS bigint) >= :start", { start: startCheck })
      .andWhere("CAST(e.blockNumber AS bigint) <= :end", { end: lastIndexed })
      .groupBy("e.blockNumber")
      .addGroupBy("e.blockHash")
      .orderBy("CAST(e.blockNumber AS bigint)", "DESC")
      .limit(10)
      .getRawMany();

    for (const sample of sampleBlocks) {
      const blockNumber = parseInt(sample.blockNumber, 10);
      const expectedHash = sample.blockHash;

      try {
        const block = await this.provider.getBlock(blockNumber);

        if (block && block.hash !== expectedHash) {
          this.logger.warn(
            `Reorg detected at block ${blockNumber}: expected ${expectedHash}, got ${block.hash}`,
          );

          await this.handleReorg(blockNumber);
        }
      } catch (error) {
        this.logger.error(
          `Failed to check block ${blockNumber}: ${error.message}`,
        );
      }
    }
  }

  /**
   * Handle chain reorganization
   */
  private async handleReorg(reorgBlock: number): Promise<void> {
    this.logger.log(`Handling reorganization from block ${reorgBlock}`);

    // Delete affected events
    const result = await this.indexedRepo
      .createQueryBuilder()
      .delete()
      .from(IndexedEvent)
      .where("CAST(blockNumber AS bigint) >= :block", { block: reorgBlock })
      .execute();

    this.logger.log(
      `Deleted ${result.affected} events from block ${reorgBlock} onwards`,
    );

    // Reset block coordinator progress
    // This will cause re-processing of the affected range
    await this.blockCoordinator.initializeRanges(
      reorgBlock,
      reorgBlock + 100000,
    );

    // Emit event
    this.eventEmitter.emit("indexer.reorg.handled", {
      reorgBlock,
      affectedEvents: result.affected || 0,
    });
  }

  /**
   * Get the safe block number (current - confirmations)
   */
  private async getSafeBlockNumber(): Promise<number> {
    const currentBlock = await this.provider.getBlockNumber();
    return Math.max(0, currentBlock - this.confirmations);
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.shardManager.updateHeartbeat(this.instanceId);
      } catch (error) {
        this.logger.error(`Heartbeat failed: ${error.message}`);
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Start cleanup task for stale resources
   */
  private startCleanupTask(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.shardManager.cleanupStaleResources();
        await this.blockCoordinator.cleanupOldRanges(24);
        await this.queueService.cleanupOldJobs(24);
      } catch (error) {
        this.logger.error(`Cleanup task failed: ${error.message}`);
      }
    }, 600000); // Every 10 minutes
  }

  /**
   * Get health status
   */
  async getHealth(): Promise<IndexerHealthDto> {
    const currentBlock = await this.provider.getBlockNumber().catch(() => 0);
    const lastProcessed = await this.blockCoordinator.getGlobalProgress();
    const queueStats = await this.queueService.getAllQueueStats();
    const queueHealth = await this.queueService.isHealthy();
    const metricsHealth = this.metricsService.getHealthStatus();

    return {
      instanceId: String(this.instanceId),
      lastProcessedBlock: lastProcessed,
      currentBlock,
      lagBlocks: currentBlock - lastProcessed,
      isHealthy: queueHealth.healthy && metricsHealth.healthy,
      queueDepth: queueStats.blocks.waiting + queueStats.events.waiting,
      processingRate: this.metricsService.getMetrics().eventsPerSecond,
    };
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return this.metricsService.getMetrics();
  }

  /**
   * Get Prometheus-formatted metrics
   */
  getPrometheusMetrics(): string {
    return this.metricsService.getPrometheusMetrics();
  }

  /**
   * Get shard statistics
   */
  async getShardStats() {
    return this.shardManager.getShardStats();
  }

  /**
   * Get range statistics
   */
  async getRangeStats() {
    return this.blockCoordinator.getRangeStats();
  }

  /**
   * Pause indexing
   */
  async pause(): Promise<void> {
    await this.queueService.pauseAll();
    this.logger.log("Indexing paused");
  }

  /**
   * Resume indexing
   */
  async resume(): Promise<void> {
    await this.queueService.resumeAll();
    this.logger.log("Indexing resumed");
  }

  /**
   * Force reprocessing of a block range
   */
  async reprocessRange(fromBlock: number, toBlock: number): Promise<void> {
    this.logger.log(
      `Scheduling reprocessing of blocks ${fromBlock}-${toBlock}`,
    );

    // Delete existing events in range
    await this.indexedRepo
      .createQueryBuilder()
      .delete()
      .from(IndexedEvent)
      .where("CAST(blockNumber AS bigint) >= :from", { from: fromBlock })
      .andWhere("CAST(blockNumber AS bigint) <= :to", { to: toBlock })
      .execute();

    // Create and queue new range
    const range: BlockRange = {
      fromBlock,
      toBlock,
      shardId: this.shardManager.getShardForBlock(fromBlock),
      instanceId: this.instanceId,
    };

    await this.queueService.addBlockRange(range);
  }
}
