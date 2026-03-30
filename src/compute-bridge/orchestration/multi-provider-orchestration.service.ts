import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AIProviderType, ICompletionProvider } from "../provider.interface";
import { CompletionRequestDto } from "../base.dto";
import {
  OrchestrationStrategy,
  OrchestratedRequestConfig,
  OrchestratedResponse,
  ProviderExecutionResult,
  ProviderRuntimeConfig,
  ProviderExecutionMode,
  ConsensusConfig,
  BestOfNConfig,
  NormalizedProviderResponse,
  OrchestrationHealthStatus,
} from "./orchestration.interface";
import { ConsensusService } from "./consensus.service";
import { ResponseNormalizerService } from "./response-normalizer.service";
import { AuditService } from "./audit.service";
import { ProviderRouterService } from "../router/provider-router.service";
import { CircuitBreakerService } from "../router/circuit-breaker.service";

/**
 * Multi-Provider Orchestration Service
 *
 * Core service for orchestrating AI requests across multiple providers.
 * Supports parallel execution, consensus-based aggregation, fallback chains,
 * and comprehensive auditing.
 */
@Injectable()
export class MultiProviderOrchestrationService implements OnModuleInit {
  private readonly logger = new Logger(MultiProviderOrchestrationService.name);
  private readonly providers = new Map<AIProviderType, ICompletionProvider>();
  private readonly runtimeConfigs = new Map<
    AIProviderType,
    ProviderRuntimeConfig
  >();
  private activeRequests = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly consensusService: ConsensusService,
    private readonly normalizer: ResponseNormalizerService,
    private readonly auditService: AuditService,
    private readonly providerRouter: ProviderRouterService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  async onModuleInit() {
    this.logger.log("Multi-Provider Orchestration Service initializing...");
    this.initializeProviderConfigs();
    this.logger.log("Multi-Provider Orchestration Service initialized");
  }

  /**
   * Register a provider for orchestration
   */
  registerProvider(
    provider: ICompletionProvider,
    config: ProviderRuntimeConfig,
  ): void {
    const providerType = provider.getProviderType();
    this.providers.set(providerType, provider);
    this.runtimeConfigs.set(providerType, config);
    this.logger.log(`Provider registered for orchestration: ${providerType}`);
  }

  /**
   * Execute a request with multi-provider orchestration
   */
  async orchestrate(
    request: CompletionRequestDto,
    config: OrchestratedRequestConfig,
  ): Promise<OrchestratedResponse> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    this.logger.log(
      `Starting orchestrated request ${requestId} with strategy: ${config.strategy}`,
    );
    this.activeRequests++;

    try {
      switch (config.strategy) {
        case OrchestrationStrategy.SINGLE:
          return this.executeSingle(request, requestId, config);
        case OrchestrationStrategy.PARALLEL:
          return this.executeParallel(request, requestId, config);
        case OrchestrationStrategy.CONSENSUS:
          return this.executeConsensus(request, requestId, config);
        case OrchestrationStrategy.BEST_OF_N:
          return this.executeBestOfN(request, requestId, config);
        case OrchestrationStrategy.ROUND_ROBIN:
          return this.executeRoundRobin(request, requestId, config);
        case OrchestrationStrategy.RANDOM:
          return this.executeRandom(request, requestId, config);
        default:
          throw new Error(`Unknown orchestration strategy: ${config.strategy}`);
      }
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * Execute with single provider and fallback
   */
  private async executeSingle(
    request: CompletionRequestDto,
    requestId: string,
    config: OrchestratedRequestConfig,
  ): Promise<OrchestratedResponse> {
    const startTime = Date.now();
    const targetProviders = this.getTargetProviders(config);

    for (const provider of targetProviders) {
      const result = await this.executeWithProvider(
        provider,
        request,
        requestId,
      );

      if (result.success && result.response) {
        return {
          requestId,
          strategy: OrchestrationStrategy.SINGLE,
          selectedResponse: result.response,
          allResponses: [result],
          selectionReason: `Provider ${provider} succeeded`,
          totalExecutionTimeMs: Date.now() - startTime,
          timestamp: new Date(),
        };
      }
    }

    throw new Error("All providers failed");
  }

  /**
   * Execute in parallel to all target providers
   */
  private async executeParallel(
    request: CompletionRequestDto,
    requestId: string,
    config: OrchestratedRequestConfig,
  ): Promise<OrchestratedResponse> {
    const startTime = Date.now();
    const targetProviders = this.getTargetProviders(config);

    const promises = targetProviders.map((provider) =>
      this.executeWithProvider(provider, request, requestId),
    );

    const results = await Promise.all(promises);
    const successfulResults = results.filter((r) => r.success && r.response);

    if (successfulResults.length === 0) {
      throw new Error("All providers failed");
    }

    // Select the fastest successful response
    const fastest = successfulResults.reduce((best, current) =>
      current.latencyMs < best.latencyMs ? current : best,
    );

    return {
      requestId,
      strategy: OrchestrationStrategy.PARALLEL,
      selectedResponse: fastest.response!,
      allResponses: results,
      selectionReason: "Fastest response selected",
      totalExecutionTimeMs: Date.now() - startTime,
      timestamp: new Date(),
    };
  }

  /**
   * Execute with consensus-based aggregation
   */
  private async executeConsensus(
    request: CompletionRequestDto,
    requestId: string,
    config: OrchestratedRequestConfig,
  ): Promise<OrchestratedResponse> {
    const startTime = Date.now();
    const targetProviders = this.getTargetProviders(config);

    const promises = targetProviders.map((provider) =>
      this.executeWithProvider(provider, request, requestId),
    );

    const results = await Promise.all(promises);
    const successfulResponses = results
      .filter((r) => r.success && r.response)
      .map((r) => r.response!);

    if (successfulResponses.length === 0) {
      throw new Error("All providers failed");
    }

    // Apply consensus algorithm
    const consensusConfig: ConsensusConfig = config.consensusConfig || {
      algorithm: "majority_vote" as any,
      minAgreementPercentage: 0.5,
    };

    const consensusResult = await this.consensusService.reachConsensus(
      successfulResponses,
      consensusConfig,
    );

    // Find the response that matches the consensus winner
    const winningResponse =
      successfulResponses.find((r) => r.content === consensusResult.winner) ||
      successfulResponses[0];

    return {
      requestId,
      strategy: OrchestrationStrategy.CONSENSUS,
      selectedResponse: winningResponse,
      allResponses: results,
      consensusResult,
      selectionReason: `Consensus reached with ${consensusResult.agreementPercentage.toFixed(2)} agreement`,
      totalExecutionTimeMs: Date.now() - startTime,
      timestamp: new Date(),
    };
  }

  /**
   * Execute best-of-N selection
   */
  private async executeBestOfN(
    request: CompletionRequestDto,
    requestId: string,
    config: OrchestratedRequestConfig,
  ): Promise<OrchestratedResponse> {
    const startTime = Date.now();
    const bestOfNConfig: BestOfNConfig = config.bestOfNConfig || {
      n: 3,
      criteria: "fastest",
    };

    const targetProviders = this.getTargetProviders(config);
    const selectedProviders = targetProviders.slice(0, bestOfNConfig.n);

    const promises = selectedProviders.map((provider) =>
      this.executeWithProvider(provider, request, requestId),
    );

    const results = await Promise.all(promises);
    const successfulResults = results.filter((r) => r.success && r.response);

    if (successfulResults.length === 0) {
      throw new Error("All providers failed");
    }

    // Select based on criteria
    let selected: ProviderExecutionResult;

    switch (bestOfNConfig.criteria) {
      case "fastest":
        selected = successfulResults.reduce((best, current) =>
          current.latencyMs < best.latencyMs ? current : best,
        );
        break;
      case "cheapest":
        selected = successfulResults.reduce((best, current) =>
          current.response!.usage.totalTokens < best.response!.usage.totalTokens
            ? current
            : best,
        );
        break;
      case "highest_quality":
        // Use longest response as proxy for quality (simplistic)
        selected = successfulResults.reduce((best, current) =>
          current.response!.content.length > best.response!.content.length
            ? current
            : best,
        );
        break;
      case "most_tokens":
        selected = successfulResults.reduce((best, current) =>
          current.response!.usage.completionTokens >
          best.response!.usage.completionTokens
            ? current
            : best,
        );
        break;
      default:
        selected = successfulResults[0];
    }

    return {
      requestId,
      strategy: OrchestrationStrategy.BEST_OF_N,
      selectedResponse: selected.response!,
      allResponses: results,
      selectionReason: `Selected by ${bestOfNConfig.criteria} criteria`,
      totalExecutionTimeMs: Date.now() - startTime,
      timestamp: new Date(),
    };
  }

  /**
   * Execute with round-robin provider selection
   */
  private async executeRoundRobin(
    request: CompletionRequestDto,
    requestId: string,
    config: OrchestratedRequestConfig,
  ): Promise<OrchestratedResponse> {
    const startTime = Date.now();
    const targetProviders = this.getTargetProviders(config);

    // Simple round-robin: use the first available provider
    // In production, this would track state across requests
    const provider = targetProviders[0];
    const result = await this.executeWithProvider(provider, request, requestId);

    if (!result.success || !result.response) {
      throw new Error(`Provider ${provider} failed`);
    }

    return {
      requestId,
      strategy: OrchestrationStrategy.ROUND_ROBIN,
      selectedResponse: result.response,
      allResponses: [result],
      selectionReason: "Round-robin selection",
      totalExecutionTimeMs: Date.now() - startTime,
      timestamp: new Date(),
    };
  }

  /**
   * Execute with random provider selection
   */
  private async executeRandom(
    request: CompletionRequestDto,
    requestId: string,
    config: OrchestratedRequestConfig,
  ): Promise<OrchestratedResponse> {
    const startTime = Date.now();
    const targetProviders = this.getTargetProviders(config);

    const randomIndex = Math.floor(Math.random() * targetProviders.length);
    const provider = targetProviders[randomIndex];

    const result = await this.executeWithProvider(provider, request, requestId);

    if (!result.success || !result.response) {
      throw new Error(`Provider ${provider} failed`);
    }

    return {
      requestId,
      strategy: OrchestrationStrategy.RANDOM,
      selectedResponse: result.response,
      allResponses: [result],
      selectionReason: "Random selection",
      totalExecutionTimeMs: Date.now() - startTime,
      timestamp: new Date(),
    };
  }

  /**
   * Execute request with a specific provider
   */
  private async executeWithProvider(
    provider: AIProviderType,
    request: CompletionRequestDto,
    requestId: string,
  ): Promise<ProviderExecutionResult> {
    const startTime = Date.now();
    const runtimeConfig = this.runtimeConfigs.get(provider);

    // Check if provider is enabled
    if (runtimeConfig?.mode === ProviderExecutionMode.DISABLED) {
      return {
        provider,
        success: false,
        error: "Provider is disabled",
        latencyMs: 0,
        timestamp: new Date(),
        retryCount: 0,
      };
    }

    // Check circuit breaker
    if (!this.circuitBreaker.canExecute(provider)) {
      return {
        provider,
        success: false,
        error: "Circuit breaker is open",
        latencyMs: 0,
        timestamp: new Date(),
        retryCount: 0,
      };
    }

    const providerInstance = this.providers.get(provider);
    if (!providerInstance) {
      return {
        provider,
        success: false,
        error: "Provider not registered",
        latencyMs: 0,
        timestamp: new Date(),
        retryCount: 0,
      };
    }

    // Create audit log entry
    const auditId = this.auditService.logRequest(requestId, provider, request, {
      strategy: OrchestrationStrategy.SINGLE,
      isFinalSelection: false,
    });

    let retryCount = 0;
    const maxRetries = runtimeConfig?.maxRetries || 3;

    while (retryCount < maxRetries) {
      try {
        const execStartTime = Date.now();
        const rawResponse = await providerInstance.complete(request);
        const latencyMs = Date.now() - execStartTime;

        // Normalize response
        const normalizedResponse = this.normalizer.normalize(
          provider,
          rawResponse,
          latencyMs,
        );

        // Record success
        this.circuitBreaker.recordSuccess(provider);

        // Update audit log
        this.auditService.logResponse(auditId, normalizedResponse);

        return {
          provider,
          success: true,
          response: normalizedResponse,
          latencyMs,
          timestamp: new Date(),
          retryCount,
        };
      } catch (error: any) {
        retryCount++;
        this.logger.warn(
          `Provider ${provider} attempt ${retryCount} failed: ${error.message}`,
        );

        if (retryCount >= maxRetries) {
          // Record failure
          this.circuitBreaker.recordFailure(provider, error.message);
          this.auditService.logError(auditId, error.message);

          return {
            provider,
            success: false,
            error: error.message,
            latencyMs: Date.now() - startTime,
            timestamp: new Date(),
            retryCount,
          };
        }

        // Wait before retry
        await this.delay(Math.pow(2, retryCount) * 100);
      }
    }

    return {
      provider,
      success: false,
      error: "Max retries exceeded",
      latencyMs: Date.now() - startTime,
      timestamp: new Date(),
      retryCount,
    };
  }

  /**
   * Get target providers for a request
   */
  private getTargetProviders(
    config: OrchestratedRequestConfig,
  ): AIProviderType[] {
    if (config.targetProviders && config.targetProviders.length > 0) {
      return config.targetProviders.filter((p) => this.isProviderEnabled(p));
    }

    // Return all enabled providers
    return Array.from(this.runtimeConfigs.entries())
      .filter(([_, config]) => config.mode === ProviderExecutionMode.ENABLED)
      .map(([provider, _]) => provider);
  }

  /**
   * Check if a provider is enabled
   */
  private isProviderEnabled(provider: AIProviderType): boolean {
    const config = this.runtimeConfigs.get(provider);
    return config?.mode === ProviderExecutionMode.ENABLED;
  }

  /**
   * Set provider execution mode at runtime
   */
  setProviderMode(provider: AIProviderType, mode: ProviderExecutionMode): void {
    const config = this.runtimeConfigs.get(provider);
    if (config) {
      config.mode = mode;
      this.logger.log(`Provider ${provider} mode set to ${mode}`);
    }
  }

  /**
   * Get provider execution mode
   */
  getProviderMode(provider: AIProviderType): ProviderExecutionMode {
    return (
      this.runtimeConfigs.get(provider)?.mode || ProviderExecutionMode.DISABLED
    );
  }

  /**
   * Get orchestration health status
   */
  getHealthStatus(): OrchestrationHealthStatus {
    const providerStatuses = new Map();

    for (const [provider, config] of this.runtimeConfigs) {
      providerStatuses.set(provider, {
        provider,
        status: config.mode,
        isHealthy: this.circuitBreaker.canExecute(provider),
        successRate: 1.0, // Would be calculated from metrics
        averageLatencyMs: 0,
        circuitBreakerState: this.circuitBreaker.getState(provider),
      });
    }

    return {
      status: "healthy",
      providers: providerStatuses,
      activeRequests: this.activeRequests,
      averageResponseTimeMs: 0,
      successRate: 1.0,
    };
  }

  /**
   * Initialize provider configurations from environment
   */
  private initializeProviderConfigs(): void {
    const providers = [
      AIProviderType.OPENAI,
      AIProviderType.ANTHROPIC,
      AIProviderType.GOOGLE,
      AIProviderType.HUGGINGFACE,
    ];

    for (const provider of providers) {
      const isEnabled = this.configService.get<boolean>(
        `ORCHESTRATION_${provider.toUpperCase()}_ENABLED`,
        false,
      );

      if (isEnabled) {
        const config: ProviderRuntimeConfig = {
          provider,
          mode: ProviderExecutionMode.ENABLED,
          timeoutMs: this.configService.get<number>(
            `ORCHESTRATION_${provider.toUpperCase()}_TIMEOUT`,
            30000,
          ),
          maxRetries: this.configService.get<number>(
            `ORCHESTRATION_${provider.toUpperCase()}_RETRIES`,
            3,
          ),
          weight: this.configService.get<number>(
            `ORCHESTRATION_${provider.toUpperCase()}_WEIGHT`,
            1,
          ),
          costPer1KTokens: this.configService.get<number>(
            `ORCHESTRATION_${provider.toUpperCase()}_COST`,
            0.01,
          ),
          qualityScore: this.configService.get<number>(
            `ORCHESTRATION_${provider.toUpperCase()}_QUALITY`,
            0.8,
          ),
          apiConfig: {
            apiKey: this.configService.get<string>(
              `${provider.toUpperCase()}_API_KEY`,
              "",
            ),
            baseUrl: this.configService.get<string>(
              `${provider.toUpperCase()}_BASE_URL`,
              undefined,
            ),
          },
        };

        this.runtimeConfigs.set(provider, config);
        this.logger.log(`Initialized provider config: ${provider}`);
      }
    }
  }

  /**
   * Generate a unique request ID
   */
  private generateRequestId(): string {
    return `orch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
