import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IAIProvider, AIProviderType, IProviderConfig } from './interfaces/provider.interface';
import {
  CompletionRequestDto,
  CompletionResponseDto,
  EmbeddingRequestDto,
  EmbeddingResponseDto,
} from './dto/base.dto';

/**
 * ComputeBridge Service
 * 
 * Core service for orchestrating AI provider calls.
 * Manages provider instances, routes requests to appropriate providers,
 * and normalizes responses across different AI services.
 * 
 * @class ComputeBridgeService
 */
@Injectable()
export class ComputeBridgeService implements OnModuleInit {
  private readonly logger = new Logger(ComputeBridgeService.name);
  private readonly providers: Map<AIProviderType, IAIProvider> = new Map();

  /**
   * Initialize the service on module initialization
   */
  async onModuleInit() {
    this.logger.log('ComputeBridge service initializing...');
    // Provider initialization will happen here
    this.logger.log('ComputeBridge service initialized');
  }

  /**
   * Register a new AI provider
   * 
   * @param provider Provider instance implementing IAIProvider
   * @param config Provider configuration
   */
  async registerProvider(
    provider: IAIProvider,
    config: IProviderConfig,
  ): Promise<void> {
    try {
      await provider.initialize(config);
      this.providers.set(config.type, provider);
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
   * 
   * @param type Provider type
   * @returns Provider instance or undefined
   */
  getProvider(type: AIProviderType): IAIProvider | undefined {
    return this.providers.get(type);
  }

  /**
   * Check if a provider is registered
   * 
   * @param type Provider type
   * @returns True if provider is registered
   */
  hasProvider(type: AIProviderType): boolean {
    return this.providers.has(type);
  }

  /**
   * List all registered providers
   * 
   * @returns Array of registered provider types
   */
  listProviders(): AIProviderType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Generate a completion using specified provider
   * 
   * This method will be implemented to route requests to the appropriate
   * provider and normalize the response format.
   * 
   * @param request Completion request
   * @returns Completion response
   * @throws Error if provider is not registered or request fails
   */
  async complete(
    request: CompletionRequestDto,
  ): Promise<CompletionResponseDto> {
    const provider = this.getProvider(request.provider);

    if (!provider) {
      throw new Error(`Provider ${request.provider} is not registered`);
    }

    if (!provider.isInitialized()) {
      throw new Error(`Provider ${request.provider} is not initialized`);
    }

    this.logger.debug(
      `Processing completion request with provider: ${request.provider}, model: ${request.model}`,
    );

    // Provider-specific implementation will be added here
    // For now, this is a placeholder
    throw new Error('Completion method not yet implemented');
  }

  /**
   * Generate embeddings using specified provider
   * 
   * This method will be implemented to route requests to the appropriate
   * provider and normalize the response format.
   * 
   * @param request Embedding request
   * @returns Embedding response
   * @throws Error if provider is not registered or request fails
   */
  async generateEmbeddings(
    request: EmbeddingRequestDto,
  ): Promise<EmbeddingResponseDto> {
    const provider = this.getProvider(request.provider);

    if (!provider) {
      throw new Error(`Provider ${request.provider} is not registered`);
    }

    if (!provider.isInitialized()) {
      throw new Error(`Provider ${request.provider} is not initialized`);
    }

    this.logger.debug(
      `Processing embedding request with provider: ${request.provider}, model: ${request.model}`,
    );

    // Provider-specific implementation will be added here
    // For now, this is a placeholder
    throw new Error('Embedding method not yet implemented');
  }

  /**
   * Validate a model is available for a specific provider
   * 
   * @param provider Provider type
   * @param modelId Model identifier
   * @returns True if model is valid and available
   */
  async validateModel(
    provider: AIProviderType,
    modelId: string,
  ): Promise<boolean> {
    const providerInstance = this.getProvider(provider);

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
   * 
   * @param provider Provider type
   * @returns Array of available models
   */
  async getAvailableModels(provider: AIProviderType) {
    const providerInstance = this.getProvider(provider);

    if (!providerInstance) {
      throw new Error(`Provider ${provider} is not registered`);
    }

    return await providerInstance.listModels();
  }
}