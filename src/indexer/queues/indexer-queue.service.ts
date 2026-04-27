import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue, JobCounts } from "bull";
import { ConfigService } from "@nestjs/config";
import {
  BlockRange,
  IndexerEvent,
  QueueStats,
  IIndexerQueueService,
} from "../interfaces/indexer.interface";

@Injectable()
export class IndexerQueueService implements OnModuleInit, IIndexerQueueService {
  private readonly logger = new Logger(IndexerQueueService.name);
  private readonly maxQueueDepth: number;

  constructor(
    @InjectQueue("indexer-blocks")
    private readonly blockQueue: Queue,
    @InjectQueue("indexer-events")
    private readonly eventQueue: Queue,
    @InjectQueue("indexer-dead-letter")
    private readonly deadLetterQueue: Queue,
    private readonly configService: ConfigService,
  ) {
    this.maxQueueDepth = this.configService.get<number>(
      "INDEXER_MAX_QUEUE_DEPTH",
      10000,
    );
  }

  async onModuleInit() {
    // Clean up old jobs on startup
    await this.cleanupOldJobs();
    this.logger.log("Indexer queue service initialized");
  }

  /**
   * Add a block range to the processing queue
   */
  async addBlockRange(range: BlockRange): Promise<void> {
    const queueDepth = await this.getBlockQueueDepth();

    if (queueDepth >= this.maxQueueDepth) {
      this.logger.warn(
        `Block queue depth (${queueDepth}) exceeds limit, delaying range addition`,
      );
      // Add with delay to allow processing to catch up
      await this.blockQueue.add(
        "fetch-range",
        { range, instanceId: range.instanceId },
        { delay: 5000 },
      );
      return;
    }

    await this.blockQueue.add("fetch-range", {
      range,
      instanceId: range.instanceId,
    });

    this.logger.debug(
      `Added block range ${range.fromBlock}-${range.toBlock} to queue`,
    );
  }

  /**
   * Add a batch of events to the ingestion queue
   */
  async addEventBatch(events: IndexerEvent[]): Promise<void> {
    if (events.length === 0) return;

    const queueDepth = await this.getEventQueueDepth();

    if (queueDepth >= this.maxQueueDepth) {
      this.logger.warn(
        `Event queue depth (${queueDepth}) exceeds limit, delaying batch`,
      );
      await this.eventQueue.add(
        "batch-ingest",
        { events, shardId: events[0]?.shardId || "unknown" },
        { delay: 5000 },
      );
      return;
    }

    // Group events by shard for efficient processing
    const eventsByShard = this.groupEventsByShard(events);

    for (const [shardId, shardEvents] of Object.entries(eventsByShard)) {
      await this.eventQueue.add("batch-ingest", {
        events: shardEvents,
        shardId,
      });
    }

    this.logger.debug(`Added ${events.length} events to ingestion queue`);
  }

  /**
   * Add a reorg check job
   */
  async addReorgCheck(
    blockNumber: number,
    expectedHash: string,
  ): Promise<void> {
    await this.blockQueue.add("check-reorg", {
      blockNumber,
      expectedHash,
      instanceId: 0, // Will be set by processor
    });
  }

  /**
   * Get statistics for all queues
   */
  async getAllQueueStats(): Promise<{
    blocks: QueueStats;
    events: QueueStats;
    deadLetter: QueueStats;
  }> {
    const [blockStats, eventStats, dlqStats] = await Promise.all([
      this.getStats(this.blockQueue),
      this.getStats(this.eventQueue),
      this.getStats(this.deadLetterQueue),
    ]);

    return {
      blocks: blockStats,
      events: eventStats,
      deadLetter: dlqStats,
    };
  }

  /**
   * Get combined queue stats (implements interface)
   */
  async getQueueStats(): Promise<QueueStats> {
    const allStats = await this.getAllQueueStats();

    // Combine all queue stats
    return {
      waiting: allStats.blocks.waiting + allStats.events.waiting,
      active: allStats.blocks.active + allStats.events.active,
      completed: allStats.blocks.completed + allStats.events.completed,
      failed:
        allStats.blocks.failed +
        allStats.events.failed +
        allStats.deadLetter.failed,
      delayed: allStats.blocks.delayed + allStats.events.delayed,
    };
  }

  /**
   * Pause all queues (for maintenance)
   */
  async pauseAll(): Promise<void> {
    await Promise.all([this.blockQueue.pause(), this.eventQueue.pause()]);
    this.logger.log("All indexer queues paused");
  }

  /**
   * Resume all queues
   */
  async resumeAll(): Promise<void> {
    await Promise.all([this.blockQueue.resume(), this.eventQueue.resume()]);
    this.logger.log("All indexer queues resumed");
  }

  /**
   * Clean up completed/failed jobs older than specified age
   */
  async cleanupOldJobs(maxAgeHours: number = 24): Promise<void> {
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    await Promise.all([
      this.blockQueue.clean(maxAgeMs, "completed"),
      this.blockQueue.clean(maxAgeMs, "failed"),
      this.eventQueue.clean(maxAgeMs, "completed"),
      this.eventQueue.clean(maxAgeMs, "failed"),
    ]);

    this.logger.log(`Cleaned up jobs older than ${maxAgeHours} hours`);
  }

  /**
   * Get jobs from the dead letter queue for analysis
   */
  async getDeadLetterJobs(limit: number = 100): Promise<
    {
      id: string;
      data: any;
      failedReason: string;
      attemptsMade: number;
    }[]
  > {
    const jobs = await this.deadLetterQueue.getFailed(0, limit);

    return jobs.map((job) => ({
      id: String(job.id),
      data: job.data,
      failedReason: job.failedReason || "Unknown",
      attemptsMade: job.attemptsMade,
    }));
  }

  /**
   * Retry a failed job from dead letter queue
   */
  async retryDeadLetterJob(jobId: string): Promise<boolean> {
    const job = await this.deadLetterQueue.getJob(jobId);

    if (!job) {
      return false;
    }

    // Re-queue to appropriate queue based on job type
    if (job.data.event) {
      await this.eventQueue.add("single-ingest", {
        ...job.data,
        retryCount: 0, // Reset retry count
      });
    } else if (job.data.range) {
      await this.blockQueue.add("fetch-range", {
        ...job.data,
        retryCount: 0,
      });
    }

    // Remove from dead letter queue
    await job.remove();

    return true;
  }

  /**
   * Get current processing rate (jobs per minute)
   */
  async getProcessingRate(): Promise<{
    blocksPerMinute: number;
    eventsPerMinute: number;
  }> {
    const [blockCounts, eventCounts] = await Promise.all([
      this.blockQueue.getJobCounts(),
      this.eventQueue.getJobCounts(),
    ]);

    // This is a simplified calculation - in production you'd track this over time
    return {
      blocksPerMinute: this.estimateRate(blockCounts),
      eventsPerMinute: this.estimateRate(eventCounts),
    };
  }

  /**
   * Check if queues are healthy (not backed up)
   */
  async isHealthy(): Promise<{
    healthy: boolean;
    issues: string[];
  }> {
    const stats = await this.getAllQueueStats();
    const issues: string[] = [];

    if (stats.blocks.waiting > this.maxQueueDepth) {
      issues.push(`Block queue backed up: ${stats.blocks.waiting} waiting`);
    }

    if (stats.events.waiting > this.maxQueueDepth) {
      issues.push(`Event queue backed up: ${stats.events.waiting} waiting`);
    }

    if (stats.deadLetter.failed > 1000) {
      issues.push(`High dead letter queue count: ${stats.deadLetter.failed}`);
    }

    return {
      healthy: issues.length === 0,
      issues,
    };
  }

  /**
   * Get block queue depth
   */
  private async getBlockQueueDepth(): Promise<number> {
    const counts = await this.blockQueue.getJobCounts();
    return counts.waiting + counts.delayed;
  }

  /**
   * Get event queue depth
   */
  private async getEventQueueDepth(): Promise<number> {
    const counts = await this.eventQueue.getJobCounts();
    return counts.waiting + counts.delayed;
  }

  /**
   * Group events by shard ID
   */
  private groupEventsByShard(
    events: IndexerEvent[],
  ): Record<string, IndexerEvent[]> {
    return events.reduce(
      (acc, event) => {
        const shardId = event.shardId || "default";
        if (!acc[shardId]) {
          acc[shardId] = [];
        }
        acc[shardId].push(event);
        return acc;
      },
      {} as Record<string, IndexerEvent[]>,
    );
  }

  /**
   * Get stats for a queue
   */
  private async getStats(queue: Queue): Promise<QueueStats> {
    const counts: JobCounts = await queue.getJobCounts();

    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
    };
  }

  /**
   * Estimate processing rate from queue counts
   */
  private estimateRate(counts: JobCounts): number {
    // Simplified rate estimation based on active jobs
    // In production, you'd want to track this with a time-series metric
    const activeJobs = counts.active || 0;
    return activeJobs * 10; // Rough estimate: 10 jobs per minute per worker
  }
}
