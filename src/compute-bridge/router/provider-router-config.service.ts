import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ProviderRouterConfig,
  LoadBalancingStrategy,
  CircuitBreakerConfig,
  ProviderWeight,
} from "./routing.interface";
import { AIProviderType } from "../provider.interface";

/**
 * Provider Router Configuration Service
 *
 * Manages configuration for the provider router system,
 * including load balancing strategies, circuit breaker settings,
 * and provider weights.
 */
@Injectable()
export class ProviderRouterConfigService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Get provider router configuration
   */
  getRouterConfig(): ProviderRouterConfig {
    return {
      defaultStrategy: this.getLoadBalancingStrategy(),
      healthCheckInterval: this.getHealthCheckInterval(),
      circuitBreaker: this.getCircuitBreakerConfig(),
      providerWeights: this.getProviderWeights(),
      defaultFallbackChain: this.getDefaultFallbackChain(),
      maxConcurrentRequests: this.getMaxConcurrentRequests(),
      requestTimeout: this.getRequestTimeout(),
    };
  }

  /**
   * Get default load balancing strategy
   */
  private getLoadBalancingStrategy(): LoadBalancingStrategy {
    const strategy = this.configService.get<string>("COMPUTE_ROUTER_STRATEGY");

    switch (strategy) {
      case "round_robin":
        return LoadBalancingStrategy.ROUND_ROBIN;
      case "weighted":
        return LoadBalancingStrategy.WEIGHTED;
      case "least_connections":
        return LoadBalancingStrategy.LEAST_CONNECTIONS;
      case "random":
        return LoadBalancingStrategy.RANDOM;
      case "health_aware":
        return LoadBalancingStrategy.HEALTH_AWARE;
      case "cost_optimized":
        return LoadBalancingStrategy.COST_OPTIMIZED;
      default:
        return LoadBalancingStrategy.HEALTH_AWARE;
    }
  }

  /**
   * Get health check interval
   */
  private getHealthCheckInterval(): number {
    return this.configService.get<number>(
      "COMPUTE_HEALTH_CHECK_INTERVAL",
      30000,
    );
  }

  /**
   * Get circuit breaker configuration
   */
  private getCircuitBreakerConfig(): CircuitBreakerConfig {
    return {
      failureThreshold: this.configService.get<number>(
        "COMPUTE_CIRCUIT_BREAKER_FAILURE_THRESHOLD",
        5,
      ),
      recoveryTimeout: this.configService.get<number>(
        "COMPUTE_CIRCUIT_BREAKER_RECOVERY_TIMEOUT",
        30000,
      ),
      successThreshold: this.configService.get<number>(
        "COMPUTE_CIRCUIT_BREAKER_SUCCESS_THRESHOLD",
        3,
      ),
      backoffMultiplier: this.configService.get<number>(
        "COMPUTE_CIRCUIT_BREAKER_BACKOFF_MULTIPLIER",
        2,
      ),
      maxBackoffTime: this.configService.get<number>(
        "COMPUTE_CIRCUIT_BREAKER_MAX_BACKOFF",
        300000,
      ),
    };
  }

  /**
   * Get provider weights for weighted load balancing
   */
  private getProviderWeights(): ProviderWeight[] {
    const weights: ProviderWeight[] = [];

    // OpenAI configuration
    const openaiWeight = this.configService.get<number>(
      "COMPUTE_PROVIDER_OPENAI_WEIGHT",
    );
    if (openaiWeight) {
      weights.push({
        provider: AIProviderType.OPENAI,
        weight: openaiWeight,
        costFactor: this.configService.get<number>(
          "COMPUTE_PROVIDER_OPENAI_COST_FACTOR",
          1,
        ),
        latencyFactor: this.configService.get<number>(
          "COMPUTE_PROVIDER_OPENAI_LATENCY_FACTOR",
          1,
        ),
      });
    }

    // Anthropic configuration
    const anthropicWeight = this.configService.get<number>(
      "COMPUTE_PROVIDER_ANTHROPIC_WEIGHT",
    );
    if (anthropicWeight) {
      weights.push({
        provider: AIProviderType.ANTHROPIC,
        weight: anthropicWeight,
        costFactor: this.configService.get<number>(
          "COMPUTE_PROVIDER_ANTHROPIC_COST_FACTOR",
          1.2,
        ),
        latencyFactor: this.configService.get<number>(
          "COMPUTE_PROVIDER_ANTHROPIC_LATENCY_FACTOR",
          0.8,
        ),
      });
    }

    // Google configuration
    const googleWeight = this.configService.get<number>(
      "COMPUTE_PROVIDER_GOOGLE_WEIGHT",
    );
    if (googleWeight) {
      weights.push({
        provider: AIProviderType.GOOGLE,
        weight: googleWeight,
        costFactor: this.configService.get<number>(
          "COMPUTE_PROVIDER_GOOGLE_COST_FACTOR",
          0.8,
        ),
        latencyFactor: this.configService.get<number>(
          "COMPUTE_PROVIDER_GOOGLE_LATENCY_FACTOR",
          1.1,
        ),
      });
    }

    // HuggingFace configuration
    const huggingfaceWeight = this.configService.get<number>(
      "COMPUTE_PROVIDER_HUGGINGFACE_WEIGHT",
    );
    if (huggingfaceWeight) {
      weights.push({
        provider: AIProviderType.HUGGINGFACE,
        weight: huggingfaceWeight,
        costFactor: this.configService.get<number>(
          "COMPUTE_PROVIDER_HUGGINGFACE_COST_FACTOR",
          0.5,
        ),
        latencyFactor: this.configService.get<number>(
          "COMPUTE_PROVIDER_HUGGINGFACE_LATENCY_FACTOR",
          1.5,
        ),
      });
    }

    return weights;
  }

  /**
   * Get default fallback chain
   */
  private getDefaultFallbackChain(): AIProviderType[] {
    const fallbackChain = this.configService.get<string>(
      "COMPUTE_FALLBACK_CHAIN",
    );
    if (fallbackChain) {
      return fallbackChain
        .split(",")
        .map((provider) => provider.trim() as AIProviderType);
    }

    // Default fallback chain
    return [
      AIProviderType.OPENAI,
      AIProviderType.ANTHROPIC,
      AIProviderType.GOOGLE,
      AIProviderType.HUGGINGFACE,
    ];
  }

  /**
   * Get maximum concurrent requests per provider
   */
  private getMaxConcurrentRequests(): Map<AIProviderType, number> {
    const maxRequests = new Map<AIProviderType, number>();

    const defaultMax = this.configService.get<number>(
      "COMPUTE_MAX_CONCURRENT_REQUESTS",
      100,
    );

    maxRequests.set(
      AIProviderType.OPENAI,
      this.configService.get<number>(
        "COMPUTE_MAX_CONCURRENT_OPENAI",
        defaultMax,
      ),
    );
    maxRequests.set(
      AIProviderType.ANTHROPIC,
      this.configService.get<number>(
        "COMPUTE_MAX_CONCURRENT_ANTHROPIC",
        defaultMax,
      ),
    );
    maxRequests.set(
      AIProviderType.GOOGLE,
      this.configService.get<number>(
        "COMPUTE_MAX_CONCURRENT_GOOGLE",
        defaultMax,
      ),
    );
    maxRequests.set(
      AIProviderType.HUGGINGFACE,
      this.configService.get<number>(
        "COMPUTE_MAX_CONCURRENT_HUGGINGFACE",
        defaultMax,
      ),
    );

    return maxRequests;
  }

  /**
   * Get request timeout
   */
  private getRequestTimeout(): number {
    return this.configService.get<number>("COMPUTE_REQUEST_TIMEOUT", 30000);
  }

  /**
   * Check if a provider is enabled
   */
  isProviderEnabled(provider: AIProviderType): boolean {
    const configKey = `COMPUTE_PROVIDER_${provider.toUpperCase()}_ENABLED`;
    return this.configService.get<boolean>(configKey, true);
  }

  /**
   * Get provider-specific configuration
   */
  getProviderConfig(provider: AIProviderType) {
    const prefix = `COMPUTE_PROVIDER_${provider.toUpperCase()}`;

    return {
      enabled: this.configService.get<boolean>(`${prefix}_ENABLED`, true),
      weight: this.configService.get<number>(`${prefix}_WEIGHT`),
      costFactor: this.configService.get<number>(`${prefix}_COST_FACTOR`),
      latencyFactor: this.configService.get<number>(`${prefix}_LATENCY_FACTOR`),
      maxConcurrent: this.configService.get<number>(`${prefix}_MAX_CONCURRENT`),
      timeout: this.configService.get<number>(`${prefix}_TIMEOUT`),
    };
  }
}
