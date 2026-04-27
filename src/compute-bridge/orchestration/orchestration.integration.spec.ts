import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { MultiProviderOrchestrationService } from "./multi-provider-orchestration.service";
import { ConsensusService } from "./consensus.service";
import { ResponseNormalizerService } from "./response-normalizer.service";
import { AuditService } from "./audit.service";
import { ProviderRouterService } from "../router/provider-router.service";
import { CircuitBreakerService } from "../router/circuit-breaker.service";
import { ProviderHealthService } from "../router/provider-health.service";
import { ProviderMetricsService } from "../router/provider-metrics.service";
import {
  OrchestrationStrategy,
  OrchestratedRequestConfig,
  ProviderExecutionMode,
} from "./orchestration.interface";
import {
  AIProviderType,
  ICompletionProvider,
  IProviderConfig,
} from "../provider.interface";
import { CompletionRequestDto, MessageRole } from "../base.dto";

// Mock provider for testing
class MockCompletionProvider implements ICompletionProvider {
  private initialized = false;
  private shouldFail = false;
  private responseDelay = 0;

  constructor(
    private providerType: AIProviderType,
    private responseContent: string,
  ) {}

  setShouldFail(shouldFail: boolean) {
    this.shouldFail = shouldFail;
  }

  setResponseDelay(delay: number) {
    this.responseDelay = delay;
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
    return [];
  }

  async getModelInfo(modelId: string): Promise<any> {
    return { id: modelId };
  }

  async validateModel(modelId: string): Promise<boolean> {
    return true;
  }

  async complete(request: CompletionRequestDto): Promise<any> {
    if (this.shouldFail) {
      throw new Error(`Provider ${this.providerType} failed`);
    }

    if (this.responseDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.responseDelay));
    }

    return {
      id: `${this.providerType}-response-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: this.responseContent,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    };
  }

  async *streamComplete(request: CompletionRequestDto): AsyncGenerator<any> {
    yield {
      id: `${this.providerType}-stream-${Date.now()}`,
      choices: [
        {
          delta: { content: this.responseContent },
        },
      ],
    };
  }
}

describe("MultiProviderOrchestration Integration", () => {
  let orchestrationService: MultiProviderOrchestrationService;
  let auditService: AuditService;
  let mockConfigService: Partial<ConfigService>;

  // Mock providers
  let openAIProvider: MockCompletionProvider;
  let anthropicProvider: MockCompletionProvider;
  let googleProvider: MockCompletionProvider;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          ORCHESTRATION_OPENAI_ENABLED: true,
          ORCHESTRATION_ANTHROPIC_ENABLED: true,
          ORCHESTRATION_GOOGLE_ENABLED: true,
          ORCHESTRATION_OPENAI_TIMEOUT: 30000,
          ORCHESTRATION_ANTHROPIC_TIMEOUT: 30000,
          ORCHESTRATION_GOOGLE_TIMEOUT: 30000,
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MultiProviderOrchestrationService,
        ConsensusService,
        ResponseNormalizerService,
        AuditService,
        ProviderRouterService,
        CircuitBreakerService,
        ProviderHealthService,
        ProviderMetricsService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    orchestrationService = module.get<MultiProviderOrchestrationService>(
      MultiProviderOrchestrationService,
    );
    auditService = module.get<AuditService>(AuditService);

    // Create mock providers
    openAIProvider = new MockCompletionProvider(
      AIProviderType.OPENAI,
      "OpenAI response",
    );
    anthropicProvider = new MockCompletionProvider(
      AIProviderType.ANTHROPIC,
      "Anthropic response",
    );
    googleProvider = new MockCompletionProvider(
      AIProviderType.GOOGLE,
      "Google response",
    );

    // Register providers
    orchestrationService.registerProvider(openAIProvider, {
      provider: AIProviderType.OPENAI,
      mode: ProviderExecutionMode.ENABLED,
      timeoutMs: 30000,
      maxRetries: 3,
      weight: 1,
      costPer1KTokens: 0.01,
      qualityScore: 0.9,
      apiConfig: { apiKey: "test-openai-key" },
    });

    orchestrationService.registerProvider(anthropicProvider, {
      provider: AIProviderType.ANTHROPIC,
      mode: ProviderExecutionMode.ENABLED,
      timeoutMs: 30000,
      maxRetries: 3,
      weight: 1,
      costPer1KTokens: 0.015,
      qualityScore: 0.9,
      apiConfig: { apiKey: "test-anthropic-key" },
    });

    orchestrationService.registerProvider(googleProvider, {
      provider: AIProviderType.GOOGLE,
      mode: ProviderExecutionMode.ENABLED,
      timeoutMs: 30000,
      maxRetries: 3,
      weight: 1,
      costPer1KTokens: 0.005,
      qualityScore: 0.85,
      apiConfig: { apiKey: "test-google-key" },
    });
  });

  afterEach(() => {
    auditService.clearAuditLog();
  });

  describe("Single Strategy", () => {
    it("should execute with single provider", async () => {
      const request: CompletionRequestDto = {
        provider: AIProviderType.OPENAI,
        model: "gpt-4",
        messages: [{ role: MessageRole.USER, content: "Hello" }],
      };

      const config: OrchestratedRequestConfig = {
        strategy: OrchestrationStrategy.SINGLE,
        targetProviders: [AIProviderType.OPENAI],
      };

      const result = await orchestrationService.orchestrate(request, config);

      expect(result.strategy).toBe(OrchestrationStrategy.SINGLE);
      expect(result.allResponses).toHaveLength(1);
      expect(result.selectedResponse.content).toBe("OpenAI response");
      expect(result.requestId).toBeDefined();
    });

    it("should fallback to next provider on failure", async () => {
      openAIProvider.setShouldFail(true);

      const request: CompletionRequestDto = {
        provider: AIProviderType.OPENAI,
        model: "gpt-4",
        messages: [{ role: MessageRole.USER, content: "Hello" }],
      };

      const config: OrchestratedRequestConfig = {
        strategy: OrchestrationStrategy.SINGLE,
        targetProviders: [AIProviderType.OPENAI, AIProviderType.ANTHROPIC],
      };

      const result = await orchestrationService.orchestrate(request, config);

      expect(result.selectedResponse.provider).toBe(AIProviderType.ANTHROPIC);
      expect(result.selectedResponse.content).toBe("Anthropic response");
    });
  });

  describe("Parallel Strategy", () => {
    it("should execute in parallel to all providers", async () => {
      const request: CompletionRequestDto = {
        provider: AIProviderType.OPENAI,
        model: "gpt-4",
        messages: [{ role: MessageRole.USER, content: "Hello" }],
      };

      const config: OrchestratedRequestConfig = {
        strategy: OrchestrationStrategy.PARALLEL,
      };

      const result = await orchestrationService.orchestrate(request, config);

      expect(result.strategy).toBe(OrchestrationStrategy.PARALLEL);
      expect(result.allResponses).toHaveLength(3);
      expect(result.allResponses.every((r) => r.success)).toBe(true);
    });

    it("should select fastest response", async () => {
      // Set different delays
      openAIProvider.setResponseDelay(100);
      anthropicProvider.setResponseDelay(50); // Fastest
      googleProvider.setResponseDelay(150);

      const request: CompletionRequestDto = {
        provider: AIProviderType.OPENAI,
        model: "gpt-4",
        messages: [{ role: MessageRole.USER, content: "Hello" }],
      };

      const config: OrchestratedRequestConfig = {
        strategy: OrchestrationStrategy.PARALLEL,
      };

      const result = await orchestrationService.orchestrate(request, config);

      expect(result.selectedResponse.provider).toBe(AIProviderType.ANTHROPIC);
      expect(result.selectionReason).toContain("Fastest");
    });
  });

  describe("Consensus Strategy", () => {
    it("should reach consensus when providers agree", async () => {
      // Make all providers return the same response
      openAIProvider = new MockCompletionProvider(
        AIProviderType.OPENAI,
        "Consensus answer",
      );
      anthropicProvider = new MockCompletionProvider(
        AIProviderType.ANTHROPIC,
        "Consensus answer",
      );
      googleProvider = new MockCompletionProvider(
        AIProviderType.GOOGLE,
        "Consensus answer",
      );

      const request: CompletionRequestDto = {
        provider: AIProviderType.OPENAI,
        model: "gpt-4",
        messages: [{ role: MessageRole.USER, content: "Hello" }],
      };

      const config: OrchestratedRequestConfig = {
        strategy: OrchestrationStrategy.CONSENSUS,
        consensusConfig: {
          algorithm: "majority_vote" as any,
          minAgreementPercentage: 0.5,
        },
      };

      const result = await orchestrationService.orchestrate(request, config);

      expect(result.strategy).toBe(OrchestrationStrategy.CONSENSUS);
      expect(result.consensusResult).toBeDefined();
      expect(result.consensusResult!.consensusReached).toBe(true);
      expect(result.consensusResult!.winner).toBe("Consensus answer");
    });
  });

  describe("Best-of-N Strategy", () => {
    it("should select best of N providers", async () => {
      const request: CompletionRequestDto = {
        provider: AIProviderType.OPENAI,
        model: "gpt-4",
        messages: [{ role: MessageRole.USER, content: "Hello" }],
      };

      const config: OrchestratedRequestConfig = {
        strategy: OrchestrationStrategy.BEST_OF_N,
        bestOfNConfig: {
          n: 2,
          criteria: "fastest",
        },
      };

      const result = await orchestrationService.orchestrate(request, config);

      expect(result.strategy).toBe(OrchestrationStrategy.BEST_OF_N);
      expect(result.allResponses).toHaveLength(2);
    });
  });

  describe("Provider Mode Management", () => {
    it("should disable provider at runtime", () => {
      orchestrationService.setProviderMode(
        AIProviderType.OPENAI,
        ProviderExecutionMode.DISABLED,
      );

      const mode = orchestrationService.getProviderMode(AIProviderType.OPENAI);
      expect(mode).toBe(ProviderExecutionMode.DISABLED);
    });

    it("should enable provider at runtime", () => {
      orchestrationService.setProviderMode(
        AIProviderType.OPENAI,
        ProviderExecutionMode.DISABLED,
      );
      orchestrationService.setProviderMode(
        AIProviderType.OPENAI,
        ProviderExecutionMode.ENABLED,
      );

      const mode = orchestrationService.getProviderMode(AIProviderType.OPENAI);
      expect(mode).toBe(ProviderExecutionMode.ENABLED);
    });
  });

  describe("Auditing", () => {
    it("should create audit log entries", async () => {
      const request: CompletionRequestDto = {
        provider: AIProviderType.OPENAI,
        model: "gpt-4",
        messages: [{ role: MessageRole.USER, content: "Hello" }],
      };

      const config: OrchestratedRequestConfig = {
        strategy: OrchestrationStrategy.SINGLE,
        targetProviders: [AIProviderType.OPENAI],
      };

      await orchestrationService.orchestrate(request, config);

      const auditLog = auditService.getAuditLog();
      expect(auditLog.length).toBeGreaterThan(0);

      const entry = auditLog[0];
      expect(entry.requestId).toBeDefined();
      expect(entry.provider).toBe(AIProviderType.OPENAI);
      expect(entry.signature).toBeDefined();
    });

    it("should verify audit entry integrity", async () => {
      const request: CompletionRequestDto = {
        provider: AIProviderType.OPENAI,
        model: "gpt-4",
        messages: [{ role: MessageRole.USER, content: "Hello" }],
      };

      const config: OrchestratedRequestConfig = {
        strategy: OrchestrationStrategy.SINGLE,
        targetProviders: [AIProviderType.OPENAI],
      };

      await orchestrationService.orchestrate(request, config);

      const auditLog = auditService.getAuditLog();
      const entry = auditLog[0];

      const isValid = auditService.verifyIntegrity(entry.auditId);
      expect(isValid).toBe(true);
    });
  });

  describe("Health Status", () => {
    it("should return health status", () => {
      const health = orchestrationService.getHealthStatus();

      expect(health.status).toBeDefined();
      expect(health.providers).toBeDefined();
      expect(health.activeRequests).toBeDefined();
    });
  });
});
