import { Logger } from '@nestjs/common';
import {
  IAIProvider,
  IProviderConfig,
  IModelInfo,
  AIProviderType,
} from '../interfaces/provider.interface';

/**
 * Base AI Provider
 * 
 * Abstract base class providing common functionality for all AI providers.
 * Implements the IAIProvider interface with shared logic for initialization,
 * configuration management, and common operations.
 * 
 * Provider-specific implementations should extend this class and implement
 * the abstract methods.
 * 
 * @abstract
 * @class BaseAIProvider
 * @implements {IAIProvider}
 */
export abstract class BaseAIProvider implements IAIProvider {
  protected readonly logger: Logger;
  protected config: IProviderConfig | null = null;
  protected initialized: boolean = false;

  constructor(loggerContext: string) {
    this.logger = new Logger(loggerContext);
  }

  /**
   * Initialize the provider with configuration
   * 
   * @param config Provider configuration
   * @throws Error if initialization fails
   */
  async initialize(config: IProviderConfig): Promise<void> {
    try {
      this.logger.log(`Initializing provider: ${config.type}`);
      
      // Validate configuration
      this.validateConfig(config);
      
      this.config = config;
      
      // Provider-specific initialization
      await this.initializeProvider();
      
      this.initialized = true;
      this.logger.log(`Provider initialized successfully: ${config.type}`);
    } catch (error) {
      this.logger.error(`Provider initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if the provider is properly initialized
   * 
   * @returns True if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get provider type
   * 
   * @returns Provider type
   */
  abstract getProviderType(): AIProviderType;

  /**
   * List available models for this provider
   * 
   * @returns Array of available models
   */
  abstract listModels(): Promise<IModelInfo[]>;

  /**
   * Get information about a specific model
   * 
   * @param modelId Model identifier
   * @returns Model information
   * @throws Error if model not found
   */
  abstract getModelInfo(modelId: string): Promise<IModelInfo>;

  /**
   * Validate that a model is available and supported
   * 
   * @param modelId Model identifier
   * @returns True if model is valid
   */
  async validateModel(modelId: string): Promise<boolean> {
    try {
      await this.getModelInfo(modelId);
      return true;
    } catch (error) {
      this.logger.warn(`Model validation failed for ${modelId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate provider configuration
   * 
   * @param config Provider configuration
   * @throws Error if configuration is invalid
   */
  protected validateConfig(config: IProviderConfig): void {
    if (!config.apiKey) {
      throw new Error('API key is required');
    }

    if (!config.type) {
      throw new Error('Provider type is required');
    }

    // Validate timeout if provided
    if (config.timeout !== undefined && config.timeout < 1000) {
      throw new Error('Timeout must be at least 1000ms');
    }

    // Validate max retries if provided
    if (config.maxRetries !== undefined && config.maxRetries < 0) {
      throw new Error('Max retries must be non-negative');
    }
  }

  /**
   * Provider-specific initialization logic
   * 
   * Override this method to implement provider-specific setup
   */
  protected abstract initializeProvider(): Promise<void>;

  /**
   * Get the current configuration
   * 
   * @returns Provider configuration
   * @throws Error if provider not initialized
   */
  protected getConfig(): IProviderConfig {
    if (!this.config) {
      throw new Error('Provider not initialized');
    }
    return this.config;
  }

  /**
   * Execute a request with retry logic
   * 
   * @param operation Async operation to execute
   * @param retries Number of retries (defaults to config value)
   * @returns Result of the operation
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    retries?: number,
  ): Promise<T> {
    const maxRetries = retries ?? this.config?.maxRetries ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          this.logger.warn(
            `Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms: ${error.message}`,
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Sleep for specified milliseconds
   * 
   * @param ms Milliseconds to sleep
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Sanitize error for logging (remove sensitive information)
   * 
   * @param error Original error
   * @returns Sanitized error message
   */
  protected sanitizeError(error: any): string {
    const message = error?.message || String(error);
    // Remove API keys and other sensitive data from error messages
    return message.replace(/sk-[a-zA-Z0-9]+/g, 'sk-***');
  }
}