import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { AIProviderType, IAIProvider } from "../provider.interface";
import {
  ProviderHealthMetrics,
  ProviderHealthStatus,
} from "./routing.interface";
import { Subject, interval, takeUntil } from "rxjs";

/**
 * Health check result
 */
export interface HealthCheckResult {
  provider: AIProviderType;
  status: ProviderHealthStatus;
  responseTime: number;
  error?: string;
  timestamp: Date;
}

/**
 * Health probe configuration
 */
export interface HealthProbeConfig {
  /** Health check interval in milliseconds */
  interval: number;
  /** Timeout for each health check */
  timeout: number;
  /** Number of consecutive failures to mark unhealthy */
  failureThreshold: number;
  /** Number of consecutive successes to mark healthy */
  successThreshold: number;
}

/**
 * Provider Health Monitor Service
 *
 * Monitors the health and performance of all registered AI providers
 * through periodic health checks and metrics collection.
 */
@Injectable()
export class ProviderHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProviderHealthService.name);
  private readonly providers = new Map<AIProviderType, IAIProvider>();
  private readonly healthMetrics = new Map<
    AIProviderType,
    ProviderHealthMetrics
  >();
  private readonly healthProbeConfig: HealthProbeConfig = {
    interval: 30000, // 30 seconds
    timeout: 5000, // 5 seconds
    failureThreshold: 3,
    successThreshold: 2,
  };

  private healthCheckInterval$;
  private destroy$ = new Subject<void>();
  private readonly healthUpdates$ = new Subject<HealthCheckResult>();

  constructor() {}

  async onModuleInit() {
    this.logger.log("Provider Health Service initializing...");
    this.startHealthChecks();
    this.logger.log("Provider Health Service initialized");
  }

  async onModuleDestroy() {
    this.logger.log("Provider Health Service shutting down...");
    this.destroy$.next();
    this.destroy$.complete();
    this.logger.log("Provider Health Service shut down");
  }

  /**
   * Register a provider for health monitoring
   */
  registerProvider(provider: IAIProvider): void {
    const providerType = provider.getProviderType();
    this.providers.set(providerType, provider);

    // Initialize health metrics
    this.healthMetrics.set(providerType, {
      status: ProviderHealthStatus.UNKNOWN,
      responseTime: 0,
      successRate: 0,
      activeConnections: 0,
      lastCheck: new Date(),
      consecutiveFailures: 0,
      totalRequests: 0,
      errorRate: 0,
    });

    this.logger.log(
      `Provider registered for health monitoring: ${providerType}`,
    );
  }

  /**
   * Unregister a provider from health monitoring
   */
  unregisterProvider(providerType: AIProviderType): void {
    this.providers.delete(providerType);
    this.healthMetrics.delete(providerType);
    this.logger.log(
      `Provider unregistered from health monitoring: ${providerType}`,
    );
  }

  /**
   * Get current health metrics for a provider
   */
  getHealthMetrics(
    providerType: AIProviderType,
  ): ProviderHealthMetrics | undefined {
    return this.healthMetrics.get(providerType);
  }

  /**
   * Get health metrics for all providers
   */
  getAllHealthMetrics(): Map<AIProviderType, ProviderHealthMetrics> {
    return new Map(this.healthMetrics);
  }

  /**
   * Get providers filtered by health status
   */
  getProvidersByStatus(status: ProviderHealthStatus): AIProviderType[] {
    const result: AIProviderType[] = [];
    for (const [provider, metrics] of this.healthMetrics) {
      if (metrics.status === status) {
        result.push(provider);
      }
    }
    return result;
  }

  /**
   * Get healthy providers
   */
  getHealthyProviders(): AIProviderType[] {
    return this.getProvidersByStatus(ProviderHealthStatus.HEALTHY);
  }

  /**
   * Check if a provider is healthy
   */
  isProviderHealthy(providerType: AIProviderType): boolean {
    const metrics = this.healthMetrics.get(providerType);
    return metrics?.status === ProviderHealthStatus.HEALTHY;
  }

  /**
   * Get observable for health updates
   */
  getHealthUpdates() {
    return this.healthUpdates$.asObservable();
  }

  /**
   * Manually trigger health check for a specific provider
   */
  async checkProviderHealth(
    providerType: AIProviderType,
  ): Promise<HealthCheckResult> {
    const provider = this.providers.get(providerType);
    if (!provider) {
      throw new Error(
        `Provider ${providerType} not registered for health monitoring`,
      );
    }

    const startTime = Date.now();

    try {
      // Perform a lightweight health check
      await this.performHealthCheck(provider);

      const responseTime = Date.now() - startTime;
      const result: HealthCheckResult = {
        provider: providerType,
        status: ProviderHealthStatus.HEALTHY,
        responseTime,
        timestamp: new Date(),
      };

      this.updateHealthMetrics(providerType, result);
      this.healthUpdates$.next(result);

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const result: HealthCheckResult = {
        provider: providerType,
        status: ProviderHealthStatus.UNHEALTHY,
        responseTime,
        error: error.message,
        timestamp: new Date(),
      };

      this.updateHealthMetrics(providerType, result);
      this.healthUpdates$.next(result);

      return result;
    }
  }

  /**
   * Record a request attempt for metrics
   */
  recordRequestAttempt(providerType: AIProviderType): void {
    const metrics = this.healthMetrics.get(providerType);
    if (metrics) {
      metrics.totalRequests++;
      metrics.activeConnections++;
    }
  }

  /**
   * Record a successful request
   */
  recordRequestSuccess(
    providerType: AIProviderType,
    responseTime: number,
  ): void {
    const metrics = this.healthMetrics.get(providerType);
    if (metrics) {
      metrics.activeConnections = Math.max(0, metrics.activeConnections - 1);

      // Update success rate
      const successCount =
        metrics.totalRequests - metrics.errorRate * metrics.totalRequests;
      const newSuccessCount = successCount + 1;
      metrics.successRate = newSuccessCount / metrics.totalRequests;

      // Update average response time (exponential moving average)
      if (metrics.responseTime === 0) {
        metrics.responseTime = responseTime;
      } else {
        metrics.responseTime = 0.7 * metrics.responseTime + 0.3 * responseTime;
      }

      // Reset consecutive failures
      metrics.consecutiveFailures = 0;

      // Update status if needed
      if (
        metrics.status === ProviderHealthStatus.UNHEALTHY &&
        metrics.consecutiveFailures < this.healthProbeConfig.failureThreshold
      ) {
        metrics.status = ProviderHealthStatus.DEGRADED;
      }
    }
  }

  /**
   * Record a failed request
   */
  recordRequestFailure(providerType: AIProviderType, error: string): void {
    const metrics = this.healthMetrics.get(providerType);
    if (metrics) {
      metrics.activeConnections = Math.max(0, metrics.activeConnections - 1);
      metrics.consecutiveFailures++;

      // Update error rate
      const failureCount = metrics.errorRate * metrics.totalRequests + 1;
      metrics.errorRate = failureCount / metrics.totalRequests;

      // Update status based on consecutive failures
      if (
        metrics.consecutiveFailures >= this.healthProbeConfig.failureThreshold
      ) {
        metrics.status = ProviderHealthStatus.UNHEALTHY;
      } else if (metrics.status === ProviderHealthStatus.HEALTHY) {
        metrics.status = ProviderHealthStatus.DEGRADED;
      }

      this.logger.warn(
        `Provider ${providerType} failure: ${error} (consecutive: ${metrics.consecutiveFailures})`,
      );
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval$ = interval(this.healthProbeConfig.interval)
      .pipe(takeUntil(this.destroy$))
      .subscribe(async () => {
        await this.performAllHealthChecks();
      });

    this.logger.log(
      `Health checks started with ${this.healthProbeConfig.interval}ms interval`,
    );
  }

  /**
   * Perform health checks on all registered providers
   */
  private async performAllHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.providers.keys()).map(
      (providerType) => this.checkProviderHealth(providerType),
    );

    try {
      await Promise.allSettled(healthCheckPromises);
    } catch (error) {
      this.logger.error("Error during batch health checks:", error);
    }
  }

  /**
   * Perform actual health check on a provider
   */
  private async performHealthCheck(provider: IAIProvider): Promise<void> {
    // Try to list models as a basic connectivity check
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("Health check timeout")),
        this.healthProbeConfig.timeout,
      );
    });

    await Promise.race([provider.listModels(), timeoutPromise]);
  }

  /**
   * Update health metrics based on check result
   */
  private updateHealthMetrics(
    providerType: AIProviderType,
    result: HealthCheckResult,
  ): void {
    const metrics = this.healthMetrics.get(providerType);
    if (!metrics) return;

    metrics.lastCheck = result.timestamp;
    metrics.responseTime = result.responseTime;

    // Update status based on consecutive results
    if (result.status === ProviderHealthStatus.HEALTHY) {
      metrics.consecutiveFailures = 0;

      // Require multiple consecutive successes to mark as healthy
      if (
        metrics.status === ProviderHealthStatus.UNHEALTHY ||
        metrics.status === ProviderHealthStatus.DEGRADED
      ) {
        // Could implement a success counter here
        metrics.status = ProviderHealthStatus.HEALTHY;
      }
    } else {
      metrics.consecutiveFailures++;

      if (
        metrics.consecutiveFailures >= this.healthProbeConfig.failureThreshold
      ) {
        metrics.status = ProviderHealthStatus.UNHEALTHY;
      } else if (metrics.status === ProviderHealthStatus.HEALTHY) {
        metrics.status = ProviderHealthStatus.DEGRADED;
      }
    }

    this.logger.debug(
      `Health check completed for ${providerType}: ${result.status} (${result.responseTime}ms)`,
    );
  }
}
