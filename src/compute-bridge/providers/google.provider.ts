import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { BaseAIProvider } from '../base-provider.service';
import { AIProviderType, ICompletionProvider, IModelInfo } from '../provider.interface';
import { CompletionRequestDto, CompletionResponseDto, MessageRole } from '../base.dto';
import { Provider } from '../provider.decorator';

/**
 * Google AI Provider Adapter
 *
 * Adapter for Google's Gemini models via Vertex AI or Gemini API
 * Implements the ICompletionProvider interface for text generation.
 */
@Provider(AIProviderType.GOOGLE)
@Injectable()
export class GoogleProvider extends BaseAIProvider implements ICompletionProvider {
  private client: AxiosInstance;
  private apiVersion: string = 'v1';

  private readonly models: IModelInfo[] = [
    {
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      provider: AIProviderType.GOOGLE,
      capabilities: {
        textGeneration: true,
        imageUnderstanding: true,
        functionCalling: true,
        streaming: true,
        embeddings: false,
        maxContextTokens: 1000000,
      },
      costPerInputToken: 0.0035,
      costPerOutputToken: 0.0105,
    },
    {
      id: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      provider: AIProviderType.GOOGLE,
      capabilities: {
        textGeneration: true,
        imageUnderstanding: true,
        functionCalling: true,
        streaming: true,
        embeddings: false,
        maxContextTokens: 1000000,
      },
      costPerInputToken: 0.00035,
      costPerOutputToken: 0.00105,
    },
    {
      id: 'gemini-1.0-pro',
      name: 'Gemini 1.0 Pro',
      provider: AIProviderType.GOOGLE,
      capabilities: {
        textGeneration: true,
        imageUnderstanding: false,
        functionCalling: true,
        streaming: true,
        embeddings: false,
        maxContextTokens: 32768,
      },
      costPerInputToken: 0.0005,
      costPerOutputToken: 0.0015,
    },
  ];

  constructor() {
    super(GoogleProvider.name);
  }

  getProviderType(): AIProviderType {
    return AIProviderType.GOOGLE;
  }

  protected async initializeProvider(): Promise<void> {
    const config = this.getConfig();
    
    // Determine if using Vertex AI or Gemini API
    const isVertexAI = config.apiEndpoint?.includes('vertexai.googleapis.com');
    
    if (isVertexAI) {
      // Vertex AI endpoint format
      this.client = axios.create({
        baseURL: config.apiEndpoint,
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: config.timeout || 60000,
      });
    } else {
      // Gemini API endpoint
      this.client = axios.create({
        baseURL: config.apiEndpoint || 'https://generativelanguage.googleapis.com/v1beta',
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: config.timeout || 60000,
      });
    }

    this.logger.log('Google provider initialized');
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

    const config = this.getConfig();
    const isVertexAI = config.apiEndpoint?.includes('vertexai.googleapis.com');

    const response = await this.executeWithRetry(async () => {
      const contents = this.convertMessagesToContents(request.messages);
      
      let url: string;
      let body: any;

      if (isVertexAI) {
        // Vertex AI format
        url = `/models/${request.model}:generateContent`;
        body = {
          contents,
          generationConfig: {
            temperature: request.temperature,
            maxOutputTokens: request.maxTokens,
            topP: request.topP,
            stopSequences: request.stop,
          },
        };
      } else {
        // Gemini API format
        url = `/models/${request.model}:generateContent?key=${config.apiKey}`;
        body = {
          contents,
          generationConfig: {
            temperature: request.temperature,
            maxOutputTokens: request.maxTokens,
            topP: request.topP,
            stopSequences: request.stop,
          },
        };
      }

      const result = await this.client.post(url, body);
      return result.data;
    });

    return this.transformResponse(response);
  }

  async *streamComplete(request: CompletionRequestDto): AsyncGenerator<any> {
    if (!this.client) {
      throw new Error('Provider not initialized');
    }

    const config = this.getConfig();
    const isVertexAI = config.apiEndpoint?.includes('vertexai.googleapis.com');
    const contents = this.convertMessagesToContents(request.messages);

    let url: string;
    let body: any;

    if (isVertexAI) {
      url = `/models/${request.model}:streamGenerateContent`;
      body = {
        contents,
        generationConfig: {
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens,
          topP: request.topP,
        },
      };
    } else {
      url = `/models/${request.model}:streamGenerateContent?key=${config.apiKey}`;
      body = {
        contents,
        generationConfig: {
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens,
          topP: request.topP,
        },
      };
    }

    const response = await this.client.post(url, body, {
      responseType: 'stream',
    });

    for await (const chunk of response.data) {
      try {
        const parsed = JSON.parse(chunk.toString());
        yield parsed;
      } catch {
        // Skip invalid JSON
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Check by listing models or a simple request
      const config = this.getConfig();
      if (config.apiEndpoint?.includes('vertexai.googleapis.com')) {
        await this.client.get('/models');
      } else {
        // For Gemini API, try a minimal request
        await this.client.get(`/models?key=${config.apiKey}&pageSize=1`);
      }
      return true;
    } catch (error: any) {
      this.logger.warn('Google health check failed:', error.message);
      return false;
    }
  }

  /**
   * Convert standard messages to Google content format
   */
  private convertMessagesToContents(messages: any[]): any[] {
    const contents = [];
    let currentRole = '';
    let currentParts: any[] = [];

    for (const message of messages) {
      const role = message.role === MessageRole.ASSISTANT ? 'model' : 'user';

      if (role !== currentRole && currentParts.length > 0) {
        contents.push({
          role: currentRole,
          parts: currentParts,
        });
        currentParts = [];
      }

      currentRole = role;
      currentParts.push({ text: message.content });
    }

    if (currentParts.length > 0) {
      contents.push({
        role: currentRole,
        parts: currentParts,
      });
    }

    return contents;
  }

  private transformResponse(data: any): CompletionResponseDto {
    const candidate = data.candidates?.[0];
    const content = candidate?.content;
    
    return {
      id: data.id || `google-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: data.modelVersion || 'gemini',
      provider: AIProviderType.GOOGLE,
      choices: [{
        index: 0,
        message: {
          role: MessageRole.ASSISTANT,
          content: content?.parts?.map((p: any) => p.text).join('') || '',
        },
        finishReason: candidate?.finishReason?.toLowerCase() || 'stop',
      }],
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      },
    };
  }
}
