import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { QueueService } from '../queue.service';

@Injectable()
export class QueueHealthIndicator extends HealthIndicator {
  constructor(private readonly queueService: QueueService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
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
        ...stats,
        thresholds: {
          maxFailedJobs,
          maxDeadLetterJobs,
          maxActiveJobs,
        },
      });

      if (!isHealthy) {
        throw new HealthCheckError('Queue health check failed', result);
      }

      return result;
    } catch (error) {
      throw new HealthCheckError('Queue health check failed', {
        [key]: {
          status: 'down',
          message: error.message,
        },
      });
    }
  }
}