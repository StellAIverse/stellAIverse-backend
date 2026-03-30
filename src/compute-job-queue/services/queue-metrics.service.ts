import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { QueueService } from "../queue.service";

/**
 * Service to periodically collect and update queue metrics
 */
@Injectable()
export class QueueMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueMetricsService.name);
  private metricsInterval: NodeJS.Timeout | null = null;
  private readonly METRICS_INTERVAL_MS = 10000; // Update every 10 seconds

  constructor(private readonly queueService: QueueService) {}

  onModuleInit() {
    this.startMetricsCollection();
  }

  onModuleDestroy() {
    this.stopMetricsCollection();
  }

  /**
   * Start periodic metrics collection
   */
  private startMetricsCollection(): void {
    this.logger.log("Starting queue metrics collection");

    // Collect metrics immediately
    this.collectMetrics();

    // Then collect periodically
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, this.METRICS_INTERVAL_MS);
  }

  /**
   * Stop periodic metrics collection
   */
  private stopMetricsCollection(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
      this.logger.log("Stopped queue metrics collection");
    }
  }

  /**
   * Collect queue metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      // This will update the queueLength metrics
      await this.queueService.getQueueStats();
    } catch (error) {
      this.logger.error(`Failed to collect queue metrics: ${error.message}`);
    }
  }
}
