import {
  Injectable,
  Logger,
  OnModuleInit,
  NotFoundException,
} from "@nestjs/common";
import {
  IComputeProvider,
  ProviderType,
} from "./interfaces/provider.interface";
import { OpenAIAdapter } from "./providers/openai.adapter";
import { MockAdapter } from "./providers/mock.adapter";

/**
 * ComputeBridgeService
 *
 * Orchestrates compute requests across different AI providers.
 * Follows the Strategy/Adapter pattern to remain provider-agnostic.
 */
@Injectable()
export class ComputeBridgeService implements OnModuleInit {
  private readonly logger = new Logger(ComputeBridgeService.name);
  private readonly providers = new Map<ProviderType, IComputeProvider>();

  constructor(
    private readonly openaiAdapter: OpenAIAdapter,
    private readonly mockAdapter: MockAdapter,
  ) {}

  async onModuleInit() {
    this.logger.log("Initializing ComputeBridge providers...");

    // Register providers
    this.providers.set(ProviderType.OPENAI, this.openaiAdapter);
    this.providers.set(ProviderType.MOCK, this.mockAdapter);

    // Basic initialization for each provider
    for (const [type, provider] of this.providers.entries()) {
      try {
        await provider.initialize();
        this.logger.log(`Provider ${type} initialized successfully`);
      } catch (error) {
        this.logger.error(
          `Failed to initialize provider ${type}: ${error.message}`,
        );
      }
    }
  }

  /**
   * Execute a compute request with a specific provider
   */
  async execute(type: ProviderType, request: any): Promise<any> {
    const provider = this.providers.get(type);

    if (!provider) {
      this.logger.error(`Provider ${type} not found or not registered`);
      throw new NotFoundException(`Provider ${type} not found`);
    }

    this.logger.log(`Routing request to provider: ${type}`);
    return provider.execute(request);
  }

  /**
   * Get the status of all registered providers
   */
  async getProvidersStatus(): Promise<
    Record<string, { status: string; healthy: boolean }>
  > {
    const statuses: Record<string, { status: string; healthy: boolean }> = {};

    for (const [type, provider] of this.providers.entries()) {
      statuses[type] = await provider.getStatus();
    }

    return statuses;
  }

  /**
   * List available provider types
   */
  getAvailableProviders(): ProviderType[] {
    return Array.from(this.providers.keys());
  }
}
