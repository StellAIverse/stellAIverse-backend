import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { ScalableIndexerService } from "./scalable-indexer.service";
import { IndexerQueueService } from "./queues/indexer-queue.service";
import { IndexerMetricsService } from "./services/indexer-metrics.service";
import { BlockCoordinatorService } from "./services/block-coordinator.service";
import { ShardManagerService } from "./services/shard-manager.service";

@ApiTags("Indexer")
@Controller("indexer")
export class IndexerController {
  constructor(
    private readonly indexerService: ScalableIndexerService,
    private readonly queueService: IndexerQueueService,
    private readonly metricsService: IndexerMetricsService,
    private readonly blockCoordinator: BlockCoordinatorService,
    private readonly shardManager: ShardManagerService,
  ) {}

  @Get("health")
  @ApiOperation({ summary: "Get indexer health status" })
  @ApiResponse({
    status: 200,
    description: "Health status retrieved successfully",
  })
  async getHealth() {
    return this.indexerService.getHealth();
  }

  @Get("metrics")
  @ApiOperation({ summary: "Get indexer metrics in Prometheus format" })
  @ApiResponse({ status: 200, description: "Metrics retrieved successfully" })
  async getMetrics() {
    return {
      metrics: this.indexerService.getMetrics(),
      prometheus: this.indexerService.getPrometheusMetrics(),
    };
  }

  @Get("metrics/prometheus")
  @ApiOperation({ summary: "Get metrics in Prometheus format" })
  @ApiResponse({ status: 200, description: "Prometheus metrics" })
  async getPrometheusMetrics() {
    return this.indexerService.getPrometheusMetrics();
  }

  @Get("shards")
  @ApiOperation({ summary: "Get shard statistics" })
  @ApiResponse({ status: 200, description: "Shard statistics retrieved" })
  async getShardStats() {
    return this.shardManager.getShardStats();
  }

  @Get("ranges")
  @ApiOperation({ summary: "Get block range statistics" })
  @ApiResponse({ status: 200, description: "Range statistics retrieved" })
  async getRangeStats() {
    return this.blockCoordinator.getRangeStats();
  }

  @Get("queues")
  @ApiOperation({ summary: "Get queue statistics" })
  @ApiResponse({ status: 200, description: "Queue statistics retrieved" })
  async getQueueStats() {
    return this.queueService.getAllQueueStats();
  }

  @Post("pause")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Pause indexing" })
  @ApiResponse({ status: 200, description: "Indexing paused" })
  async pause() {
    await this.indexerService.pause();
    return { status: "paused" };
  }

  @Post("resume")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Resume indexing" })
  @ApiResponse({ status: 200, description: "Indexing resumed" })
  async resume() {
    await this.indexerService.resume();
    return { status: "resumed" };
  }

  @Post("reprocess")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reprocess a block range" })
  @ApiQuery({ name: "fromBlock", type: Number, required: true })
  @ApiQuery({ name: "toBlock", type: Number, required: true })
  @ApiResponse({ status: 200, description: "Range scheduled for reprocessing" })
  async reprocessRange(
    @Query("fromBlock") fromBlock: string,
    @Query("toBlock") toBlock: string,
  ) {
    await this.indexerService.reprocessRange(
      parseInt(fromBlock, 10),
      parseInt(toBlock, 10),
    );
    return {
      status: "scheduled",
      fromBlock: parseInt(fromBlock, 10),
      toBlock: parseInt(toBlock, 10),
    };
  }

  @Post("rebalance")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Trigger shard rebalancing" })
  @ApiResponse({ status: 200, description: "Rebalancing triggered" })
  async rebalanceShards() {
    await this.shardManager.rebalanceShards();
    return { status: "rebalancing triggered" };
  }

  @Get("dead-letter")
  @ApiOperation({ summary: "Get dead letter queue jobs" })
  @ApiQuery({ name: "limit", type: Number, required: false })
  @ApiResponse({ status: 200, description: "Dead letter jobs retrieved" })
  async getDeadLetterJobs(@Query("limit") limit?: string) {
    const jobs = await this.queueService.getDeadLetterJobs(
      limit ? parseInt(limit, 10) : 100,
    );
    return { jobs };
  }

  @Post("dead-letter/:jobId/retry")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Retry a dead letter job" })
  @ApiParam({ name: "jobId", type: String })
  @ApiResponse({ status: 200, description: "Job retried" })
  @ApiResponse({ status: 404, description: "Job not found" })
  async retryDeadLetterJob(@Param("jobId") jobId: string) {
    const success = await this.queueService.retryDeadLetterJob(jobId);
    return { success, jobId };
  }

  @Post("cleanup")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Trigger cleanup of old jobs and ranges" })
  @ApiQuery({ name: "maxAgeHours", type: Number, required: false })
  @ApiResponse({ status: 200, description: "Cleanup completed" })
  async cleanup(@Query("maxAgeHours") maxAgeHours?: string) {
    await this.queueService.cleanupOldJobs(
      maxAgeHours ? parseInt(maxAgeHours, 10) : 24,
    );
    return { status: "cleanup completed" };
  }

  @Get("throughput")
  @ApiOperation({ summary: "Get throughput statistics" })
  @ApiQuery({ name: "windowMinutes", type: Number, required: false })
  @ApiResponse({ status: 200, description: "Throughput statistics retrieved" })
  async getThroughputStats(@Query("windowMinutes") windowMinutes?: string) {
    const stats = this.metricsService.getThroughputStats(
      windowMinutes ? parseInt(windowMinutes, 10) : 60,
    );
    return stats;
  }
}
