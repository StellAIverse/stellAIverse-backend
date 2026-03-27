import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { BaseAIProvider } from '../base-provider.service';
import { AIProviderType, ICompletionProvider, IModelInfo, IProviderConfig } from '../provider.interface';
import { CompletionRequestDto, CompletionResponseDto, MessageRole } from '../base.dto';
import { Provider } from '../provider.decorator';

/**
 * OpenAI Provider Adapter
 *
 * Adapter for OpenAI's GPT models (GPT-3.5, GPT-4, etc.)
 * Implements the ICompletionProvider interface for text generation.
 */
@Provider(AIProviderType.OPENAI)
@Injectable()
export class OpenAIProvider extends BaseAIProvider implements ICompletionProvider {
  private client: AxiosInstance;

  private readonly models: IModelInfo[] = [
    {
      id: 'gpt-4',
      name: 'GPT-4',
      provider: AIProviderType.OPENAI,
      capabilities: {
        textGeneration: true,
        imageUnderstanding: false,
        functionCalling: true,
        streaming: true,
        embeddings: false,
        maxContextTokens: 8192,
      },
      costPerInputToken: 0.03,
      costPerOutputToken: 0.06,
    },
    {
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo',
      provider: AIProviderType.OPENAI,
      capabilities: {
        textGeneration: true,
        imageUnderstanding: true,
        functionCalling: true,
        streaming: true,
        embeddings: false,
        maxContextTokens: 128000,
      },
      costPerInputToken: 0.01,
      costPerOutputToken: 0.03,
    },
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      provider: AIProviderType.OPENAI,
      capabilities: {
        textGeneration: true,
        imageUnderstanding: false,
        functionCalling: true,
        streaming: true,
        embeddings: false,
        maxContextTokens: 16385,
      },
      costPerInputToken: 0.0005,
      costPerOutputToken: 0.0015,
    },
  ];

  constructor() {
    super(OpenAIProvider.name);
  }

  getProviderType(): AIProviderType {
    return AIProviderType.OPENAI;
  }

  protected async initializeProvider(): Promise<void> {
    const config = this.getConfig();
    
    this.client = axios.create({
      baseURL: config.apiEndpoint || 'https://api.openai.com/v1',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        ...(config.organizationId && { 'OpenAI-Organization': config.organizationId }),
      },
      timeout: config.timeout || 60000,
    });

    this.logger.log('OpenAI provider initialized');
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
      const result = await this.client.post('/chat/completions', {
        model: request.model,
        messages: request.messages.map(m => ({
          role: m.role,
          content: m.content,
          name: m.name,
        })),
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        top_p: request.topP,
        stream: false,
        stop: request.stop,
      });
      return result.data;
    });

    return this.transformResponse(response);
  }

  async *streamComplete(request: CompletionRequestDto): AsyncGenerator<any> {
    if (!this.client) {
      throw new Error('Provider not initialized');
    }

    const response = await this.client.post('/chat/completions', {
      model: request.model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
        name: m.name,
      })),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
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
      await this.client.get('/models');
      return true;
    } catch (error) {
      this.logger.warn('OpenAI health check failed:', error.message);
      return false;
    }
  }

  private transformResponse(data: any): CompletionResponseDto {
    return {
      id: data.id,
      object: data.object,
      created: data.created,
      model: data.model,
      provider: AIProviderType.OPENAI,
      choices: data.choices.map((choice: any) => ({
        index: choice.index,
        message: {
          role: choice.message.role as MessageRole,
          content: choice.message.content,
        },
        finishReason: choice.finish_reason,
      })),
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
    };
  }
}
