import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ComputeBridgeService } from "./compute-bridge.service";
import { ComputeBridgeController } from "./compute-bridge.controller";
import { ProviderRouterService } from "./router/provider-router.service";
import { ProviderHealthService } from "./router/provider-health.service";
import { CircuitBreakerService } from "./router/circuit-breaker.service";
import { ProviderMetricsService } from "./router/provider-metrics.service";
import { ProviderRegistry } from "./provider.registry";
import { MockProvider } from "./providers/mock.provider";
import { OpenAIProvider } from "./providers/openai.provider";
import { AnthropicProvider } from "./providers/anthropic.provider";
import { GoogleProvider } from "./providers/google.provider";
import { AIProviderType } from "./provider.interface";

// Orchestration imports
import { MultiProviderOrchestrationService } from "./orchestration/multi-provider-orchestration.service";
import { ConsensusService } from "./orchestration/consensus.service";
import { ResponseNormalizerService } from "./orchestration/response-normalizer.service";
import { AuditService } from "./orchestration/audit.service";
import { OrchestrationController } from "./orchestration/orchestration.controller";

/**
 * ComputeBridge Module
 *
 * Orchestrates AI provider calls across multiple providers.
 * Provides a unified interface for interacting with different AI services
 * while maintaining provider-specific implementations.
 *
 * Features:
 * - Multi-provider orchestration with parallel execution
 * - Consensus and voting for result reliability
 * - Comprehensive audit logging with signatures
 * - Runtime provider configuration
 * - Fallback and circuit breaker patterns
 *
 * @module ComputeBridgeModule
 */
@Module({
  imports: [ConfigModule],
  controllers: [ComputeBridgeController, OrchestrationController],
  providers: [
    // Core services
    ComputeBridgeService,
    ProviderRegistry,
    ProviderRouterService,
    ProviderHealthService,
    CircuitBreakerService,
    ProviderMetricsService,

    // Provider adapters
    MockProvider,
    OpenAIProvider,
    AnthropicProvider,
    GoogleProvider,

    // Orchestration services
    MultiProviderOrchestrationService,
    ConsensusService,
    ResponseNormalizerService,
    AuditService,
  ],
  exports: [
    ComputeBridgeService,
    ProviderRouterService,
    ProviderHealthService,
    CircuitBreakerService,
    ProviderMetricsService,

    // Export orchestration services
    MultiProviderOrchestrationService,
    ConsensusService,
    ResponseNormalizerService,
    AuditService,

    // Export provider adapters
    OpenAIProvider,
    AnthropicProvider,
    GoogleProvider,
  ],
})
export class ComputeBridgeModule implements OnModuleInit {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly mockProvider: MockProvider,
    private readonly openAIProvider: OpenAIProvider,
    private readonly anthropicProvider: AnthropicProvider,
    private readonly googleProvider: GoogleProvider,
  ) {}

  async onModuleInit() {
    // Register MockProvider with default config
    await this.registry.register(AIProviderType.CUSTOM, this.mockProvider, {
      type: AIProviderType.CUSTOM,
      apiKey: "mock-key",
    });

    this.logger.log(
      "ComputeBridge module initialized with multi-provider orchestration",
    );
  }

  private readonly logger = console;
}
