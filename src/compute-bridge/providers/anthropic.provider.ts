import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { BaseAIProvider } from '../base-provider.service';
import { AIProviderType, ICompletionProvider, IModelInfo } from '../provider.interface';
import { CompletionRequestDto, CompletionResponseDto, MessageRole } from '../base.dto';
import { Provider } from '../provider.decorator';

/**
 * Anthropic Provider Adapter
 *
 * Adapter for Anthropic's Claude models
 * Implements the ICompletionProvider interface for text generation.
 */
@Provider(AIProviderType.ANTHROPIC)
@Injectable()
export class AnthropicProvider extends BaseAIProvider implements ICompletionProvider {
  private client: AxiosInstance;

  private readonly models: IModelInfo[] = [
    {
      id: 'claude-3-opus-20240229',
      name: 'Claude 3 Opus',
      provider: AIProviderType.ANTHROPIC,
      capabilities: {
        textGeneration: true,
        imageUnderstanding: true,
        functionCalling: true,
        streaming: true,
        embeddings: false,
        maxContextTokens: 200000,
      },
      costPerInputToken: 0.015,
      costPerOutputToken: 0.075,
    },
    {
      id: 'claude-3-sonnet-20240229',
      name: 'Claude 3 Sonnet',
      provider: AIProviderType.ANTHROPIC,
      capabilities: {
        textGeneration: true,
        imageUnderstanding: true,
        functionCalling: true,
        streaming: true,
        embeddings: false,
        maxContextTokens: 200000,
      },
      costPerInputToken: 0.003,
      costPerOutputToken: 0.015,
    },
    {
      id: 'claude-3-haiku-20240307',
      name: 'Claude 3 Haiku',
      provider: AIProviderType.ANTHROPIC,
      capabilities: {
        textGeneration: true,
        imageUnderstanding: true,
        functionCalling: true,
        streaming: true,
        embeddings: false,
        maxContextTokens: 200000,
      },
      costPerInputToken: 0.00025,
      costPerOutputToken: 0.00125,
    },
  ];

  constructor() {
    super(AnthropicProvider.name);
  }

  getProviderType(): AIProviderType {
    return AIProviderType.ANTHROPIC;
  }

  protected async initializeProvider(): Promise<void> {
    const config = this.getConfig();
    
    this.client = axios.create({
      baseURL: config.apiEndpoint || 'https://api.anthropic.com/v1',
      headers: {
        'x-api-key': config.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      timeout: config.timeout || 60000,
    });

    this.logger.log('Anthropic provider initialized');
  }

  async listModels(): Promise<IModelInfo[]> {
    return this.models;
  }

  async getModelInfo(modelId: string): Promise<IModelInfo> {
    const model = this.models.find(m => m.id === modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }
    return model;
  }

  async complete(request: CompletionRequestDto): Promise<CompletionResponseDto> {
    if (!this.client) {
      throw new Error('Provider not initialized');
    }

    const response = await this.executeWithRetry(async () => {
      // Convert messages to Anthropic format
      const systemMessage = request.messages.find(m => m.role === MessageRole.SYSTEM);
      const conversationMessages = request.messages.filter(m => m.role !== MessageRole.SYSTEM);

      const result = await this.client.post('/messages', {
        model: request.model,
        messages: conversationMessages.map(m => ({
          role: m.role === MessageRole.ASSISTANT ? 'assistant' : 'user',
          content: m.content,
        })),
        system: systemMessage?.content,
        max_tokens: request.maxTokens || 1024,
        temperature: request.temperature,
        top_p: request.topP,
        stream: false,
      });
      return result.data;
    });

    return this.transformResponse(response);
  }

  async *streamComplete(request: CompletionRequestDto): AsyncGenerator<any> {
    if (!this.client) {
      throw new Error('Provider not initialized');
    }

    const systemMessage = request.messages.find(m => m.role === MessageRole.SYSTEM);
    const conversationMessages = request.messages.filter(m => m.role !== MessageRole.SYSTEM);

    const response = await this.client.post('/messages', {
      model: request.model,
      messages: conversationMessages.map(m => ({
        role: m.role === MessageRole.ASSISTANT ? 'assistant' : 'user',
        content: m.content,
      })),
      system: systemMessage?.content,
      max_tokens: request.maxTokens || 1024,
      temperature: request.temperature,
      stream: true,
    }, {
      responseType: 'stream',
    });

    for await (const chunk of response.data) {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            yield parsed;
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Anthropic doesn't have a dedicated health endpoint, so we check models
      await this.client.get('/models');
      return true;
    } catch (error: any) {
      // 401 is expected if the endpoint requires auth but we're just checking connectivity
      if (error.response?.status === 401) {
        return true;
      }
      this.logger.warn('Anthropic health check failed:', error.message);
      return false;
    }
  }

  private transformResponse(data: any): CompletionResponseDto {
    // Convert Anthropic response to standard format
    return {
      id: data.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: data.model,
      provider: AIProviderType.ANTHROPIC,
      choices: [{
        index: 0,
        message: {
          role: MessageRole.ASSISTANT,
          content: data.content?.[0]?.text || '',
        },
        finishReason: data.stop_reason || 'stop',
      }],
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    };
  }
}
