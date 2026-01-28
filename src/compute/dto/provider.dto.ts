/**
 * Internal normalized prompt format
 * This is what your application uses internally
 */
export interface NormalizedPrompt {
  messages: Message[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string | string[];
  stream?: boolean;
  user?: string;
}

export interface Message {
  role: string;
  content: string;
  name?: string;
}

/**
 * OpenAI-specific request format
 */
export interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  stream?: boolean;
  user?: string;
}

export interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
}

/**
 * OpenAI-specific response format
 */
export interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage?: OpenAIUsage;
  system_fingerprint?: string;
}

export interface OpenAIChoice {
  index: number;
  message: OpenAIMessage;
  finish_reason: string;
  logprobs?: any;
}

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * Internal normalized response format
 */
export interface NormalizedResponse {
  id: string;
  provider: string;
  model: string;
  content: string;
  role: string;
  finishReason: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  created: Date;
  raw?: any;
}

/**
 * OpenAI error format
 */
export interface OpenAIError {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

/**
 * Normalized provider error
 */
export interface ProviderError {
  provider: string;
  code: string;
  message: string;
  status: number;
  type: string;
  param?: string;
  retryable: boolean;
}

/**
 * Streaming response chunk
 */
export interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }>;
}
