import { Injectable, Logger } from '@nestjs/common';
import { AIProviderType } from '../provider.interface';
import { NormalizedProviderResponse } from './orchestration.interface';

/**
 * Response Normalizer Service
 *
 * Normalizes responses from different AI providers into a common schema.
 * This enables consistent handling of responses across all providers
 * for aggregation, consensus, and comparison.
 */
@Injectable()
export class ResponseNormalizerService {
  private readonly logger = new Logger(ResponseNormalizerService.name);

  /**
   * Normalize a provider response to the common schema
   */
  normalize(
    provider: AIProviderType,
    rawResponse: any,
    latencyMs: number,
  ): NormalizedProviderResponse {
    try {
      switch (provider) {
        case AIProviderType.OPENAI:
          return this.normalizeOpenAIResponse(rawResponse, latencyMs);
        case AIProviderType.ANTHROPIC:
          return this.normalizeAnthropicResponse(rawResponse, latencyMs);
        case AIProviderType.GOOGLE:
          return this.normalizeGoogleResponse(rawResponse, latencyMs);
        case AIProviderType.HUGGINGFACE:
          return this.normalizeHuggingFaceResponse(rawResponse, latencyMs);
        case AIProviderType.CUSTOM:
          return this.normalizeCustomResponse(rawResponse, latencyMs);
        default:
          return this.normalizeGenericResponse(provider, rawResponse, latencyMs);
      }
    } catch (error: any) {
      this.logger.error(`Failed to normalize ${provider} response:`, error);
      return this.createErrorResponse(provider, error.message, latencyMs);
    }
  }

  /**
   * Normalize OpenAI response
   */
  private normalizeOpenAIResponse(
    rawResponse: any,
    latencyMs: number,
  ): NormalizedProviderResponse {
    const choice = rawResponse.choices?.[0];
    
    return {
      id: rawResponse.id || `openai-${Date.now()}`,
      provider: AIProviderType.OPENAI,
      model: rawResponse.model || 'unknown',
      content: this.extractContent(choice?.message) || '',
      rawResponse,
      usage: {
        promptTokens: rawResponse.usage?.prompt_tokens || 0,
        completionTokens: rawResponse.usage?.completion_tokens || 0,
        totalTokens: rawResponse.usage?.total_tokens || 0,
      },
      latencyMs,
      timestamp: new Date(),
      isValid: true,
    };
  }

  /**
   * Normalize Anthropic Claude response
   */
  private normalizeAnthropicResponse(
    rawResponse: any,
    latencyMs: number,
  ): NormalizedProviderResponse {
    return {
      id: rawResponse.id || `anthropic-${Date.now()}`,
      provider: AIProviderType.ANTHROPIC,
      model: rawResponse.model || 'unknown',
      content: this.extractContent(rawResponse.content) || '',
      rawResponse,
      usage: {
        promptTokens: rawResponse.usage?.input_tokens || 0,
        completionTokens: rawResponse.usage?.output_tokens || 0,
        totalTokens: 
          (rawResponse.usage?.input_tokens || 0) + 
          (rawResponse.usage?.output_tokens || 0),
      },
      latencyMs,
      timestamp: new Date(),
      isValid: true,
    };
  }

  /**
   * Normalize Google (Gemini/Vertex AI) response
   */
  private normalizeGoogleResponse(
    rawResponse: any,
    latencyMs: number,
  ): NormalizedProviderResponse {
    const candidate = rawResponse.candidates?.[0];
    const content = candidate?.content;
    
    return {
      id: rawResponse.id || `google-${Date.now()}`,
      provider: AIProviderType.GOOGLE,
      model: rawResponse.modelVersion || 'unknown',
      content: this.extractContent(content) || '',
      rawResponse,
      usage: {
        promptTokens: rawResponse.usageMetadata?.promptTokenCount || 0,
        completionTokens: rawResponse.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: rawResponse.usageMetadata?.totalTokenCount || 0,
      },
      latencyMs,
      timestamp: new Date(),
      isValid: true,
    };
  }

  /**
   * Normalize Hugging Face response
   */
  private normalizeHuggingFaceResponse(
    rawResponse: any,
    latencyMs: number,
  ): NormalizedProviderResponse {
    // Hugging Face can have various response formats depending on the model
    const content = Array.isArray(rawResponse) 
      ? rawResponse[0]?.generated_text 
      : rawResponse.generated_text || rawResponse.text || JSON.stringify(rawResponse);
    
    return {
      id: `huggingface-${Date.now()}`,
      provider: AIProviderType.HUGGINGFACE,
      model: rawResponse.model || 'unknown',
      content: content || '',
      rawResponse,
      usage: {
        promptTokens: rawResponse.usage?.prompt_tokens || 0,
        completionTokens: rawResponse.usage?.completion_tokens || 0,
        totalTokens: rawResponse.usage?.total_tokens || 0,
      },
      latencyMs,
      timestamp: new Date(),
      isValid: true,
    };
  }

  /**
   * Normalize custom provider response
   */
  private normalizeCustomResponse(
    rawResponse: any,
    latencyMs: number,
  ): NormalizedProviderResponse {
    return {
      id: rawResponse.id || `custom-${Date.now()}`,
      provider: AIProviderType.CUSTOM,
      model: rawResponse.model || 'unknown',
      content: this.extractContent(rawResponse) || '',
      rawResponse,
      usage: {
        promptTokens: rawResponse.usage?.prompt_tokens || 0,
        completionTokens: rawResponse.usage?.completion_tokens || 0,
        totalTokens: rawResponse.usage?.total_tokens || 0,
      },
      latencyMs,
      timestamp: new Date(),
      isValid: true,
    };
  }

  /**
   * Normalize generic response (fallback)
   */
  private normalizeGenericResponse(
    provider: AIProviderType,
    rawResponse: any,
    latencyMs: number,
  ): NormalizedProviderResponse {
    return {
      id: rawResponse.id || `${provider}-${Date.now()}`,
      provider,
      model: rawResponse.model || 'unknown',
      content: this.extractContent(rawResponse) || JSON.stringify(rawResponse),
      rawResponse,
      usage: {
        promptTokens: rawResponse.usage?.prompt_tokens || 0,
        completionTokens: rawResponse.usage?.completion_tokens || 0,
        totalTokens: rawResponse.usage?.total_tokens || 0,
      },
      latencyMs,
      timestamp: new Date(),
      isValid: true,
    };
  }

  /**
   * Create an error response
   */
  private createErrorResponse(
    provider: AIProviderType,
    error: string,
    latencyMs: number,
  ): NormalizedProviderResponse {
    return {
      id: `${provider}-error-${Date.now()}`,
      provider,
      model: 'unknown',
      content: '',
      rawResponse: null,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      latencyMs,
      timestamp: new Date(),
      isValid: false,
      error,
    };
  }

  /**
   * Extract text content from various message formats
   */
  private extractContent(message: any): string | null {
    if (!message) return null;
    
    // Direct string content
    if (typeof message === 'string') {
      return message;
    }
    
    // OpenAI/Anthropic style message
    if (message.content) {
      if (typeof message.content === 'string') {
        return message.content;
      }
      // Handle content array (multimodal)
      if (Array.isArray(message.content)) {
        return message.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('');
      }
    }
    
    // Google style parts
    if (message.parts) {
      if (Array.isArray(message.parts)) {
        return message.parts
          .filter((p: any) => p.text)
          .map((p: any) => p.text)
          .join('');
      }
    }
    
    // Direct text field
    if (message.text) {
      return message.text;
    }
    
    // Generated text (Hugging Face)
    if (message.generated_text) {
      return message.generated_text;
    }
    
    return null;
  }

  /**
   * Compare two responses for similarity
   * Returns similarity score between 0 and 1
   */
  calculateSimilarity(response1: NormalizedProviderResponse, response2: NormalizedProviderResponse): number {
    const text1 = response1.content.toLowerCase().trim();
    const text2 = response2.content.toLowerCase().trim();
    
    // Exact match
    if (text1 === text2) return 1.0;
    
    // Empty strings
    if (!text1 || !text2) return 0.0;
    
    // Jaccard similarity on word sets
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Calculate semantic similarity using simple heuristics
   * For production, consider using embeddings or more sophisticated methods
   */
  calculateSemanticSimilarity(response1: NormalizedProviderResponse, response2: NormalizedProviderResponse): number {
    const text1 = response1.content.toLowerCase().trim();
    const text2 = response2.content.toLowerCase().trim();
    
    // Normalize whitespace
    const normalized1 = text1.replace(/\s+/g, ' ');
    const normalized2 = text2.replace(/\s+/g, ' ');
    
    // Check for substring relationship
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      const longer = Math.max(normalized1.length, normalized2.length);
      const shorter = Math.min(normalized1.length, normalized2.length);
      return shorter / longer;
    }
    
    // Word overlap with position weighting
    const words1 = normalized1.split(' ');
    const words2 = normalized2.split(' ');
    
    let matchScore = 0;
    const maxLength = Math.max(words1.length, words2.length);
    
    for (let i = 0; i < Math.min(words1.length, words2.length); i++) {
      if (words1[i] === words2[i]) {
        // Exact position match gets higher score
        matchScore += 1.5;
      } else if (words2.includes(words1[i])) {
        // Word exists but different position
        matchScore += 0.5;
      }
    }
    
    return Math.min(matchScore / maxLength, 1.0);
  }
}
