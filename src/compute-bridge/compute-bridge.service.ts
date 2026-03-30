import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  IAIProvider,
  AIProviderType,
  IProviderConfig,
} from "./provider.interface";
import { ProviderRegistry } from "./provider.registry";
import {
  CompletionRequestDto,
  CompletionResponseDto,
  EmbeddingRequestDto,
  EmbeddingResponseDto,
  MessageRole,
} from "./base.dto";
import { ProviderRouterService } from "./router/provider-router.service";
import {
  ComputeRequest,
  RoutingContext,
  LoadBalancingStrategy,
} from "./router/routing.interface";

/**
 * ComputeBridge Service
 *
 * Central orchestration service for AI provider interactions.
 * Routes requests to appropriate providers via the ProviderRegistry.
 */
@Injectable()
export class ComputeBridgeService implements OnModuleInit {
  private readonly logger = new Logger(ComputeBridgeService.name);

  private readonly providers = new Map<AIProviderType, IAIProvider>();

  constructor(
    private readonly providerRouter: ProviderRouterService,
    private readonly registry: ProviderRegistry,
  ) {}

  /**
   * Initialize the service on module initialization
   */
  async onModuleInit() {
    this.logger.log("ComputeBridge service initializing...");
    this.logger.log(`Available providers: ${this.registry.list().join(", ")}`);
    this.logger.log("ComputeBridge service initialized");
  }

  /**
   * Register a new AI provider
   */
  async registerProvider(
    provider: IAIProvider,
    config: IProviderConfig,
  ): Promise<void> {
    try {
      await provider.initialize(config);
      this.providers.set(config.type, provider);

      // Register with provider router for intelligent routing
      this.providerRouter.registerProvider(provider);

      this.logger.log(`Provider registered: ${config.type}`);
    } catch (error) {
      this.logger.error(
        `Failed to register provider ${config.type}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get a registered provider by type
   */
  async getProvider(type: AIProviderType): Promise<IAIProvider | undefined> {
    return this.registry.get(type);
  }

  /**
   * Check if a provider is registered
   */
  hasProvider(type: AIProviderType): boolean {
    return this.registry.has(type);
  }

  /**
   * List all registered providers
   */
  listProviders(): AIProviderType[] {
    return this.registry.list();
  }

  /**
   * Generate a completion using specified provider
   */
  async complete(
    request: CompletionRequestDto,
    routingContext?: Partial<RoutingContext>,
  ): Promise<CompletionResponseDto> {
    // Create routing context with defaults
    const context: RoutingContext = {
      requestId: `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      requestType: "completion",
      strategy: routingContext?.strategy || LoadBalancingStrategy.HEALTH_AWARE,
      preferredProviders: routingContext?.preferredProviders,
      fallbackChain: routingContext?.fallbackChain,
      maxRetries: routingContext?.maxRetries || 3,
      priority: routingContext?.priority || "normal",
      costSensitivity: routingContext?.costSensitivity || 0.5,
      latencySensitivity: routingContext?.latencySensitivity || 0.5,
      tenantId: routingContext?.tenantId,
    };

    // Create compute request
    const computeRequest: ComputeRequest = {
      request,
      context,
    };

    try {
      // Execute request with intelligent routing and failover
      const { result, selectedProvider } =
        await this.providerRouter.executeRequest(
          computeRequest,
          async (provider: AIProviderType, req: CompletionRequestDto) => {
            const providerInstance = this.getProvider(provider);
            if (!providerInstance) {
              throw new Error(`Provider ${provider} not found`);
            }

            // Execute completion using the selected provider
            // This would call the provider's complete method
            // For now, return a mock response
            return this.createMockCompletionResponse(req, provider);
          },
        );

      this.logger.log(
        `Completion completed using provider: ${selectedProvider.provider}, reason: ${selectedProvider.reason}`,
      );

      return result as CompletionResponseDto;
    } catch (error) {
      this.logger.error(`Completion failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate embeddings using specified provider
   */
  async generateEmbeddings(
    request: EmbeddingRequestDto,
    routingContext?: Partial<RoutingContext>,
  ): Promise<EmbeddingResponseDto> {
    // Create routing context with defaults
    const context: RoutingContext = {
      requestId: `emb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      requestType: "embedding",
      strategy: routingContext?.strategy || LoadBalancingStrategy.HEALTH_AWARE,
      preferredProviders: routingContext?.preferredProviders,
      fallbackChain: routingContext?.fallbackChain,
      maxRetries: routingContext?.maxRetries || 3,
      priority: routingContext?.priority || "normal",
      costSensitivity: routingContext?.costSensitivity || 0.5,
      latencySensitivity: routingContext?.latencySensitivity || 0.5,
      tenantId: routingContext?.tenantId,
    };

    // Create compute request
    const computeRequest: ComputeRequest = {
      request,
      context,
    };

    try {
      // Execute request with intelligent routing and failover
      const { result, selectedProvider } =
        await this.providerRouter.executeRequest(
          computeRequest,
          async (provider: AIProviderType, req: EmbeddingRequestDto) => {
            const providerInstance = this.getProvider(provider);
            if (!providerInstance) {
              throw new Error(`Provider ${provider} not found`);
            }

            // Execute embedding using the selected provider
            // This would call the provider's generateEmbeddings method
            // For now, return a mock response
            return this.createMockEmbeddingResponse(req, provider);
          },
        );

      this.logger.log(
        `Embedding completed using provider: ${selectedProvider.provider}, reason: ${selectedProvider.reason}`,
      );

      return result as EmbeddingResponseDto;
    } catch (error) {
      this.logger.error(`Embedding failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate a model is available for a specific provider
   */
  async validateModel(
    provider: AIProviderType,
    modelId: string,
  ): Promise<boolean> {
    const providerInstance = await this.registry.get(provider);

    if (!providerInstance) {
      return false;
    }

    try {
      return await providerInstance.validateModel(modelId);
    } catch (error) {
      this.logger.error(
        `Model validation failed for ${provider}/${modelId}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Get available models for a specific provider
   */
  async getAvailableModels(provider: AIProviderType) {
    const providerInstance = await this.registry.get(provider);

    if (!providerInstance) {
      throw new Error(`Provider ${provider} is not registered`);
    }

    return await providerInstance.listModels();
  }

  /**
   * Create mock completion response for testing
   */
  private createMockCompletionResponse(
    request: CompletionRequestDto,
    provider: AIProviderType,
  ): CompletionResponseDto {
    return {
      id: `mock_${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      provider,
      choices: [
        {
          index: 0,
          message: {
            role: MessageRole.ASSISTANT,
            content: `Mock response from ${provider} for model ${request.model}`,
          },
          finishReason: "stop",
        },
      ],
      usage: {
        promptTokens: 10,
        completionTokens: 15,
        totalTokens: 25,
      },
    };
  }

  /**
   * Create mock embedding response for testing
   */
  private createMockEmbeddingResponse(
    request: EmbeddingRequestDto,
    provider: AIProviderType,
  ): EmbeddingResponseDto {
    const inputs = Array.isArray(request.input)
      ? request.input
      : [request.input];

    return {
      object: "list",
      data: inputs.map((input, index) => ({
        index,
        object: "embedding",
        embedding: Array.from({ length: 1536 }, () => Math.random()), // Mock 1536-dimensional embedding
      })),
      model: request.model,
      provider,
      usage: {
        promptTokens: inputs.length * 10,
        completionTokens: 0,
        totalTokens: inputs.length * 10,
      },
    };
  }
}
