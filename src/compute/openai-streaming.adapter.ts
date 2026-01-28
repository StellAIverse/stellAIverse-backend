import { Injectable, Logger } from "@nestjs/common";
import { OpenAIProviderAdapter } from "./openai-provider.adapter";
import { NormalizedPrompt, OpenAIStreamChunk } from "./dto/provider.dto";

/**
 * Extension for OpenAI Provider Adapter with streaming support
 * This can be integrated into the main adapter or used separately
 */
@Injectable()
export class OpenAIStreamingAdapter extends OpenAIProviderAdapter {
  private readonly streamLogger = new Logger("OpenAIStreamingAdapter");

  /**
   * Execute streaming request
   * Returns an async generator that yields chunks as they arrive
   */
  async *executeStream(
    prompt: NormalizedPrompt,
  ): AsyncGenerator<OpenAIStreamChunk, void, unknown> {
    try {
      this.streamLogger.debug("Starting streaming request");

      const request = this.normalizePrompt(prompt);
      request.stream = true;

      const response = await (this as any).client.post(
        "/chat/completions",
        request,
        {
          responseType: "stream",
        },
      );

      let buffer = "";

      for await (const chunk of response.data) {
        buffer += chunk.toString();

        // Process complete lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmedLine = line.trim();

          // Skip empty lines and comments
          if (!trimmedLine || trimmedLine.startsWith(":")) {
            continue;
          }

          // Parse SSE format: "data: {...}"
          if (trimmedLine.startsWith("data: ")) {
            const data = trimmedLine.slice(6);

            // Check for end of stream
            if (data === "[DONE]") {
              this.streamLogger.debug("Stream completed");
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const validated = this.validateStreamChunk(parsed);
              yield validated;
            } catch (error) {
              this.streamLogger.error("Failed to parse stream chunk", error);
              // Continue processing other chunks
            }
          }
        }
      }
    } catch (error) {
      this.streamLogger.error("Streaming error occurred", error);
      throw this.handleError(error);
    }
  }

  /**
   * Validate streaming chunk structure
   */
  private validateStreamChunk(chunk: any): OpenAIStreamChunk {
    if (!chunk.id || typeof chunk.id !== "string") {
      throw new Error('Stream chunk missing valid "id" field');
    }

    if (!chunk.object || chunk.object !== "chat.completion.chunk") {
      throw new Error(
        `Invalid stream chunk object type: expected "chat.completion.chunk", got "${chunk.object}"`,
      );
    }

    if (!Array.isArray(chunk.choices)) {
      throw new Error('Stream chunk missing valid "choices" array');
    }

    return chunk as OpenAIStreamChunk;
  }

  /**
   * Helper method to collect full response from stream
   * Useful for testing or when you need the complete response
   */
  async collectStreamResponse(prompt: NormalizedPrompt): Promise<string> {
    let fullContent = "";

    for await (const chunk of this.executeStream(prompt)) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        fullContent += delta.content;
      }
    }

    return fullContent;
  }

  /**
   * Stream with callback for each chunk
   * Alternative interface that might be easier to use in some cases
   */
  async streamWithCallback(
    prompt: NormalizedPrompt,
    onChunk: (content: string) => void,
    onComplete?: () => void,
    onError?: (error: any) => void,
  ): Promise<void> {
    try {
      for await (const chunk of this.executeStream(prompt)) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          onChunk(delta.content);
        }

        // Check for completion
        if (chunk.choices[0]?.finish_reason) {
          this.streamLogger.debug(
            `Stream finished: ${chunk.choices[0].finish_reason}`,
          );
        }
      }

      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      this.streamLogger.error("Stream callback error", error);
      if (onError) {
        onError(this.handleError(error));
      } else {
        throw error;
      }
    }
  }
}
