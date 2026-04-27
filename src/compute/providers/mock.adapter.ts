import { Injectable, Logger } from "@nestjs/common";
import {
  IComputeProvider,
  ProviderType,
} from "../interfaces/provider.interface";

@Injectable()
export class MockAdapter implements IComputeProvider {
  private readonly logger = new Logger(MockAdapter.name);
  private initialized = false;

  async initialize(_config: any = {}): Promise<void> {
    this.initialized = true;
    this.logger.log("Mock Provider initialized");
  }

  async execute(request: any): Promise<any> {
    if (!this.initialized) {
      await this.initialize();
    }

    this.logger.debug(`Executing mock request for model: ${request.model}`);
    return {
      id: "mock-response-id",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "This is a mock response from the Compute Bridge.",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 10,
        total_tokens: 20,
      },
      mock: true,
    };
  }

  async getStatus(): Promise<{ status: string; healthy: boolean }> {
    return { status: "ready", healthy: true };
  }

  getProviderType(): ProviderType {
    return ProviderType.MOCK;
  }
}
