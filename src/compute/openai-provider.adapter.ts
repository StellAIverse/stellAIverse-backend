import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance, AxiosError } from "axios";
import {
  OpenAIRequest,
  OpenAIResponse,
  OpenAIError,
  NormalizedPrompt,
  NormalizedResponse,
  ProviderError,
} from "./dto/provider.dto";

@Injectable()
export class OpenAIProviderAdapter {
  private readonly logger = new Logger(OpenAIProviderAdapter.name);
  private readonly client: AxiosInstance;
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>("OPENAI_API_KEY");
    this.baseURL = this.configService.get<string>(
      "OPENAI_BASE_URL",
      "https://api.openai.com/v1",
    );
    this.maxRetries = this.configService.get<number>("OPENAI_MAX_RETRIES", 3);
    this.retryDelay = this.configService.get<number>(
      "OPENAI_RETRY_DELAY",
      1000,
    );

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: 60000, // 60 seconds
    });
  }

  /**
   * Normalize internal prompt format to OpenAI format
   */
  normalizePrompt(prompt: NormalizedPrompt): OpenAIRequest {
    this.logger.debug("Normalizing prompt for OpenAI");

    // Validate required fields
    if (!prompt.messages || prompt.messages.length === 0) {
      throw new Error("Messages array is required and cannot be empty");
    }

    // Build OpenAI request
    const request: OpenAIRequest = {
      model: prompt.model || "gpt-4-turbo-preview",
      messages: prompt.messages.map((msg) => ({
        role: this.normalizeRole(msg.role),
        content: msg.content,
        ...(msg.name && { name: msg.name }),
      })),
    };

    // Add optional parameters
    if (prompt.temperature !== undefined) {
      request.temperature = Math.max(0, Math.min(2, prompt.temperature));
    }

    if (prompt.maxTokens !== undefined) {
      request.max_tokens = prompt.maxTokens;
    }

    if (prompt.topP !== undefined) {
      request.top_p = Math.max(0, Math.min(1, prompt.topP));
    }

    if (prompt.frequencyPenalty !== undefined) {
      request.frequency_penalty = Math.max(
        -2,
        Math.min(2, prompt.frequencyPenalty),
      );
    }

    if (prompt.presencePenalty !== undefined) {
      request.presence_penalty = Math.max(
        -2,
        Math.min(2, prompt.presencePenalty),
      );
    }

    if (prompt.stop) {
      request.stop = Array.isArray(prompt.stop) ? prompt.stop : [prompt.stop];
    }

    if (prompt.stream !== undefined) {
      request.stream = prompt.stream;
    }

    if (prompt.user) {
      request.user = prompt.user;
    }

    this.logger.debug(
      `Normalized prompt with ${request.messages.length} messages`,
    );
    return request;
  }

  /**
   * Normalize role names to OpenAI's expected format
   */
  private normalizeRole(role: string): "system" | "user" | "assistant" {
    const normalizedRole = role.toLowerCase();
    if (["system", "user", "assistant"].includes(normalizedRole)) {
      return normalizedRole as "system" | "user" | "assistant";
    }
    this.logger.warn(`Unknown role "${role}", defaulting to "user"`);
    return "user";
  }

  /**
   * Validate OpenAI response structure
   */
  validateResponse(response: any): OpenAIResponse {
    this.logger.debug("Validating OpenAI response");

    if (!response) {
      throw new Error("Response is null or undefined");
    }

    if (!response.id || typeof response.id !== "string") {
      throw new Error('Response missing valid "id" field');
    }

    if (!response.object || response.object !== "chat.completion") {
      throw new Error(
        `Invalid response object type: expected "chat.completion", got "${response.object}"`,
      );
    }

    if (!response.created || typeof response.created !== "number") {
      throw new Error('Response missing valid "created" timestamp');
    }

    if (!response.model || typeof response.model !== "string") {
      throw new Error('Response missing valid "model" field');
    }

    if (!Array.isArray(response.choices) || response.choices.length === 0) {
      throw new Error('Response missing valid "choices" array');
    }

    // Validate each choice
    response.choices.forEach((choice: any, index: number) => {
      if (!choice.message) {
        throw new Error(`Choice ${index} missing "message" field`);
      }

      if (!choice.message.role || typeof choice.message.role !== "string") {
        throw new Error(`Choice ${index} message missing valid "role"`);
      }

      if (
        choice.message.content === undefined ||
        choice.message.content === null
      ) {
        throw new Error(`Choice ${index} message missing "content"`);
      }

      if (
        choice.finish_reason &&
        !["stop", "length", "content_filter", "function_call"].includes(
          choice.finish_reason,
        )
      ) {
        this.logger.warn(
          `Choice ${index} has unknown finish_reason: ${choice.finish_reason}`,
        );
      }
    });

    if (!response.usage) {
      this.logger.warn("Response missing usage information");
    } else {
      if (
        typeof response.usage.prompt_tokens !== "number" ||
        typeof response.usage.completion_tokens !== "number" ||
        typeof response.usage.total_tokens !== "number"
      ) {
        this.logger.warn("Response has invalid usage information");
      }
    }

    this.logger.debug("Response validation successful");
    return response as OpenAIResponse;
  }

  /**
   * Convert OpenAI response to normalized format
   */
  normalizeResponse(response: OpenAIResponse): NormalizedResponse {
    const choice = response.choices[0];

    return {
      id: response.id,
      provider: "openai",
      model: response.model,
      content: choice.message.content,
      role: choice.message.role,
      finishReason: choice.finish_reason,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
      created: new Date(response.created * 1000),
      raw: response,
    };
  }

  /**
   * Handle OpenAI API errors
   */
  handleError(error: any): ProviderError {
    this.logger.error("OpenAI API error occurred", error);

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<OpenAIError>;

      if (axiosError.response) {
        const status = axiosError.response.status;
        const data = axiosError.response.data;

        const providerError: ProviderError = {
          provider: "openai",
          code: data?.error?.code || `HTTP_${status}`,
          message: data?.error?.message || axiosError.message,
          status,
          type: data?.error?.type || "unknown_error",
          param: data?.error?.param,
          retryable: this.isRetryableError(status),
        };

        // Log specific error types
        if (status === 401) {
          this.logger.error("OpenAI authentication failed - check API key");
        } else if (status === 429) {
          this.logger.warn("OpenAI rate limit exceeded");
        } else if (status === 500 || status === 503) {
          this.logger.warn("OpenAI service unavailable");
        }

        return providerError;
      }

      // Network or timeout error
      return {
        provider: "openai",
        code: "NETWORK_ERROR",
        message: axiosError.message,
        status: 0,
        type: "network_error",
        retryable: true,
      };
    }

    // Unknown error
    return {
      provider: "openai",
      code: "UNKNOWN_ERROR",
      message: error.message || "An unknown error occurred",
      status: 0,
      type: "unknown_error",
      retryable: false,
    };
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(status: number): boolean {
    // Retry on rate limits, server errors, and timeouts
    return [408, 429, 500, 502, 503, 504].includes(status);
  }

  /**
   * Execute request with retry logic
   */
  async executeWithRetry(
    prompt: NormalizedPrompt,
    attempt: number = 1,
  ): Promise<NormalizedResponse> {
    try {
      this.logger.debug(`Executing OpenAI request (attempt ${attempt})`);

      const request = this.normalizePrompt(prompt);
      const response = await this.client.post("/chat/completions", request);

      const validatedResponse = this.validateResponse(response.data);
      return this.normalizeResponse(validatedResponse);
    } catch (error) {
      const providerError = this.handleError(error);

      // Retry if error is retryable and we haven't exceeded max retries
      if (providerError.retryable && attempt < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        this.logger.warn(
          `Retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`,
        );

        await this.sleep(delay);
        return this.executeWithRetry(prompt, attempt + 1);
      }

      // Max retries exceeded or non-retryable error
      throw providerError;
    }
  }

  /**
   * Main method to execute a request
   */
  async execute(prompt: NormalizedPrompt): Promise<NormalizedResponse> {
    return this.executeWithRetry(prompt);
  }

  /**
   * Health check method
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get("/models");
      return response.status === 200;
    } catch (error) {
      this.logger.error("OpenAI health check failed", error);
      return false;
    }
  }

  /**
   * Utility sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
