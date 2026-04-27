import { Injectable, Logger } from "@nestjs/common";
import { register, Counter, Histogram, Gauge, Registry } from "prom-client";

/**
 * Prometheus Metrics for Provider Router
 *
 * Exposes metrics for monitoring provider performance, health,
 * and routing decisions.
 */
@Injectable()
export class ProviderMetricsService {
  private readonly logger = new Logger(ProviderMetricsService.name);
  private readonly register: Registry;

  // Request metrics
  private readonly requestsTotal: Counter<string>;
  private readonly requestDuration: Histogram<string>;
  private readonly requestErrors: Counter<string>;

  // Provider metrics
  private readonly providerHealth: Gauge<string>;
  private readonly providerResponseTime: Gauge<string>;
  private readonly providerConnections: Gauge<string>;
  private readonly providerSuccessRate: Gauge<string>;

  // Circuit breaker metrics
  private readonly circuitBreakerState: Gauge<string>;
  private readonly circuitBreakerTransitions: Counter<string>;

  // Load balancing metrics
  private readonly routingDecisions: Counter<string>;
  private readonly fallbackEvents: Counter<string>;

  constructor() {
    this.register = register;

    // Initialize metrics
    this.requestsTotal = new Counter({
      name: "compute_requests_total",
      help: "Total number of compute requests",
      labelNames: ["provider", "request_type", "status"],
      registers: [this.register],
    });

    this.requestDuration = new Histogram({
      name: "compute_request_duration_seconds",
      help: "Duration of compute requests in seconds",
      labelNames: ["provider", "request_type"],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.register],
    });

    this.requestErrors = new Counter({
      name: "compute_request_errors_total",
      help: "Total number of compute request errors",
      labelNames: ["provider", "request_type", "error_type"],
      registers: [this.register],
    });

    this.providerHealth = new Gauge({
      name: "compute_provider_health",
      help: "Health status of providers (1=healthy, 0.5=degraded, 0=unhealthy)",
      labelNames: ["provider"],
      registers: [this.register],
    });

    this.providerResponseTime = new Gauge({
      name: "compute_provider_response_time_ms",
      help: "Average response time of providers in milliseconds",
      labelNames: ["provider"],
      registers: [this.register],
    });

    this.providerConnections = new Gauge({
      name: "compute_provider_active_connections",
      help: "Number of active connections per provider",
      labelNames: ["provider"],
      registers: [this.register],
    });

    this.providerSuccessRate = new Gauge({
      name: "compute_provider_success_rate",
      help: "Success rate of providers (0-1)",
      labelNames: ["provider"],
      registers: [this.register],
    });

    this.circuitBreakerState = new Gauge({
      name: "compute_circuit_breaker_state",
      help: "Circuit breaker state (1=closed, 0.5=half-open, 0=open)",
      labelNames: ["provider"],
      registers: [this.register],
    });

    this.circuitBreakerTransitions = new Counter({
      name: "compute_circuit_breaker_transitions_total",
      help: "Total number of circuit breaker state transitions",
      labelNames: ["provider", "from_state", "to_state"],
      registers: [this.register],
    });

    this.routingDecisions = new Counter({
      name: "compute_routing_decisions_total",
      help: "Total number of routing decisions",
      labelNames: ["provider", "strategy", "reason"],
      registers: [this.register],
    });

    this.fallbackEvents = new Counter({
      name: "compute_fallback_events_total",
      help: "Total number of fallback events",
      labelNames: ["from_provider", "to_provider", "reason"],
      registers: [this.register],
    });

    this.logger.log("Provider metrics initialized");
  }

  /**
   * Record a request start
   */
  recordRequestStart(provider: string, requestType: string): void {
    this.requestsTotal.inc({
      provider,
      request_type: requestType,
      status: "started",
    });
  }

  /**
   * Record a successful request
   */
  recordRequestSuccess(
    provider: string,
    requestType: string,
    duration: number,
  ): void {
    this.requestsTotal.inc({
      provider,
      request_type: requestType,
      status: "success",
    });
    this.requestDuration.observe(
      { provider, request_type: requestType },
      duration / 1000,
    );
  }

  /**
   * Record a failed request
   */
  recordRequestError(
    provider: string,
    requestType: string,
    errorType: string,
  ): void {
    this.requestsTotal.inc({
      provider,
      request_type: requestType,
      status: "error",
    });
    this.requestErrors.inc({
      provider,
      request_type: requestType,
      error_type: errorType,
    });
  }

  /**
   * Update provider health metrics
   */
  updateProviderHealth(
    provider: string,
    healthStatus: string,
    responseTime: number,
    connections: number,
    successRate: number,
  ): void {
    const healthValue =
      healthStatus === "healthy" ? 1 : healthStatus === "degraded" ? 0.5 : 0;

    this.providerHealth.set({ provider }, healthValue);
    this.providerResponseTime.set({ provider }, responseTime);
    this.providerConnections.set({ provider }, connections);
    this.providerSuccessRate.set({ provider }, successRate);
  }

  /**
   * Update circuit breaker state
   */
  updateCircuitBreakerState(provider: string, state: string): void {
    const stateValue = state === "closed" ? 1 : state === "half_open" ? 0.5 : 0;

    this.circuitBreakerState.set({ provider }, stateValue);
  }

  /**
   * Record circuit breaker transition
   */
  recordCircuitBreakerTransition(
    provider: string,
    fromState: string,
    toState: string,
  ): void {
    this.circuitBreakerTransitions.inc({
      provider,
      from_state: fromState,
      to_state: toState,
    });
  }

  /**
   * Record routing decision
   */
  recordRoutingDecision(
    provider: string,
    strategy: string,
    reason: string,
  ): void {
    this.routingDecisions.inc({ provider, strategy, reason });
  }

  /**
   * Record fallback event
   */
  recordFallbackEvent(
    fromProvider: string,
    toProvider: string,
    reason: string,
  ): void {
    this.fallbackEvents.inc({
      from_provider: fromProvider,
      to_provider: toProvider,
      reason,
    });
  }

  /**
   * Get metrics registry for Prometheus endpoint
   */
  getMetrics(): Registry {
    return this.register;
  }

  /**
   * Get metrics as text for scraping
   */
  async getMetricsAsText(): Promise<string> {
    return this.register.metrics();
  }

  /**
   * Reset all metrics (useful for testing)
   */
  resetMetrics(): void {
    this.register.clear();
    this.logger.log("Metrics reset");
  }
}
