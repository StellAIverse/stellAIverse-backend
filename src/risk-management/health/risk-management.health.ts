import { Injectable } from "@nestjs/common";
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from "@nestjs/terminus";
import { CircuitBreakerService } from "../circuit-breaker.service";

@Injectable()
export class RiskManagementHealthIndicator extends HealthIndicator {
  constructor(private readonly circuitBreakerService: CircuitBreakerService) {
    super();
  }

  async isHealthy(): Promise<HealthIndicatorResult> {
    const allStatus = this.circuitBreakerService.getAllStatus();
    const details: Record<string, any> = {};
    let allHealthy = true;

    // Check each service's circuit breaker state
    for (const [serviceName, { state, metrics }] of allStatus) {
      const isOpen = state === "OPEN";
      details[serviceName] = {
        state,
        isHealthy: !isOpen,
        metrics: {
          totalCalls: metrics.totalCallCount,
          failures: metrics.failureCount,
          slowCalls: metrics.slowCallCount,
          successes: metrics.successCount,
          failureRate:
            metrics.totalCallCount > 0
              ? ((metrics.failureCount / metrics.totalCallCount) * 100).toFixed(
                  2,
                ) + "%"
              : "N/A",
        },
        lastFailure: metrics.lastFailureTime,
        lastSuccess: metrics.lastSuccessTime,
      };

      if (isOpen) {
        allHealthy = false;
      }
    }

    // If no services registered, circuit breaker system is healthy
    if (allStatus.size === 0) {
      return this.getStatus("risk-management", true, {
        message: "No circuit breakers registered",
      });
    }

    // Return health status
    if (allHealthy) {
      return this.getStatus("risk-management", true, details);
    }

    throw new HealthCheckError(
      "Risk management circuit breaker is in OPEN state",
      this.getStatus("risk-management", false, details),
    );
  }
}
