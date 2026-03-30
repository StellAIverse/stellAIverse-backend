import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import { IndexerMetrics, QueueStats } from "../interfaces/indexer.interface";

interface MetricsSnapshot {
  timestamp: number;
  eventsIndexed: number;
  queueDepth: number;
  processingTime: number;
}

@Injectable()
export class IndexerMetricsService implements OnModuleInit {
  private readonly logger = new Logger(IndexerMetricsService.name);
  private readonly redis: Redis;
  private readonly metricsKeyPrefix = "indexer:metrics:";
  private readonly snapshotRetention = 24 * 60 * 60; // 24 hours in seconds
  private snapshots: MetricsSnapshot[] = [];
  private lastSnapshotTime = 0;
  private snapshotInterval = 60000; // 1 minute

  // Prometheus-style metrics (for integration with metrics.ts)
  private metrics = {
    totalEventsIndexed: 0,
    eventsPerSecond: 0,
    averageProcessingTime: 0,
    queueDepth: 0,
    failedEvents: 0,
    retryEvents: 0,
    activeInstances: 0,
    shardCount: 0,
    blocksBehind: 0,
  };

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get<string>("REDIS_HOST", "localhost"),
      port: this.configService.get<number>("REDIS_PORT", 6379),
      password: this.configService.get<string>("REDIS_PASSWORD"),
      db: this.configService.get<number>("REDIS_DB", 0),
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
  }

  async onModuleInit() {
    // Load persisted metrics on startup
    await this.loadPersistedMetrics();
    this.logger.log("Indexer metrics service initialized");
  }

  /**
   * Record event processing metrics
   */
  async recordEventProcessed(
    processingTimeMs: number,
    success: boolean,
  ): Promise<void> {
    this.metrics.totalEventsIndexed++;

    if (!success) {
      this.metrics.failedEvents++;
    }

    // Update running average of processing time
    const alpha = 0.1; // Exponential moving average factor
    this.metrics.averageProcessingTime =
      (1 - alpha) * this.metrics.averageProcessingTime +
      alpha * processingTimeMs;

    await this.persistMetrics();
    await this.takeSnapshotIfNeeded();
  }

  /**
   * Record batch processing metrics
   */
  async recordBatchProcessed(
    eventCount: number,
    totalTimeMs: number,
    failedCount: number,
  ): Promise<void> {
    this.metrics.totalEventsIndexed += eventCount;
    this.metrics.failedEvents += failedCount;

    const avgTimePerEvent = eventCount > 0 ? totalTimeMs / eventCount : 0;
    const alpha = 0.1;
    this.metrics.averageProcessingTime =
      (1 - alpha) * this.metrics.averageProcessingTime +
      alpha * avgTimePerEvent;

    // Calculate events per second
    const eventsPerSecond =
      totalTimeMs > 0 ? (eventCount / totalTimeMs) * 1000 : 0;
    this.metrics.eventsPerSecond =
      (1 - alpha) * this.metrics.eventsPerSecond + alpha * eventsPerSecond;

    await this.persistMetrics();
  }

  /**
   * Update queue depth metric
   */
  async updateQueueDepth(queueStats: QueueStats): Promise<void> {
    this.metrics.queueDepth =
      queueStats.waiting + queueStats.active + queueStats.delayed;
    await this.persistMetrics();
  }

  /**
   * Update instance and shard metrics
   */
  async updateClusterMetrics(
    activeInstances: number,
    shardCount: number,
  ): Promise<void> {
    this.metrics.activeInstances = activeInstances;
    this.metrics.shardCount = shardCount;
    await this.persistMetrics();
  }

  /**
   * Update blocks behind (lag) metric
   */
  async updateLagMetric(
    currentBlock: number,
    latestBlock: number,
  ): Promise<void> {
    this.metrics.blocksBehind = Math.max(0, latestBlock - currentBlock);
    await this.persistMetrics();
  }

  /**
   * Record retry event
   */
  async recordRetry(): Promise<void> {
    this.metrics.retryEvents++;
    await this.persistMetrics();
  }

  /**
   * Get current metrics
   */
  getMetrics(): IndexerMetrics & {
    activeInstances: number;
    shardCount: number;
    blocksBehind: number;
  } {
    return {
      totalEventsIndexed: this.metrics.totalEventsIndexed,
      eventsPerSecond: Math.round(this.metrics.eventsPerSecond * 100) / 100,
      averageProcessingTime:
        Math.round(this.metrics.averageProcessingTime * 100) / 100,
      queueDepth: this.metrics.queueDepth,
      failedEvents: this.metrics.failedEvents,
      retryEvents: this.metrics.retryEvents,
      activeInstances: this.metrics.activeInstances,
      shardCount: this.metrics.shardCount,
      blocksBehind: this.metrics.blocksBehind,
    };
  }

  /**
   * Get metrics in Prometheus format
   */
  getPrometheusMetrics(): string {
    const m = this.metrics;
    const timestamp = Date.now();

    return `
# HELP indexer_events_total Total number of events indexed
# TYPE indexer_events_total counter
indexer_events_total ${m.totalEventsIndexed} ${timestamp}

# HELP indexer_events_per_second Events indexed per second
# TYPE indexer_events_per_second gauge
indexer_events_per_second ${m.eventsPerSecond.toFixed(2)} ${timestamp}

# HELP indexer_processing_time_ms Average event processing time in milliseconds
# TYPE indexer_processing_time_ms gauge
indexer_processing_time_ms ${m.averageProcessingTime.toFixed(2)} ${timestamp}

# HELP indexer_queue_depth Current queue depth
# TYPE indexer_queue_depth gauge
indexer_queue_depth ${m.queueDepth} ${timestamp}

# HELP indexer_failed_events_total Total number of failed events
# TYPE indexer_failed_events_total counter
indexer_failed_events_total ${m.failedEvents} ${timestamp}

# HELP indexer_retry_events_total Total number of retried events
# TYPE indexer_retry_events_total counter
indexer_retry_events_total ${m.retryEvents} ${timestamp}

# HELP indexer_active_instances Number of active indexer instances
# TYPE indexer_active_instances gauge
indexer_active_instances ${m.activeInstances} ${timestamp}

# HELP indexer_shard_count Number of shards
# TYPE indexer_shard_count gauge
indexer_shard_count ${m.shardCount} ${timestamp}

# HELP indexer_blocks_behind Number of blocks behind head
# TYPE indexer_blocks_behind gauge
indexer_blocks_behind ${m.blocksBehind} ${timestamp}
`.trim();
  }

  /**
   * Get throughput statistics over time
   */
  getThroughputStats(timeWindowMinutes: number = 60): {
    avgEventsPerSecond: number;
    peakEventsPerSecond: number;
    minEventsPerSecond: number;
    totalEvents: number;
  } {
    const cutoffTime = Date.now() - timeWindowMinutes * 60 * 1000;
    const relevantSnapshots = this.snapshots.filter(
      (s) => s.timestamp >= cutoffTime,
    );

    if (relevantSnapshots.length === 0) {
      return {
        avgEventsPerSecond: 0,
        peakEventsPerSecond: 0,
        minEventsPerSecond: 0,
        totalEvents: 0,
      };
    }

    const eventsPerSecondValues = relevantSnapshots.map((s) => {
      const timeDelta =
        s.timestamp - (this.snapshots[0]?.timestamp || s.timestamp);
      return timeDelta > 0 ? (s.eventsIndexed / timeDelta) * 1000 : 0;
    });

    const totalEvents =
      relevantSnapshots[relevantSnapshots.length - 1].eventsIndexed -
      (relevantSnapshots[0]?.eventsIndexed || 0);

    return {
      avgEventsPerSecond:
        eventsPerSecondValues.reduce((a, b) => a + b, 0) /
        eventsPerSecondValues.length,
      peakEventsPerSecond: Math.max(...eventsPerSecondValues),
      minEventsPerSecond: Math.min(...eventsPerSecondValues),
      totalEvents,
    };
  }

  /**
   * Reset all metrics (use with caution)
   */
  async resetMetrics(): Promise<void> {
    this.metrics = {
      totalEventsIndexed: 0,
      eventsPerSecond: 0,
      averageProcessingTime: 0,
      queueDepth: 0,
      failedEvents: 0,
      retryEvents: 0,
      activeInstances: 0,
      shardCount: 0,
      blocksBehind: 0,
    };
    this.snapshots = [];
    await this.persistMetrics();
    this.logger.warn("All metrics have been reset");
  }

  /**
   * Persist metrics to Redis for durability
   */
  private async persistMetrics(): Promise<void> {
    const key = `${this.metricsKeyPrefix}current`;
    await this.redis.setex(
      key,
      this.snapshotRetention,
      JSON.stringify(this.metrics),
    );
  }

  /**
   * Load persisted metrics from Redis
   */
  private async loadPersistedMetrics(): Promise<void> {
    const key = `${this.metricsKeyPrefix}current`;
    const data = await this.redis.get(key);

    if (data) {
      try {
        const persisted = JSON.parse(data);
        this.metrics = { ...this.metrics, ...persisted };
        this.logger.log("Loaded persisted metrics from Redis");
      } catch (error) {
        this.logger.error(`Failed to load persisted metrics: ${error.message}`);
      }
    }
  }

  /**
   * Take a metrics snapshot for historical analysis
   */
  private async takeSnapshotIfNeeded(): Promise<void> {
    const now = Date.now();

    if (now - this.lastSnapshotTime >= this.snapshotInterval) {
      const snapshot: MetricsSnapshot = {
        timestamp: now,
        eventsIndexed: this.metrics.totalEventsIndexed,
        queueDepth: this.metrics.queueDepth,
        processingTime: this.metrics.averageProcessingTime,
      };

      this.snapshots.push(snapshot);
      this.lastSnapshotTime = now;

      // Keep only last 24 hours of snapshots (1440 snapshots at 1-minute intervals)
      const maxSnapshots = 1440;
      if (this.snapshots.length > maxSnapshots) {
        this.snapshots = this.snapshots.slice(-maxSnapshots);
      }

      // Persist snapshots to Redis
      await this.redis.setex(
        `${this.metricsKeyPrefix}snapshots`,
        this.snapshotRetention,
        JSON.stringify(this.snapshots),
      );
    }
  }

  /**
   * Get health status based on metrics
   */
  getHealthStatus(): {
    healthy: boolean;
    status: "healthy" | "degraded" | "unhealthy";
    reasons: string[];
  } {
    const reasons: string[] = [];
    let status: "healthy" | "degraded" | "unhealthy" = "healthy";

    // Check queue depth
    if (this.metrics.queueDepth > 10000) {
      reasons.push(`High queue depth: ${this.metrics.queueDepth}`);
      status = "unhealthy";
    } else if (this.metrics.queueDepth > 5000) {
      reasons.push(`Elevated queue depth: ${this.metrics.queueDepth}`);
      if (status === "healthy") status = "degraded";
    }

    // Check failure rate
    const failureRate =
      this.metrics.totalEventsIndexed > 0
        ? this.metrics.failedEvents / this.metrics.totalEventsIndexed
        : 0;

    if (failureRate > 0.1) {
      reasons.push(`High failure rate: ${(failureRate * 100).toFixed(2)}%`);
      status = "unhealthy";
    } else if (failureRate > 0.05) {
      reasons.push(`Elevated failure rate: ${(failureRate * 100).toFixed(2)}%`);
      if (status === "healthy") status = "degraded";
    }

    // Check lag
    if (this.metrics.blocksBehind > 100) {
      reasons.push(
        `High block lag: ${this.metrics.blocksBehind} blocks behind`,
      );
      if (status === "healthy") status = "degraded";
    }

    // Check processing speed
    if (this.metrics.eventsPerSecond < 1 && this.metrics.queueDepth > 100) {
      reasons.push("Low processing throughput");
      if (status === "healthy") status = "degraded";
    }

    return {
      healthy: status === "healthy",
      status,
      reasons,
    };
  }
}
