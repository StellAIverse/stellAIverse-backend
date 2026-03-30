import { Module, OnModuleInit } from "@nestjs/common";
import { ComputeBridgeService } from "./compute-bridge.service";
import { ComputeBridgeController } from "./compute-bridge.controller";
import { ProviderRouterService } from "./router/provider-router.service";
import { ProviderHealthService } from "./router/provider-health.service";
import { CircuitBreakerService } from "./router/circuit-breaker.service";
import { ProviderMetricsService } from "./router/provider-metrics.service";
import { ProviderRegistry } from "./provider.registry";
import { MockProvider } from "./providers/mock.provider";
import { AIProviderType } from "./provider.interface";

/**
 * ComputeBridge Module
 *
 * Orchestrates AI provider calls across multiple providers.
 * Provides a unified interface for interacting with different AI services
 * while maintaining provider-specific implementations.
 *
 * @module ComputeBridgeModule
 */
@Module({
  imports: [],
  controllers: [ComputeBridgeController],
  providers: [
    ComputeBridgeService,
    ProviderRegistry,
    ProviderRouterService,
    ProviderHealthService,
    CircuitBreakerService,
    ProviderMetricsService,
  ],
  exports: [
    ComputeBridgeService,
    ProviderRouterService,
    ProviderHealthService,
    CircuitBreakerService,
    ProviderMetricsService,
  ],
})
export class ComputeBridgeModule implements OnModuleInit {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly mockProvider: MockProvider,
  ) {}

  async onModuleInit() {
    // Register MockProvider with default config
    await this.registry.register(AIProviderType.CUSTOM, this.mockProvider, {
      type: AIProviderType.CUSTOM,
      apiKey: "mock-key",
    });
  }
}
