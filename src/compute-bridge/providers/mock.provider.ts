import { BaseAIProvider } from "../base-provider.service";
import { AIProviderType, IModelInfo } from "../provider.interface";
import { Provider } from "../provider.decorator";

/**
 * Mock AI Provider
 *
 * Example provider implementation for testing and demonstration.
 * Returns predefined responses without making external API calls.
 */
@Provider(AIProviderType.CUSTOM)
export class MockProvider extends BaseAIProvider {
  private models: IModelInfo[] = [
    {
      id: "mock-model-v1",
      name: "Mock Model v1",
      provider: AIProviderType.CUSTOM,
      capabilities: {
        textGeneration: true,
        imageUnderstanding: false,
        functionCalling: false,
        streaming: false,
        embeddings: false,
        maxContextTokens: 4096,
      },
    },
    {
      id: "mock-model-v2",
      name: "Mock Model v2",
      provider: AIProviderType.CUSTOM,
      capabilities: {
        textGeneration: true,
        imageUnderstanding: true,
        functionCalling: true,
        streaming: true,
        embeddings: true,
        maxContextTokens: 8192,
      },
    },
  ];

  constructor() {
    super(MockProvider.name);
  }

  getProviderType(): AIProviderType {
    return AIProviderType.CUSTOM;
  }

  protected async initializeProvider(): Promise<void> {
    this.logger.log("Mock provider initialized");
  }

  async listModels(): Promise<IModelInfo[]> {
    return this.models;
  }

  async getModelInfo(modelId: string): Promise<IModelInfo> {
    const model = this.models.find((m) => m.id === modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }
    return model;
  }

  /**
   * Generate a mock completion response
   */
  async complete(prompt: string): Promise<string> {
    this.logger.debug(
      `Mock completion for prompt: ${prompt.substring(0, 50)}...`,
    );
    return `Mock response to: ${prompt}`;
  }
}
