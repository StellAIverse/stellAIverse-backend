import { AIProviderType, IModelInfo } from "../provider.interface";
import { CompletionRequestDto, EmbeddingRequestDto } from "../base.dto";

/**
 * Provider health status
 */
export enum ProviderHealthStatus {
  HEALTHY = "healthy",
  DEGRADED = "degraded",
  UNHEALTHY = "unhealthy",
  UNKNOWN = "unknown",
}

/**
 * Load balancing strategies
 */
export enum LoadBalancingStrategy {
  ROUND_ROBIN = "round_robin",
  WEIGHTED = "weighted",
  LEAST_CONNECTIONS = "least_connections",
  RANDOM = "random",
  HEALTH_AWARE = "health_aware",
  COST_OPTIMIZED = "cost_optimized",
}

/**
 * Provider health metrics
 */
export interface ProviderHealthMetrics {
  /** Current health status */
  status: ProviderHealthStatus;
  /** Response time in milliseconds */
  responseTime: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Number of active connections */
  activeConnections: number;
  /** Last health check timestamp */
  lastCheck: Date;
  /** Consecutive failures */
  consecutiveFailures: number;
  /** Total requests handled */
  totalRequests: number;
  /** Error rate (0-1) */
  errorRate: number;
}

/**
 * Provider weight configuration for weighted load balancing
 */
export interface ProviderWeight {
  provider: AIProviderType;
  /** Weight for selection (higher = more likely) */
  weight: number;
  /** Cost factor (lower = cheaper) */
  costFactor?: number;
  /** Latency factor (lower = faster) */
  latencyFactor?: number;
}

/**
 * Routing context for provider selection
 */
export interface RoutingContext {
  /** Request ID for tracing */
  requestId: string;
  /** Request type */
  requestType: "completion" | "embedding";
  /** Preferred providers (in order) */
  preferredProviders?: AIProviderType[];
  /** Fallback chain */
  fallbackChain?: AIProviderType[];
  /** Load balancing strategy */
  strategy?: LoadBalancingStrategy;
  /** Maximum retries */
  maxRetries?: number;
  /** Request priority */
  priority?: "low" | "normal" | "high";
  /** Cost sensitivity (0-1, higher = more cost sensitive) */
  costSensitivity?: number;
  /** Latency sensitivity (0-1, higher = more latency sensitive) */
  latencySensitivity?: number;
  /** User or tenant ID for quota management */
  tenantId?: string;
}

/**
 * Selected provider with routing metadata
 */
export interface SelectedProvider {
  /** Chosen provider */
  provider: AIProviderType;
  /** Reason for selection */
  reason: string;
  /** Expected response time */
  expectedResponseTime?: number;
  /** Expected cost */
  expectedCost?: number;
  /** Routing path taken */
  routingPath: string[];
  /** Fallback history */
  fallbackHistory: FallbackEvent[];
}

/**
 * Fallback event tracking
 */
export interface FallbackEvent {
  /** Timestamp of fallback */
  timestamp: Date;
  /** From provider */
  fromProvider: AIProviderType;
  /** To provider */
  toProvider: AIProviderType;
  /** Reason for fallback */
  reason: string;
  /** Error that triggered fallback */
  error?: string;
}

/**
 * Circuit breaker state
 */
export enum CircuitBreakerState {
  CLOSED = "closed", // Normal operation
  OPEN = "open", // Failing, reject requests
  HALF_OPEN = "half_open", // Testing recovery
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening */
  failureThreshold: number;
  /** Timeout before attempting recovery (ms) */
  recoveryTimeout: number;
  /** Number of successful requests to close circuit */
  successThreshold: number;
  /** Exponential backoff multiplier */
  backoffMultiplier?: number;
  /** Maximum backoff time (ms) */
  maxBackoffTime?: number;
}

/**
 * Provider router configuration
 */
export interface ProviderRouterConfig {
  /** Default load balancing strategy */
  defaultStrategy: LoadBalancingStrategy;
  /** Health check interval in milliseconds */
  healthCheckInterval: number;
  /** Circuit breaker configuration */
  circuitBreaker: CircuitBreakerConfig;
  /** Provider weights for weighted strategies */
  providerWeights: ProviderWeight[];
  /** Default fallback chain */
  defaultFallbackChain: AIProviderType[];
  /** Maximum concurrent requests per provider */
  maxConcurrentRequests: Map<AIProviderType, number>;
  /** Request timeout in milliseconds */
  requestTimeout: number;
}

/**
 * Compute request wrapper for routing
 */
export interface ComputeRequest {
  /** Original request data */
  request: CompletionRequestDto | EmbeddingRequestDto;
  /** Routing context */
  context: RoutingContext;
}

/**
 * Provider performance statistics
 */
export interface ProviderStats {
  provider: AIProviderType;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  averageCost: number;
  lastUsed: Date;
  uptime: number;
}
