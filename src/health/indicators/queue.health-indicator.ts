import { Injectable, Logger } from "@nestjs/common";
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from "@nestjs/terminus";
import { QueueService } from "../../compute-job-queue/queue.service";

@Injectable()
export class QueueHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(QueueHealthIndicator.name);

  constructor(private readonly queueService: QueueService) {
    super();
  }

  /**
   * Check if the queue (Redis/Bull) is healthy
   */
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Check Redis connection
      const isRedisHealthy = await this.queueService.isRedisHealthy();

      if (!isRedisHealthy) {
        const result = this.getStatus(key, false, {
          status: "down",
          message: "Redis connection is not available",
        });
        throw new HealthCheckError("Queue health check failed", result);
      }

      // Get queue stats for additional context
      const stats = await this.queueService.getQueueStats();

      // Define health thresholds
      const maxFailedJobs = 100;
      const maxDeadLetterJobs = 50;
      const maxActiveJobs = 1000;

      const isHealthy =
        stats.compute.failed < maxFailedJobs &&
        stats.deadLetter.count < maxDeadLetterJobs &&
        stats.compute.active < maxActiveJobs;

      const result = this.getStatus(key, isHealthy, {
        status: isHealthy ? "up" : "degraded",
        message: isHealthy
          ? "Queue is healthy"
          : "Queue is experiencing high load",
        stats: {
          ...stats,
          thresholds: {
            maxFailedJobs,
            maxDeadLetterJobs,
            maxActiveJobs,
          },
        },
      });

      if (!isHealthy) {
        throw new HealthCheckError(
          "Queue health check failed - high load detected",
          result,
        );
      }

      return result;
    } catch (error) {
      this.logger.error("Queue health check failed", error.message);

      // If it's already a HealthCheckError, re-throw it
      if (error instanceof HealthCheckError) {
        throw error;
      }

      const result = this.getStatus(key, false, {
        status: "down",
        message: `Queue health check failed: ${error.message}`,
      });

      throw new HealthCheckError("Queue health check failed", result);
    }
  }
}
