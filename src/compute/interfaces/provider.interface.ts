/**
 * AI Compute Provider Interface
 *
 * Defines the contract for all AI compute providers (OpenAI, Anthropic, etc.)
 */

export enum ProviderType {
  OPENAI = "openai",
  ANTHROPIC = "anthropic",
  GOOGLE = "google",
  MOCK = "mock",
}

export interface IComputeProvider {
  /**
   * Initialize the provider with configuration
   */
  initialize(config?: any): Promise<void>;

  /**
   * Execute a compute request
   */
  execute(request: any): Promise<any>;

  /**
   * Get the current status of the provider
   */
  getStatus(): Promise<{ status: string; healthy: boolean }>;

  /**
   * Get the provider type identifier
   */
  getProviderType(): ProviderType;
}
