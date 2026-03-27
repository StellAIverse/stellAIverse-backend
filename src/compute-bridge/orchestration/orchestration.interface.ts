/**
 * Multi-Provider Orchestration Interfaces
 *
 * Defines the contracts for orchestrating requests across multiple AI providers
 * with support for parallel execution, consensus, voting, and comprehensive auditing.
 */

import { AIProviderType } from '../provider.interface';
import { CompletionRequestDto, CompletionResponseDto } from '../base.dto';

/**
 * Orchestration strategy types
 */
export enum OrchestrationStrategy {
  /** Single provider with fallback */
  SINGLE = 'single',
  /** Parallel execution to all providers */
  PARALLEL = 'parallel',
  /** Consensus-based with voting */
  CONSENSUS = 'consensus',
  /** Best-of-N selection */
  BEST_OF_N = 'best_of_n',
  /** Round-robin across providers */
  ROUND_ROBIN = 'round_robin',
  /** Random provider selection */
  RANDOM = 'random',
}

/**
 * Consensus algorithm types
 */
export enum ConsensusAlgorithm {
  /** Simple majority voting */
  MAJORITY_VOTE = 'majority_vote',
  /** Weighted voting based on provider reliability */
  WEIGHTED_VOTE = 'weighted_vote',
  /** Semantic similarity clustering */
  SEMANTIC_CLUSTERING = 'semantic_clustering',
  /** Exact match comparison */
  EXACT_MATCH = 'exact_match',
}

/**
 * Provider execution mode
 */
export enum ProviderExecutionMode {
  /** Provider is enabled and can receive requests */
  ENABLED = 'enabled',
  /** Provider is disabled and won't receive requests */
  DISABLED = 'disabled',
  /** Provider is in maintenance mode */
  MAINTENANCE = 'maintenance',
}

/**
 * Normalized provider response
 */
export interface NormalizedProviderResponse {
  /** Unique response ID */
  id: string;
  /** Provider that generated this response */
  provider: AIProviderType;
  /** Model used */
  model: string;
  /** Normalized content */
  content: string;
  /** Original raw response */
  rawResponse: any;
  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Response latency in milliseconds */
  latencyMs: number;
  /** Timestamp */
  timestamp: Date;
  /** Whether the response is valid */
  isValid: boolean;
  /** Error information if failed */
  error?: string;
}

/**
 * Provider vote in consensus
 */
export interface ProviderVote {
  /** Provider that cast this vote */
  provider: AIProviderType;
  /** Vote value (typically the normalized response content) */
  value: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Vote weight */
  weight: number;
}

/**
 * Consensus result
 */
export interface ConsensusResult {
  /** Winning value */
  winner: string;
  /** Consensus algorithm used */
  algorithm: ConsensusAlgorithm;
  /** Vote tally */
  votes: ProviderVote[];
  /** Agreement percentage (0-1) */
  agreementPercentage: number;
  /** Number of providers in agreement */
  agreementCount: number;
  /** Total providers participating */
  totalParticipants: number;
  /** Whether consensus was achieved */
  consensusReached: boolean;
  /** Confidence in the result (0-1) */
  confidence: number;
}

/**
 * Orchestrated request configuration
 */
export interface OrchestratedRequestConfig {
  /** Orchestration strategy */
  strategy: OrchestrationStrategy;
  /** Target providers (if not specified, uses all enabled) */
  targetProviders?: AIProviderType[];
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Consensus configuration (for CONSENSUS strategy) */
  consensusConfig?: ConsensusConfig;
  /** Best-of-N configuration (for BEST_OF_N strategy) */
  bestOfNConfig?: BestOfNConfig;
  /** Whether to continue on partial failure */
  continueOnFailure?: boolean;
  /** Minimum number of successful responses required */
  minSuccessCount?: number;
}

/**
 * Consensus configuration
 */
export interface ConsensusConfig {
  /** Consensus algorithm to use */
  algorithm: ConsensusAlgorithm;
  /** Minimum agreement percentage to achieve consensus (0-1) */
  minAgreementPercentage: number;
  /** Provider weights for weighted voting */
  providerWeights?: Map<AIProviderType, number>;
  /** Similarity threshold for semantic clustering (0-1) */
  similarityThreshold?: number;
}

/**
 * Best-of-N configuration
 */
export interface BestOfNConfig {
  /** Number of providers to query */
  n: number;
  /** Selection criteria */
  criteria: 'fastest' | 'cheapest' | 'highest_quality' | 'most_tokens';
  /** Provider preference order */
  providerPriority?: AIProviderType[];
}

/**
 * Provider execution result
 */
export interface ProviderExecutionResult {
  /** Provider */
  provider: AIProviderType;
  /** Whether execution succeeded */
  success: boolean;
  /** Response data (if successful) */
  response?: NormalizedProviderResponse;
  /** Error information (if failed) */
  error?: string;
  /** Execution latency in milliseconds */
  latencyMs: number;
  /** Timestamp */
  timestamp: Date;
  /** Retry count */
  retryCount: number;
}

/**
 * Orchestrated response
 */
export interface OrchestratedResponse {
  /** Unique request ID */
  requestId: string;
  /** Strategy used */
  strategy: OrchestrationStrategy;
  /** Final selected response */
  selectedResponse: NormalizedProviderResponse;
  /** All provider responses */
  allResponses: ProviderExecutionResult[];
  /** Consensus result (if applicable) */
  consensusResult?: ConsensusResult;
  /** Selection reason */
  selectionReason: string;
  /** Total execution time */
  totalExecutionTimeMs: number;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Audit log entry for provider calls
 */
export interface ProviderAuditLogEntry {
  /** Unique audit ID */
  auditId: string;
  /** Request ID */
  requestId: string;
  /** Timestamp */
  timestamp: Date;
  /** Provider */
  provider: AIProviderType;
  /** Request data (sanitized) */
  request: {
    model: string;
    messageCount: number;
    maxTokens?: number;
    temperature?: number;
  };
  /** Response data */
  response?: {
    id: string;
    content: string;
    tokensUsed: number;
    latencyMs: number;
  };
  /** Error information */
  error?: string;
  /** Digital signature for integrity */
  signature: string;
  /** Orchestration context */
  orchestrationContext?: {
    strategy: OrchestrationStrategy;
    isFinalSelection: boolean;
    consensusReached?: boolean;
  };
}

/**
 * Provider adapter interface
 * All provider adapters must implement this interface
 */
export interface IProviderAdapter {
  /** Get provider type */
  getProviderType(): AIProviderType;
  
  /** Get provider name */
  getProviderName(): string;
  
  /** Check if provider is healthy */
  isHealthy(): Promise<boolean>;
  
  /** Execute completion request */
  complete(request: CompletionRequestDto): Promise<NormalizedProviderResponse>;
  
  /** Get provider capabilities */
  getCapabilities(): ProviderCapabilities;
  
  /** Get current execution mode */
  getExecutionMode(): ProviderExecutionMode;
  
  /** Set execution mode */
  setExecutionMode(mode: ProviderExecutionMode): void;
}

/**
 * Provider capabilities
 */
export interface ProviderCapabilities {
  /** Supports streaming */
  streaming: boolean;
  /** Supports function calling */
  functionCalling: boolean;
  /** Supports embeddings */
  embeddings: boolean;
  /** Supports vision/image input */
  vision: boolean;
  /** Maximum context length */
  maxContextLength: number;
  /** Available models */
  models: string[];
}

/**
 * Provider configuration with runtime settings
 */
export interface ProviderRuntimeConfig {
  /** Provider type */
  provider: AIProviderType;
  /** Execution mode */
  mode: ProviderExecutionMode;
  /** Request timeout */
  timeoutMs: number;
  /** Maximum retries */
  maxRetries: number;
  /** Weight for weighted strategies */
  weight: number;
  /** Cost per 1K tokens */
  costPer1KTokens: number;
  /** Quality score (0-1) */
  qualityScore: number;
  /** API configuration */
  apiConfig: {
    apiKey: string;
    baseUrl?: string;
    organizationId?: string;
  };
}

/**
 * Orchestration health status
 */
export interface OrchestrationHealthStatus {
  /** Overall status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Provider statuses */
  providers: Map<AIProviderType, ProviderHealthSummary>;
  /** Active request count */
  activeRequests: number;
  /** Average response time */
  averageResponseTimeMs: number;
  /** Success rate (0-1) */
  successRate: number;
}

/**
 * Provider health summary
 */
export interface ProviderHealthSummary {
  /** Provider type */
  provider: AIProviderType;
  /** Health status */
  status: ProviderExecutionMode;
  /** Is healthy */
  isHealthy: boolean;
  /** Success rate */
  successRate: number;
  /** Average latency */
  averageLatencyMs: number;
  /** Circuit breaker state */
  circuitBreakerState: 'closed' | 'open' | 'half_open';
}
