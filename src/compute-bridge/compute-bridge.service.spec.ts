import { Test, TestingModule } from "@nestjs/testing";
import { ComputeBridgeService } from "./compute-bridge.service";
import {
  AIProviderType,
  IAIProvider,
  IProviderConfig,
} from "./provider.interface";

describe("ComputeBridgeService", () => {
  let service: ComputeBridgeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ComputeBridgeService],
    }).compile();

    service = module.get<ComputeBridgeService>(ComputeBridgeService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("Provider Management", () => {
    let mockProvider: IAIProvider;
    let mockConfig: IProviderConfig;

    beforeEach(() => {
      mockProvider = {
        initialize: jest.fn().mockResolvedValue(undefined),
        isInitialized: jest.fn().mockReturnValue(true),
        getProviderType: jest.fn().mockReturnValue(AIProviderType.CUSTOM),
        listModels: jest.fn().mockResolvedValue([]),
        getModelInfo: jest.fn().mockResolvedValue({
          id: "test-model",
          name: "Test Model",
          provider: AIProviderType.CUSTOM,
          capabilities: {
            textGeneration: true,
            imageUnderstanding: false,
            functionCalling: false,
            streaming: false,
            embeddings: false,
            maxContextTokens: 4096,
          },
        }),
        validateModel: jest.fn().mockResolvedValue(true),
      };

      mockConfig = {
        type: AIProviderType.CUSTOM,
        apiKey: "test-key",
        timeout: 30000,
      };
    });

    it("should register a provider", async () => {
      await service.registerProvider(mockProvider, mockConfig);
      expect(service.hasProvider(AIProviderType.CUSTOM)).toBe(true);
    });

    it("should get a registered provider", async () => {
      await service.registerProvider(mockProvider, mockConfig);
      const provider = service.getProvider(AIProviderType.CUSTOM);
      expect(provider).toBeDefined();
      expect(provider).toBe(mockProvider);
    });

    it("should list all registered providers", async () => {
      await service.registerProvider(mockProvider, mockConfig);
      const providers = service.listProviders();
      expect(providers).toContain(AIProviderType.CUSTOM);
      expect(providers.length).toBe(1);
    });

    it("should return undefined for unregistered provider", () => {
      const provider = service.getProvider(AIProviderType.OPENAI);
      expect(provider).toBeUndefined();
    });
  });

  describe("Model Validation", () => {
    let mockProvider: IAIProvider;
    let mockConfig: IProviderConfig;

    beforeEach(async () => {
      mockProvider = {
        initialize: jest.fn().mockResolvedValue(undefined),
        isInitialized: jest.fn().mockReturnValue(true),
        getProviderType: jest.fn().mockReturnValue(AIProviderType.CUSTOM),
        listModels: jest.fn().mockResolvedValue([]),
        getModelInfo: jest.fn().mockResolvedValue({
          id: "test-model",
          name: "Test Model",
          provider: AIProviderType.CUSTOM,
          capabilities: {
            textGeneration: true,
            imageUnderstanding: false,
            functionCalling: false,
            streaming: false,
            embeddings: false,
            maxContextTokens: 4096,
          },
        }),
        validateModel: jest.fn().mockResolvedValue(true),
      };

      mockConfig = {
        type: AIProviderType.CUSTOM,
        apiKey: "test-key",
      };

      await service.registerProvider(mockProvider, mockConfig);
    });

    it("should validate a model", async () => {
      const isValid = await service.validateModel(
        AIProviderType.CUSTOM,
        "test-model",
      );
      expect(isValid).toBe(true);
      expect(mockProvider.validateModel).toHaveBeenCalledWith("test-model");
    });

    it("should return false for unregistered provider", async () => {
      const isValid = await service.validateModel(
        AIProviderType.OPENAI,
        "test-model",
      );
      expect(isValid).toBe(false);
    });
  });

  describe("Completions", () => {
    it("should throw error when provider is not registered", async () => {
      const request = {
        provider: AIProviderType.OPENAI,
        model: "gpt-4",
        messages: [{ role: "user" as const, content: "Hello" }],
      };

      await expect(service.complete(request as any)).rejects.toThrow(
        "Provider openai is not registered",
      );
    });
  });

  describe("Embeddings", () => {
    it("should throw error when provider is not registered", async () => {
      const request = {
        provider: AIProviderType.OPENAI,
        model: "text-embedding-ada-002",
        input: "Hello world",
      };

      await expect(service.generateEmbeddings(request as any)).rejects.toThrow(
        "Provider openai is not registered",
      );
    });
  });
});
