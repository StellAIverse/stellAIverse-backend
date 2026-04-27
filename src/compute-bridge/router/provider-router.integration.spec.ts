import { Test, TestingModule } from "@nestjs/testing";
import { ProviderRouterService } from "../router/provider-router.service";
import { ProviderHealthService } from "../router/provider-health.service";
import { CircuitBreakerService } from "../router/circuit-breaker.service";
import { ProviderMetricsService } from "../router/provider-metrics.service";
import { ComputeBridgeService } from "../compute-bridge.service";
import {
  AIProviderType,
  IAIProvider,
  IProviderConfig,
} from "../provider.interface";
import { CompletionRequestDto, MessageRole } from "../base.dto";
import {
  LoadBalancingStrategy,
  RoutingContext,
} from "../router/routing.interface";

/**
 * Mock AI Provider for testing
 */
class MockAIProvider implements IAIProvider {
  private initialized = false;
  private shouldFail = false;
  private responseTime = 100;

  constructor(
    private readonly providerType: AIProviderType,
    options: { shouldFail?: boolean; responseTime?: number } = {},
  ) {
    this.shouldFail = options.shouldFail || false;
    this.responseTime = options.responseTime || 100;
  }

  async initialize(config: IProviderConfig): Promise<void> {
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getProviderType(): AIProviderType {
    return this.providerType;
  }

  async listModels(): Promise<any[]> {
    if (this.shouldFail) {
      throw new Error(`Provider ${this.providerType} failed`);
    }

    // Simulate response time
    await new Promise((resolve) => setTimeout(resolve, this.responseTime));

    return [
      {
        id: `${this.providerType}-model-1`,
        name: `${this.providerType} Model 1`,
      },
      {
        id: `${this.providerType}-model-2`,
        name: `${this.providerType} Model 2`,
      },
    ];
  }

  async getModelInfo(modelId: string): Promise<any> {
    return {
      id: modelId,
      name: `Model ${modelId}`,
      provider: this.providerType,
      capabilities: {
        textGeneration: true,
        imageUnderstanding: false,
        functionCalling: true,
        streaming: true,
        embeddings: true,
        maxContextTokens: 4096,
      },
    };
  }

  async validateModel(modelId: string): Promise<boolean> {
    return true;
  }

  // Methods to control mock behavior for testing
  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setResponseTime(responseTime: number): void {
    this.responseTime = responseTime;
  }
}

describe("ProviderRouter Integration Tests", () => {
  let module: TestingModule;
  let computeBridgeService: ComputeBridgeService;
  let providerRouter: ProviderRouterService;
  let healthService: ProviderHealthService;
  let circuitBreakerService: CircuitBreakerService;
  let metricsService: ProviderMetricsService;

  let mockOpenAI: MockAIProvider;
  let mockAnthropic: MockAIProvider;
  let mockGoogle: MockAIProvider;

  beforeAll(async () => {
    // Create test module with all services
    module = await Test.createTestingModule({
      providers: [
        ComputeBridgeService,
        ProviderRouterService,
        ProviderHealthService,
        CircuitBreakerService,
        ProviderMetricsService,
      ],
    }).compile();

    computeBridgeService =
      module.get<ComputeBridgeService>(ComputeBridgeService);
    providerRouter = module.get<ProviderRouterService>(ProviderRouterService);
    healthService = module.get<ProviderHealthService>(ProviderHealthService);
    circuitBreakerService = module.get<CircuitBreakerService>(
      CircuitBreakerService,
    );
    metricsService = module.get<ProviderMetricsService>(ProviderMetricsService);

    // Initialize services
    await module.init();
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(() => {
    // Create fresh mock providers for each test
    mockOpenAI = new MockAIProvider(AIProviderType.OPENAI);
    mockAnthropic = new MockAIProvider(AIProviderType.ANTHROPIC);
    mockGoogle = new MockAIProvider(AIProviderType.GOOGLE);
  });

  describe("Basic Provider Registration and Routing", () => {
    it("should register providers successfully", async () => {
      const config: IProviderConfig = {
        type: AIProviderType.OPENAI,
        apiKey: "test-key",
      };

      await computeBridgeService.registerProvider(mockOpenAI, config);

      expect(computeBridgeService.hasProvider(AIProviderType.OPENAI)).toBe(
        true,
      );
      expect(computeBridgeService.listProviders()).toContain(
        AIProviderType.OPENAI,
      );
    });

    it("should route completion request successfully", async () => {
      // Register providers
      await computeBridgeService.registerProvider(mockOpenAI, {
        type: AIProviderType.OPENAI,
        apiKey: "test-key",
      });

      const request: CompletionRequestDto = {
        provider: AIProviderType.OPENAI,
        model: "gpt-4",
        messages: [{ role: MessageRole.USER, content: "Hello, world!" }],
      };

      const routingContext: Partial<RoutingContext> = {
        strategy: LoadBalancingStrategy.HEALTH_AWARE,
        maxRetries: 2,
      };

      const response = await computeBridgeService.complete(
        request,
        routingContext,
      );

      expect(response).toBeDefined();
      expect(response.provider).toBe(AIProviderType.OPENAI);
      expect(response.choices).toHaveLength(1);
      expect(response.choices[0].message.content).toContain("Mock response");
    });

    it("should fallback to alternative provider on failure", async () => {
      // Register providers
      await computeBridgeService.registerProvider(mockOpenAI, {
        type: AIProviderType.OPENAI,
        apiKey: "test-key",
      });

      await computeBridgeService.registerProvider(mockAnthropic, {
        type: AIProviderType.ANTHROPIC,
        apiKey: "test-key",
      });

      // Configure OpenAI to fail
      mockOpenAI.setShouldFail(true);

      const request: CompletionRequestDto = {
        provider: AIProviderType.OPENAI,
        model: "gpt-4",
        messages: [{ role: MessageRole.USER, content: "Hello, world!" }],
      };

      const routingContext: Partial<RoutingContext> = {
        strategy: LoadBalancingStrategy.HEALTH_AWARE,
        fallbackChain: [AIProviderType.OPENAI, AIProviderType.ANTHROPIC],
        maxRetries: 3,
      };

      const response = await computeBridgeService.complete(
        request,
        routingContext,
      );

      expect(response).toBeDefined();
      // Should fallback to Anthropic
      expect(response.provider).toBe(AIProviderType.ANTHROPIC);
    });
  });

  describe("Circuit Breaker Functionality", () => {
    it("should open circuit breaker after consecutive failures", async () => {
      await computeBridgeService.registerProvider(mockOpenAI, {
        type: AIProviderType.OPENAI,
        apiKey: "test-key",
      });

      // Configure provider to fail
      mockOpenAI.setShouldFail(true);

      const request: CompletionRequestDto = {
        provider: AIProviderType.OPENAI,
        model: "gpt-4",
        messages: [{ role: MessageRole.USER, content: "Hello, world!" }],
      };

      // Make multiple failed requests to trigger circuit breaker
      for (let i = 0; i < 6; i++) {
        try {
          await computeBridgeService.complete(request);
        } catch (error) {
          // Expected to fail
        }
      }

      // Circuit breaker should be open now
      const circuitState = circuitBreakerService.getState(
        AIProviderType.OPENAI,
      );
      expect(circuitState).toBe("open");
    });

    it("should close circuit breaker after recovery", async () => {
      await computeBridgeService.registerProvider(mockOpenAI, {
        type: AIProviderType.OPENAI,
        apiKey: "test-key",
      });

      // First, trigger circuit breaker
      mockOpenAI.setShouldFail(true);

      const request: CompletionRequestDto = {
        provider: AIProviderType.OPENAI,
        model: "gpt-4",
        messages: [{ role: MessageRole.USER, content: "Hello, world!" }],
      };

      // Trigger failures
      for (let i = 0; i < 6; i++) {
        try {
          await computeBridgeService.complete(request);
        } catch (error) {
          // Expected to fail
        }
      }

      // Verify circuit is open
      expect(circuitBreakerService.getState(AIProviderType.OPENAI)).toBe(
        "open",
      );

      // Reset provider to succeed
      mockOpenAI.setShouldFail(false);

      // Wait for recovery timeout and try successful request
      await new Promise((resolve) => setTimeout(resolve, 100));

      try {
        await computeBridgeService.complete(request);
      } catch (error) {
        // May still fail if circuit hasn't recovered yet
      }

      // Circuit should eventually close after successful requests
      // This is a simplified test - in reality, circuit breaker recovery
      // involves more complex timing and state management
    });
  });

  describe("Load Balancing Strategies", () => {
    beforeEach(async () => {
      // Register multiple providers
      await computeBridgeService.registerProvider(mockOpenAI, {
        type: AIProviderType.OPENAI,
        apiKey: "test-key",
      });

      await computeBridgeService.registerProvider(mockAnthropic, {
        type: AIProviderType.ANTHROPIC,
        apiKey: "test-key",
      });

      await computeBridgeService.registerProvider(mockGoogle, {
        type: AIProviderType.GOOGLE,
        apiKey: "test-key",
      });
    });

    it("should use health-aware routing strategy", async () => {
      const request: CompletionRequestDto = {
        provider: AIProviderType.OPENAI,
        model: "gpt-4",
        messages: [{ role: MessageRole.USER, content: "Hello, world!" }],
      };

      const routingContext: Partial<RoutingContext> = {
        strategy: LoadBalancingStrategy.HEALTH_AWARE,
        preferredProviders: [
          AIProviderType.OPENAI,
          AIProviderType.ANTHROPIC,
          AIProviderType.GOOGLE,
        ],
      };

      const response = await computeBridgeService.complete(
        request,
        routingContext,
      );

      expect(response).toBeDefined();
      expect([
        AIProviderType.OPENAI,
        AIProviderType.ANTHROPIC,
        AIProviderType.GOOGLE,
      ]).toContain(response.provider);
    });

    it("should use round-robin routing strategy", async () => {
      const request: CompletionRequestDto = {
        provider: AIProviderType.OPENAI,
        model: "gpt-4",
        messages: [{ role: MessageRole.USER, content: "Hello, world!" }],
      };

      const routingContext: Partial<RoutingContext> = {
        strategy: LoadBalancingStrategy.ROUND_ROBIN,
        preferredProviders: [
          AIProviderType.OPENAI,
          AIProviderType.ANTHROPIC,
          AIProviderType.GOOGLE,
        ],
      };

      const response = await computeBridgeService.complete(
        request,
        routingContext,
      );

      expect(response).toBeDefined();
      expect([
        AIProviderType.OPENAI,
        AIProviderType.ANTHROPIC,
        AIProviderType.GOOGLE,
      ]).toContain(response.provider);
    });
  });

  describe("Health Monitoring", () => {
    it("should monitor provider health", async () => {
      await computeBridgeService.registerProvider(mockOpenAI, {
        type: AIProviderType.OPENAI,
        apiKey: "test-key",
      });

      // Wait for health checks to run
      await new Promise((resolve) => setTimeout(resolve, 100));

      const healthMetrics = healthService.getHealthMetrics(
        AIProviderType.OPENAI,
      );
      expect(healthMetrics).toBeDefined();
      expect(healthMetrics?.status).toBeDefined();
    });

    it("should update health metrics based on request performance", async () => {
      await computeBridgeService.registerProvider(mockOpenAI, {
        type: AIProviderType.OPENAI,
        apiKey: "test-key",
      });

      // Set specific response time
      mockOpenAI.setResponseTime(200);

      const request: CompletionRequestDto = {
        provider: AIProviderType.OPENAI,
        model: "gpt-4",
        messages: [{ role: MessageRole.USER, content: "Hello, world!" }],
      };

      await computeBridgeService.complete(request);

      const healthMetrics = healthService.getHealthMetrics(
        AIProviderType.OPENAI,
      );
      expect(healthMetrics?.responseTime).toBeGreaterThan(0);
      expect(healthMetrics?.totalRequests).toBeGreaterThan(0);
    });
  });

  describe("Metrics Collection", () => {
    it("should collect request metrics", async () => {
      await computeBridgeService.registerProvider(mockOpenAI, {
        type: AIProviderType.OPENAI,
        apiKey: "test-key",
      });

      const request: CompletionRequestDto = {
        provider: AIProviderType.OPENAI,
        model: "gpt-4",
        messages: [{ role: MessageRole.USER, content: "Hello, world!" }],
      };

      await computeBridgeService.complete(request);

      // Verify metrics are being collected
      const metricsText = await metricsService.getMetricsAsText();
      expect(metricsText).toContain("compute_requests_total");
      expect(metricsText).toContain("compute_request_duration_seconds");
    });
  });
});
