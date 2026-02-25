/**
 * Example: Using Queue Metrics for Monitoring and Observability
 * 
 * This example demonstrates how to leverage the compute job queue metrics
 * for monitoring, alerting, and performance optimization.
 */

import { register } from "../config/metrics";
import { QueueService } from "../compute-job-queue/queue.service";

export class QueueMetricsUsageExample {
  constructor(private readonly queueService: QueueService) {}

  /**
   * Example 1: Get current metrics snapshot
   */
  async getCurrentMetrics(): Promise<string> {
    // Get all metrics in Prometheus format
    const metrics = await register.metrics();
    console.log("Current metrics:", metrics);
    return metrics;
  }

  /**
   * Example 2: Monitor queue health
   */
  async monitorQueueHealth(): Promise<{
    healthy: boolean;
    issues: string[];
  }> {
    const stats = await this.queueService.getQueueStats();
    const issues: string[] = [];

    // Check for queue backlog
    if (stats.compute.waiting > 100) {
      issues.push(`High queue backlog: ${stats.compute.waiting} jobs waiting`);
    }

    // Check for failed jobs
    if (stats.compute.failed > 50) {
      issues.push(`High failure count: ${stats.compute.failed} failed jobs`);
    }

    // Check dead letter queue
    if (stats.deadLetter.count > 0) {
      issues.push(
        `Dead letter queue not empty: ${stats.deadLetter.count} jobs need attention`,
      );
    }

    // Check for stalled jobs
    if (stats.compute.active > 20) {
      issues.push(
        `High number of active jobs: ${stats.compute.active} (possible stall)`,
      );
    }

    return {
      healthy: issues.length === 0,
      issues,
    };
  }

  /**
   * Example 3: Calculate job processing metrics
   */
  async calculateProcessingMetrics(): Promise<{
    throughput: number;
    successRate: number;
    avgDuration: number;
  }> {
    const metrics = await register.metrics();

    // Parse metrics (in production, use Prometheus client library)
    // This is a simplified example
    const successTotal = this.extractMetricValue(
      metrics,
      "stellaiverse_job_success_total",
    );
    const failureTotal = this.extractMetricValue(
      metrics,
      "stellaiverse_job_failure_total",
    );
    const durationSum = this.extractMetricValue(
      metrics,
      "stellaiverse_job_duration_seconds_sum",
    );
    const durationCount = this.extractMetricValue(
      metrics,
      "stellaiverse_job_duration_seconds_count",
    );

    const totalJobs = successTotal + failureTotal;
    const successRate = totalJobs > 0 ? (successTotal / totalJobs) * 100 : 0;
    const avgDuration = durationCount > 0 ? durationSum / durationCount : 0;

    return {
      throughput: totalJobs,
      successRate,
      avgDuration,
    };
  }

  /**
   * Example 4: Detect performance anomalies
   */
  async detectAnomalies(): Promise<{
    anomalies: Array<{ type: string; severity: string; message: string }>;
  }> {
    const stats = await this.queueService.getQueueStats();
    const metrics = await this.calculateProcessingMetrics();
    const anomalies: Array<{ type: string; severity: string; message: string }> =
      [];

    // Check success rate
    if (metrics.successRate < 90) {
      anomalies.push({
        type: "low_success_rate",
        severity: "critical",
        message: `Success rate is ${metrics.successRate.toFixed(2)}% (threshold: 90%)`,
      });
    } else if (metrics.successRate < 95) {
      anomalies.push({
        type: "low_success_rate",
        severity: "warning",
        message: `Success rate is ${metrics.successRate.toFixed(2)}% (threshold: 95%)`,
      });
    }

    // Check average duration
    if (metrics.avgDuration > 30) {
      anomalies.push({
        type: "slow_processing",
        severity: "warning",
        message: `Average job duration is ${metrics.avgDuration.toFixed(2)}s (threshold: 30s)`,
      });
    }

    // Check queue backlog growth
    const backlogRatio = stats.compute.waiting / (stats.compute.active || 1);
    if (backlogRatio > 10) {
      anomalies.push({
        type: "backlog_growth",
        severity: "critical",
        message: `Queue backlog growing: ${stats.compute.waiting} waiting, ${stats.compute.active} active`,
      });
    }

    return { anomalies };
  }

  /**
   * Example 5: Generate health report
   */
  async generateHealthReport(): Promise<string> {
    const health = await this.monitorQueueHealth();
    const metrics = await this.calculateProcessingMetrics();
    const anomalies = await this.detectAnomalies();
    const stats = await this.queueService.getQueueStats();

    const report = `
=== Queue Health Report ===
Generated: ${new Date().toISOString()}

Overall Health: ${health.healthy ? "✓ HEALTHY" : "✗ UNHEALTHY"}

Queue Statistics:
  - Waiting: ${stats.compute.waiting}
  - Active: ${stats.compute.active}
  - Completed: ${stats.compute.completed}
  - Failed: ${stats.compute.failed}
  - Delayed: ${stats.compute.delayed}
  - Dead Letter: ${stats.deadLetter.count}

Performance Metrics:
  - Total Jobs Processed: ${metrics.throughput}
  - Success Rate: ${metrics.successRate.toFixed(2)}%
  - Average Duration: ${metrics.avgDuration.toFixed(2)}s

${health.issues.length > 0 ? `\nIssues Detected:\n${health.issues.map((i) => `  - ${i}`).join("\n")}` : ""}

${anomalies.anomalies.length > 0 ? `\nAnomalies:\n${anomalies.anomalies.map((a) => `  - [${a.severity.toUpperCase()}] ${a.type}: ${a.message}`).join("\n")}` : ""}

=== End Report ===
    `;

    return report.trim();
  }

  /**
   * Example 6: Auto-scaling decision based on metrics
   */
  async shouldScaleUp(): Promise<{
    shouldScale: boolean;
    reason: string;
    recommendedWorkers: number;
  }> {
    const stats = await this.queueService.getQueueStats();
    const currentWorkers = stats.compute.active;
    const waitingJobs = stats.compute.waiting;

    // Scale up if queue backlog is growing
    if (waitingJobs > 50 && currentWorkers < 10) {
      return {
        shouldScale: true,
        reason: `High queue backlog: ${waitingJobs} jobs waiting`,
        recommendedWorkers: Math.min(10, Math.ceil(waitingJobs / 10)),
      };
    }

    // Scale up if jobs are taking too long
    const metrics = await this.calculateProcessingMetrics();
    if (metrics.avgDuration > 30 && currentWorkers < 10) {
      return {
        shouldScale: true,
        reason: `Slow processing: average ${metrics.avgDuration.toFixed(2)}s per job`,
        recommendedWorkers: Math.min(10, currentWorkers + 2),
      };
    }

    return {
      shouldScale: false,
      reason: "Queue is processing efficiently",
      recommendedWorkers: currentWorkers,
    };
  }

  /**
   * Helper: Extract metric value from Prometheus format
   * (Simplified - in production use proper Prometheus client)
   */
  private extractMetricValue(metrics: string, metricName: string): number {
    const regex = new RegExp(`${metricName}\\{[^}]*\\}\\s+(\\d+\\.?\\d*)`, "g");
    let total = 0;
    let match;

    while ((match = regex.exec(metrics)) !== null) {
      total += parseFloat(match[1]);
    }

    return total;
  }
}

/**
 * Example usage in a monitoring service
 */
export async function monitoringServiceExample(
  queueService: QueueService,
): Promise<void> {
  const example = new QueueMetricsUsageExample(queueService);

  // Run health check every minute
  setInterval(async () => {
    const health = await example.monitorQueueHealth();

    if (!health.healthy) {
      console.error("Queue health check failed:", health.issues);
      // Send alert to monitoring system
    }
  }, 60000);

  // Check for anomalies every 5 minutes
  setInterval(async () => {
    const { anomalies } = await example.detectAnomalies();

    if (anomalies.length > 0) {
      console.warn("Anomalies detected:", anomalies);
      // Send alert for critical anomalies
      const critical = anomalies.filter((a) => a.severity === "critical");
      if (critical.length > 0) {
        // Trigger alert
      }
    }
  }, 300000);

  // Generate daily health report
  setInterval(async () => {
    const report = await example.generateHealthReport();
    console.log(report);
    // Send report via email or store in database
  }, 86400000);

  // Auto-scaling check every 2 minutes
  setInterval(async () => {
    const scaling = await example.shouldScaleUp();

    if (scaling.shouldScale) {
      console.log(
        `Scaling recommendation: Add ${scaling.recommendedWorkers - (await queueService.getQueueStats()).compute.active} workers`,
      );
      console.log(`Reason: ${scaling.reason}`);
      // Trigger auto-scaling
    }
  }, 120000);
}
