import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { AIProviderType, IAIProvider } from "../provider.interface";
import {
  ComputeRequest,
  SelectedProvider,
  RoutingContext,
  LoadBalancingStrategy,
  ProviderHealthStatus,
  FallbackEvent,
  ProviderRouterConfig,
  ProviderStats,
  ProviderHealthMetrics,
} from "./routing.interface";
import { ProviderHealthService } from "./provider-health.service";
import {
  CircuitBreakerService,
  CircuitBreakerEvent,
} from "./circuit-breaker.service";

/**
 * Provider Router Service
 *
 * Core service for intelligent request routing across multiple AI providers.
 * Implements load balancing, failover, health-aware routing, and circuit breaker patterns.
 */
@Injectable()
export class ProviderRouterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProviderRouterService.name);
  private readonly providers = new Map<AIProviderType, IAIProvider>();
  private readonly providerStats = new Map<AIProviderType, ProviderStats>();
  private readonly roundRobinCounters = new Map<AIProviderType, number>();

  private config: ProviderRouterConfig = {
    defaultStrategy: LoadBalancingStrategy.HEALTH_AWARE,
    healthCheckInterval: 30000,
    circuitBreaker: {
      failureThreshold: 5,
      recoveryTimeout: 30000,
      successThreshold: 3,
      backoffMultiplier: 2,
      maxBackoffTime: 300000, // 5 minutes
    },
    providerWeights: [],
    defaultFallbackChain: [
      AIProviderType.OPENAI,
      AIProviderType.ANTHROPIC,
      AIProviderType.GOOGLE,
      AIProviderType.HUGGINGFACE,
    ],
    maxConcurrentRequests: new Map(),
    requestTimeout: 30000,
  };

  constructor(
    private readonly healthService: ProviderHealthService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  async onModuleInit() {
    this.logger.log("Provider Router Service initializing...");

    // Set up circuit breaker event listeners
    this.circuitBreakerService.addEventListener(
      this.handleCircuitBreakerEvent.bind(this),
    );

    // Initialize round-robin counters
    for (const provider of this.config.defaultFallbackChain) {
      this.roundRobinCounters.set(provider, 0);
      this.providerStats.set(provider, {
        provider,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        averageCost: 0,
        lastUsed: new Date(),
        uptime: 1.0,
      });
    }

    this.logger.log("Provider Router Service initialized");
  }

  async onModuleDestroy() {
    this.logger.log("Provider Router Service shutting down...");
  }

  /**
   * Register a provider for routing
   */
  registerProvider(provider: IAIProvider): void {
    const providerType = provider.getProviderType();
    this.providers.set(providerType, provider);
    this.healthService.registerProvider(provider);
    this.circuitBreakerService.initializeCircuitBreaker(
      providerType,
      this.config.circuitBreaker,
    );

    // Initialize stats if not already present
    if (!this.providerStats.has(providerType)) {
      this.providerStats.set(providerType, {
        provider: providerType,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        averageCost: 0,
        lastUsed: new Date(),
        uptime: 1.0,
      });
    }

    this.logger.log(`Provider registered for routing: ${providerType}`);
  }

  /**
   * Select the optimal provider for a request
   */
  async selectProvider(request: ComputeRequest): Promise<SelectedProvider> {
    const startTime = Date.now();

    try {
      // Get candidate providers
      const candidates = this.getCandidateProviders(request.context);

      if (candidates.length === 0) {
        throw new Error("No available providers for request");
      }

      // Select provider based on strategy
      let selectedProvider: AIProviderType;
      let reason: string;

      switch (request.context.strategy || this.config.defaultStrategy) {
        case LoadBalancingStrategy.ROUND_ROBIN:
          ({ provider: selectedProvider, reason } =
            this.selectRoundRobin(candidates));
          break;

        case LoadBalancingStrategy.WEIGHTED:
          ({ provider: selectedProvider, reason } = this.selectWeighted(
            candidates,
            request.context,
          ));
          break;

        case LoadBalancingStrategy.LEAST_CONNECTIONS:
          ({ provider: selectedProvider, reason } =
            this.selectLeastConnections(candidates));
          break;

        case LoadBalancingStrategy.RANDOM:
          ({ provider: selectedProvider, reason } =
            this.selectRandom(candidates));
          break;

        case LoadBalancingStrategy.HEALTH_AWARE:
          ({ provider: selectedProvider, reason } =
            this.selectHealthAware(candidates));
          break;

        case LoadBalancingStrategy.COST_OPTIMIZED:
          ({ provider: selectedProvider, reason } = this.selectCostOptimized(
            candidates,
            request.context,
          ));
          break;

        default:
          ({ provider: selectedProvider, reason } =
            this.selectHealthAware(candidates));
      }

      // Record request attempt
      this.recordRequestAttempt(selectedProvider);

      // Calculate expected metrics
      const healthMetrics =
        this.healthService.getHealthMetrics(selectedProvider);
      const expectedResponseTime = healthMetrics?.responseTime || 0;
      const expectedCost = this.calculateExpectedCost(
        selectedProvider,
        request,
      );

      const result: SelectedProvider = {
        provider: selectedProvider,
        reason,
        expectedResponseTime,
        expectedCost,
        routingPath: [
          `strategy:${request.context.strategy || this.config.defaultStrategy}`,
        ],
        fallbackHistory: [],
      };

      this.logger.debug(
        `Provider selected: ${selectedProvider} - ${reason} (${Date.now() - startTime}ms)`,
      );
      return result;
    } catch (error) {
      this.logger.error(`Provider selection failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute a request with automatic failover
   */
  async executeRequest<T>(
    request: ComputeRequest,
    executor: (provider: AIProviderType, request: any) => Promise<T>,
  ): Promise<{ result: T; selectedProvider: SelectedProvider }> {
    let selectedProvider: SelectedProvider;
    let lastError: Error;
    const fallbackHistory: FallbackEvent[] = [];
    const maxRetries = request.context.maxRetries || 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Select provider
        selectedProvider = await this.selectProvider(request);
        selectedProvider.fallbackHistory = fallbackHistory;

        // Check circuit breaker
        if (!this.circuitBreakerService.canExecute(selectedProvider.provider)) {
          throw new Error(
            `Circuit breaker open for provider: ${selectedProvider.provider}`,
          );
        }

        // Execute request
        const startTime = Date.now();
        const result = await executor(
          selectedProvider.provider,
          request.request,
        );
        const responseTime = Date.now() - startTime;

        // Record success
        this.recordRequestSuccess(selectedProvider.provider, responseTime);
        this.circuitBreakerService.recordSuccess(selectedProvider.provider);

        return { result, selectedProvider };
      } catch (error) {
        lastError = error;

        // Record failure
        if (selectedProvider) {
          this.recordRequestFailure(selectedProvider.provider, error.message);
          this.circuitBreakerService.recordFailure(
            selectedProvider.provider,
            error.message,
          );

          // Add to fallback history
          fallbackHistory.push({
            timestamp: new Date(),
            fromProvider: selectedProvider.provider,
            toProvider: null as any, // Will be filled on next attempt
            reason: error.message,
            error: error.message,
          });
        }

        this.logger.warn(
          `Request failed (attempt ${attempt + 1}/${maxRetries}): ${error.message}`,
        );

        // If this is the last attempt, throw the error
        if (attempt === maxRetries - 1) {
          throw new Error(
            `All providers failed after ${maxRetries} attempts. Last error: ${lastError.message}`,
          );
        }
      }
    }

    throw lastError;
  }

  /**
   * Get provider statistics
   */
  getProviderStats(): Map<AIProviderType, ProviderStats> {
    return new Map(this.providerStats);
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): AIProviderType[] {
    return this.circuitBreakerService
      .getAvailableProviders()
      .filter((provider) => this.healthService.isProviderHealthy(provider));
  }

  /**
   * Get candidate providers for a request
   */
  private getCandidateProviders(context: RoutingContext): AIProviderType[] {
    let candidates: AIProviderType[];

    // Use preferred providers if specified
    if (context.preferredProviders && context.preferredProviders.length > 0) {
      candidates = context.preferredProviders;
    } else {
      // Use fallback chain or all registered providers
      candidates =
        context.fallbackChain ||
        this.config.defaultFallbackChain ||
        Array.from(this.providers.keys());
    }

    // Filter by availability
    return candidates.filter((provider) => {
      const isRegistered = this.providers.has(provider);
      const isHealthy = this.healthService.isProviderHealthy(provider);
      const canExecute = this.circuitBreakerService.canExecute(provider);

      return isRegistered && isHealthy && canExecute;
    });
  }

  /**
   * Round-robin selection
   */
  private selectRoundRobin(candidates: AIProviderType[]): {
    provider: AIProviderType;
    reason: string;
  } {
    const provider = candidates[0]; // Simplified - would implement proper round-robin
    return {
      provider,
      reason: "Round-robin selection",
    };
  }

  /**
   * Weighted selection
   */
  private selectWeighted(
    candidates: AIProviderType[],
    context: RoutingContext,
  ): { provider: AIProviderType; reason: string } {
    // Simplified weighted selection
    const weights = candidates.map((provider) => {
      const weightConfig = this.config.providerWeights.find(
        (w) => w.provider === provider,
      );
      return weightConfig?.weight || 1;
    });

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < candidates.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return {
          provider: candidates[i],
          reason: `Weighted selection (weight: ${weights[i]})`,
        };
      }
    }

    return {
      provider: candidates[0],
      reason: "Weighted selection (fallback)",
    };
  }

  /**
   * Least connections selection
   */
  private selectLeastConnections(candidates: AIProviderType[]): {
    provider: AIProviderType;
    reason: string;
  } {
    let bestProvider = candidates[0];
    let minConnections = Infinity;

    for (const provider of candidates) {
      const metrics = this.healthService.getHealthMetrics(provider);
      const connections = metrics?.activeConnections || 0;

      if (connections < minConnections) {
        minConnections = connections;
        bestProvider = provider;
      }
    }

    return {
      provider: bestProvider,
      reason: `Least connections (${minConnections} active)`,
    };
  }

  /**
   * Random selection
   */
  private selectRandom(candidates: AIProviderType[]): {
    provider: AIProviderType;
    reason: string;
  } {
    const index = Math.floor(Math.random() * candidates.length);
    return {
      provider: candidates[index],
      reason: "Random selection",
    };
  }

  /**
   * Health-aware selection
   */
  private selectHealthAware(candidates: AIProviderType[]): {
    provider: AIProviderType;
    reason: string;
  } {
    let bestProvider = candidates[0];
    let bestScore = -Infinity;

    for (const provider of candidates) {
      const metrics = this.healthService.getHealthMetrics(provider);
      if (!metrics) continue;

      // Calculate health score
      const score = this.calculateHealthScore(metrics);

      if (score > bestScore) {
        bestScore = score;
        bestProvider = provider;
      }
    }

    return {
      provider: bestProvider,
      reason: `Health-aware selection (score: ${bestScore.toFixed(2)})`,
    };
  }

  /**
   * Cost-optimized selection
   */
  private selectCostOptimized(
    candidates: AIProviderType[],
    context: RoutingContext,
  ): { provider: AIProviderType; reason: string } {
    let bestProvider = candidates[0];
    let bestScore = Infinity;

    for (const provider of candidates) {
      const weightConfig = this.config.providerWeights.find(
        (w) => w.provider === provider,
      );
      const costFactor = weightConfig?.costFactor || 1;

      // Consider cost sensitivity from context
      const adjustedCost = costFactor * (1 + (context.costSensitivity || 0.5));

      if (adjustedCost < bestScore) {
        bestScore = adjustedCost;
        bestProvider = provider;
      }
    }

    return {
      provider: bestProvider,
      reason: `Cost-optimized selection (cost factor: ${bestScore.toFixed(2)})`,
    };
  }

  /**
   * Calculate health score for a provider
   */
  private calculateHealthScore(metrics: ProviderHealthMetrics): number {
    const healthWeight = 0.4;
    const latencyWeight = 0.3;
    const successRateWeight = 0.3;

    const healthScore =
      metrics.status === ProviderHealthStatus.HEALTHY
        ? 1
        : metrics.status === ProviderHealthStatus.DEGRADED
          ? 0.5
          : 0;

    const latencyScore = Math.max(0, 1 - metrics.responseTime / 10000); // Normalize against 10s
    const successRateScore = metrics.successRate;

    return (
      healthScore * healthWeight +
      latencyScore * latencyWeight +
      successRateScore * successRateWeight
    );
  }

  /**
   * Calculate expected cost for a request
   */
  private calculateExpectedCost(
    provider: AIProviderType,
    request: ComputeRequest,
  ): number {
    // Simplified cost calculation
    const weightConfig = this.config.providerWeights.find(
      (w) => w.provider === provider,
    );
    return weightConfig?.costFactor || 1;
  }

  /**
   * Record request attempt
   */
  private recordRequestAttempt(provider: AIProviderType): void {
    this.healthService.recordRequestAttempt(provider);

    const stats = this.providerStats.get(provider);
    if (stats) {
      stats.totalRequests++;
      stats.lastUsed = new Date();
    }
  }

  /**
   * Record successful request
   */
  private recordRequestSuccess(
    provider: AIProviderType,
    responseTime: number,
  ): void {
    this.healthService.recordRequestSuccess(provider, responseTime);

    const stats = this.providerStats.get(provider);
    if (stats) {
      stats.successfulRequests++;

      // Update average response time
      if (stats.averageResponseTime === 0) {
        stats.averageResponseTime = responseTime;
      } else {
        stats.averageResponseTime =
          0.9 * stats.averageResponseTime + 0.1 * responseTime;
      }

      // Update uptime
      const uptime = stats.successfulRequests / stats.totalRequests;
      stats.uptime = uptime;
    }
  }

  /**
   * Record failed request
   */
  private recordRequestFailure(provider: AIProviderType, error: string): void {
    this.healthService.recordRequestFailure(provider, error);

    const stats = this.providerStats.get(provider);
    if (stats) {
      stats.failedRequests++;

      // Update uptime
      const uptime = stats.successfulRequests / stats.totalRequests;
      stats.uptime = uptime;
    }
  }

  /**
   * Handle circuit breaker events
   */
  private handleCircuitBreakerEvent(event: CircuitBreakerEvent): void {
    this.logger.warn(
      `Circuit breaker event: ${event.provider} -> ${event.state} (${event.reason})`,
    );

    // Update provider stats based on circuit breaker state
    const stats = this.providerStats.get(event.provider);
    if (stats) {
      if (event.state === "open") {
        stats.uptime = 0;
      } else if (event.state === "closed") {
        stats.uptime = 1;
      }
    }
  }
}
