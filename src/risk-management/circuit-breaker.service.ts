import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold?: number; // Number of failures to open circuit
  failureRateThreshold?: number; // Percentage (0-100) for failure rate
  slowCallRateThreshold?: number; // Percentage (0-100) for slow calls
  slowCallDurationMs?: number; // Duration considered as slow call
  recoveryTimeMs?: number; // Time to wait before transitioning to half-open
  halfOpenRequestCount?: number; // Number of requests to try in half-open state
}

export interface CircuitBreakerMetrics {
  successCount: number;
  failureCount: number;
  slowCallCount: number;
  totalCallCount: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  stateTransitions: Array<{ state: CircuitState; timestamp: Date }>;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  // Per-service circuit breakers
  private readonly breakers = new Map<
    string,
    {
      state: CircuitState;
      config: Required<CircuitBreakerConfig>;
      metrics: CircuitBreakerMetrics;
      halfOpenProbeCount: number;
    }
  >();

  private readonly defaultConfig: Required<CircuitBreakerConfig> = {
    failureThreshold: 5,
    failureRateThreshold: 50, // 50%
    slowCallRateThreshold: 50, // 50%
    slowCallDurationMs: 1000,
    recoveryTimeMs: 60000, // 1 minute
    halfOpenRequestCount: 3,
  };

  constructor(private eventEmitter: EventEmitter2) {}

  /**
   * Register a new protected service with optional custom config
   */
  registerService(serviceName: string, config?: CircuitBreakerConfig): void {
    if (this.breakers.has(serviceName)) {
      this.logger.warn(`Service ${serviceName} already registered`);
      return;
    }

    const finalConfig = { ...this.defaultConfig, ...config };

    this.breakers.set(serviceName, {
      state: "CLOSED",
      config: finalConfig,
      metrics: {
        successCount: 0,
        failureCount: 0,
        slowCallCount: 0,
        totalCallCount: 0,
        stateTransitions: [{ state: "CLOSED", timestamp: new Date() }],
      },
      halfOpenProbeCount: 0,
    });

    this.logger.log(
      `Circuit breaker registered for service: ${serviceName}`,
      finalConfig,
    );
  }

  /**
   * Check if circuit is open for a service
   */
  isOpen(serviceName: string): boolean {
    const breaker = this.getBreaker(serviceName);

    if (breaker.state === "OPEN") {
      // Auto-transition to half-open after recovery time
      const lastFailure = breaker.metrics.lastFailureTime;
      if (
        lastFailure &&
        Date.now() - lastFailure.getTime() > breaker.config.recoveryTimeMs
      ) {
        this.transitionState(serviceName, "HALF_OPEN");
      }
    }

    return breaker.state === "OPEN";
  }

  /**
   * Record a successful call
   */
  recordSuccess(serviceName: string, durationMs: number = 0): void {
    const breaker = this.getBreaker(serviceName);
    breaker.metrics.successCount++;
    breaker.metrics.totalCallCount++;
    breaker.metrics.lastSuccessTime = new Date();

    if (breaker.state === "HALF_OPEN") {
      breaker.halfOpenProbeCount++;
      // Close circuit after successful probes
      if (breaker.halfOpenProbeCount >= breaker.config.halfOpenRequestCount) {
        this.transitionState(serviceName, "CLOSED");
        breaker.metrics.successCount = 0;
        breaker.metrics.failureCount = 0;
        breaker.metrics.slowCallCount = 0;
        breaker.halfOpenProbeCount = 0;
      }
    } else if (breaker.state === "CLOSED") {
      // Check if we should open based on failure rate
      this.evaluateCircuitThresholds(serviceName);
    }
  }

  /**
   * Record a failed call
   */
  recordFailure(serviceName: string): void {
    const breaker = this.getBreaker(serviceName);
    breaker.metrics.failureCount++;
    breaker.metrics.totalCallCount++;
    breaker.metrics.lastFailureTime = new Date();
    breaker.halfOpenProbeCount = 0;

    // Immediately open on half-open failure
    if (breaker.state === "HALF_OPEN") {
      this.transitionState(serviceName, "OPEN");
      return;
    }

    // Check if we should open based on threshold
    this.evaluateCircuitThresholds(serviceName);
  }

  /**
   * Record a slow call
   */
  recordSlowCall(serviceName: string, durationMs: number): void {
    const breaker = this.getBreaker(serviceName);
    if (durationMs > breaker.config.slowCallDurationMs) {
      breaker.metrics.slowCallCount++;
      breaker.metrics.totalCallCount++;
      this.evaluateCircuitThresholds(serviceName);
    }
  }

  /**
   * Manually reset a circuit breaker
   */
  reset(serviceName: string): void {
    const breaker = this.getBreaker(serviceName);
    breaker.state = "CLOSED";
    breaker.metrics.successCount = 0;
    breaker.metrics.failureCount = 0;
    breaker.metrics.slowCallCount = 0;
    breaker.metrics.totalCallCount = 0;
    breaker.halfOpenProbeCount = 0;
    breaker.metrics.lastFailureTime = undefined;
    breaker.metrics.lastSuccessTime = undefined;
    this.transitionState(serviceName, "CLOSED");
  }

  /**
   * Get metrics for a service
   */
  getMetrics(serviceName: string): {
    state: CircuitState;
    metrics: CircuitBreakerMetrics;
  } {
    const breaker = this.getBreaker(serviceName);
    return {
      state: breaker.state,
      metrics: breaker.metrics,
    };
  }

  /**
   * Get all registered services and their status
   */
  getAllStatus(): Map<
    string,
    { state: CircuitState; metrics: CircuitBreakerMetrics }
  > {
    const result = new Map();
    for (const [serviceName, breaker] of this.breakers) {
      result.set(serviceName, {
        state: breaker.state,
        metrics: breaker.metrics,
      });
    }
    return result;
  }

  /**
   * Check health of a service
   */
  isHealthy(serviceName: string): boolean {
    const breaker = this.getBreaker(serviceName);
    return breaker.state !== "OPEN";
  }

  /**
   * Private helper to get or create breaker
   */
  private getBreaker(serviceName: string) {
    if (!this.breakers.has(serviceName)) {
      this.registerService(serviceName);
    }
    return this.breakers.get(serviceName)!;
  }

  /**
   * Evaluate if circuit should transition based on thresholds
   */
  private evaluateCircuitThresholds(serviceName: string): void {
    const breaker = this.getBreaker(serviceName);
    const total = breaker.metrics.totalCallCount;

    if (total === 0) return;

    const failureRate = (breaker.metrics.failureCount / total) * 100;
    const slowCallRate = (breaker.metrics.slowCallCount / total) * 100;

    // Check absolute failure threshold
    if (breaker.metrics.failureCount >= breaker.config.failureThreshold) {
      this.transitionState(serviceName, "OPEN");
      return;
    }

    // Check failure rate threshold
    if (failureRate >= breaker.config.failureRateThreshold) {
      this.transitionState(serviceName, "OPEN");
      return;
    }

    // Check slow call rate threshold
    if (slowCallRate >= breaker.config.slowCallRateThreshold) {
      this.transitionState(serviceName, "OPEN");
      return;
    }
  }

  /**
   * Transition circuit state and emit event
   */
  private transitionState(serviceName: string, newState: CircuitState): void {
    const breaker = this.getBreaker(serviceName);
    const oldState = breaker.state;

    if (oldState === newState) return;

    breaker.state = newState;
    breaker.metrics.stateTransitions.push({
      state: newState,
      timestamp: new Date(),
    });

    const eventName = `circuit-breaker.${newState.toLowerCase()}`;
    const eventData = {
      serviceName,
      from: oldState,
      to: newState,
      metrics: breaker.metrics,
      timestamp: new Date(),
    };

    this.logger.warn(
      `Circuit breaker for ${serviceName} transitioned from ${oldState} to ${newState}`,
      eventData,
    );

    this.eventEmitter.emit(eventName, eventData);
    this.eventEmitter.emit("circuit-breaker.state-change", eventData);
  }
}
