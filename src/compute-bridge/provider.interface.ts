/**
 * AI Provider Interfaces
 * 
 * Defines the contract for AI provider implementations.
 * All providers must implement these interfaces to ensure
 * consistent behavior across different AI services.
 */

/**
 * Supported AI Provider Types
 */
export enum AIProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  HUGGINGFACE = 'huggingface',
  CUSTOM = 'custom',
}

/**
 * Model capabilities flags
 */
export interface ModelCapabilities {
  /** Supports text generation */
  textGeneration: boolean;
  /** Supports image understanding */
  imageUnderstanding: boolean;
  /** Supports function/tool calling */
  functionCalling: boolean;
  /** Supports streaming responses */
  streaming: boolean;
  /** Supports embeddings generation */
  embeddings: boolean;
  /** Maximum context window size in tokens */
  maxContextTokens: number;
}

/**
 * Provider configuration interface
 */
export interface IProviderConfig {
  /** Provider type identifier */
  type: AIProviderType;
  /** API key for authentication */
  apiKey: string;
  /** Optional API endpoint override */
  apiEndpoint?: string;
  /** Optional organization ID */
  organizationId?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retries for failed requests */
  maxRetries?: number;
}

/**
 * Model information interface
 */
export interface IModelInfo {
  /** Unique model identifier */
  id: string;
  /** Human-readable model name */
  name: string;
  /** Provider that owns this model */
  provider: AIProviderType;
  /** Model capabilities */
  capabilities: ModelCapabilities;
  /** Cost per 1k input tokens (USD) */
  costPerInputToken?: number;
  /** Cost per 1k output tokens (USD) */
  costPerOutputToken?: number;
}

/**
 * Base AI Provider Interface
 * 
 * All AI provider implementations must implement this interface
 * to ensure consistent behavior across the ComputeBridge.
 */
export interface IAIProvider {
  /**
   * Initialize the provider with configuration
   * @param config Provider configuration
   */
  initialize(config: IProviderConfig): Promise<void>;

  /**
   * Check if the provider is properly initialized
   */
  isInitialized(): boolean;

  /**
   * Get provider type
   */
  getProviderType(): AIProviderType;

  /**
   * List available models for this provider
   */
  listModels(): Promise<IModelInfo[]>;

  /**
   * Get information about a specific model
   * @param modelId Model identifier
   */
  getModelInfo(modelId: string): Promise<IModelInfo>;

  /**
   * Validate that a model is available and supported
   * @param modelId Model identifier
   */
  validateModel(modelId: string): Promise<boolean>;
}

/**
 * Completion Provider Interface
 * 
 * Extended interface for providers that support text completion/generation
 */
export interface ICompletionProvider extends IAIProvider {
  /**
   * Generate a completion
   * @param request Completion request
   */
  complete(request: any): Promise<any>;

  /**
   * Generate a streaming completion
   * @param request Completion request
   */
  streamComplete(request: any): AsyncGenerator<any>;
}

/**
 * Embedding Provider Interface
 * 
 * Extended interface for providers that support embeddings generation
 */
export interface IEmbeddingProvider extends IAIProvider {
  /**
   * Generate embeddings for input text
   * @param request Embedding request
   */
  generateEmbeddings(request: any): Promise<any>;
}