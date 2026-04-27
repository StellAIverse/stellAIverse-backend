import { Controller, Get, HttpStatus, HttpCode } from "@nestjs/common";
import { HealthCheck, HealthCheckService } from "@nestjs/terminus";
import { HealthService } from "./health.service";
import { DatabaseHealthIndicator } from "./indicators/database.health-indicator";
import { QueueHealthIndicator } from "./indicators/queue.health-indicator";
import { OpenAIProviderHealthIndicator } from "./indicators/openai-provider.health-indicator";

@Controller("health")
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly health: HealthCheckService,
    private readonly databaseHealthIndicator: DatabaseHealthIndicator,
    private readonly queueHealthIndicator: QueueHealthIndicator,
    private readonly openAIProviderHealthIndicator: OpenAIProviderHealthIndicator,
  ) {}

  /**
   * Liveness probe - returns 200 when process is running
   * No dependency checks, just confirms the process is alive
   */
  @Get("liveness")
  @HttpCode(HttpStatus.OK)
  getLiveness() {
    return this.healthService.getLivenessStatus();
  }

  /**
   * Readiness probe - returns 200 only when all dependencies are healthy
   * Checks: Database, Redis/Queue, External Providers (OpenAI)
   */
  @Get("readiness")
  @HealthCheck()
  async getReadiness() {
    return this.health.check([
      () => this.databaseHealthIndicator.isHealthy("database"),
      () => this.queueHealthIndicator.isHealthy("queue"),
      () => this.openAIProviderHealthIndicator.isHealthy("openai"),
    ]);
  }

  /**
   * Legacy health endpoint for backward compatibility
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  getHealth() {
    return this.healthService.getHealthStatus();
  }
}
