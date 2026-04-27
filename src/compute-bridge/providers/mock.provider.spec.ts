import { Test, TestingModule } from "@nestjs/testing";
import { MockProvider } from "./mock.provider";
import { AIProviderType, IProviderConfig } from "../provider.interface";

describe("MockProvider", () => {
  let provider: MockProvider;

  beforeEach(() => {
    provider = new MockProvider();
  });

  it("should be defined", () => {
    expect(provider).toBeDefined();
  });

  describe("initialization", () => {
    it("should initialize successfully", async () => {
      const config: IProviderConfig = {
        type: AIProviderType.CUSTOM,
        apiKey: "test-key",
      };

      await provider.initialize(config);

      expect(provider.isInitialized()).toBe(true);
    });

    it("should return correct provider type", () => {
      expect(provider.getProviderType()).toBe(AIProviderType.CUSTOM);
    });
  });

  describe("listModels", () => {
    it("should return available models", async () => {
      const config: IProviderConfig = {
        type: AIProviderType.CUSTOM,
        apiKey: "test-key",
      };

      await provider.initialize(config);
      const models = await provider.listModels();

      expect(models).toHaveLength(2);
      expect(models[0].id).toBe("mock-model-v1");
      expect(models[1].id).toBe("mock-model-v2");
      expect(models[0].capabilities.textGeneration).toBe(true);
    });
  });

  describe("getModelInfo", () => {
    it("should return model info for valid model", async () => {
      const config: IProviderConfig = {
        type: AIProviderType.CUSTOM,
        apiKey: "test-key",
      };

      await provider.initialize(config);
      const modelInfo = await provider.getModelInfo("mock-model-v1");

      expect(modelInfo.id).toBe("mock-model-v1");
      expect(modelInfo.name).toBe("Mock Model v1");
      expect(modelInfo.capabilities.textGeneration).toBe(true);
    });

    it("should throw error for invalid model", async () => {
      const config: IProviderConfig = {
        type: AIProviderType.CUSTOM,
        apiKey: "test-key",
      };

      await provider.initialize(config);

      await expect(provider.getModelInfo("invalid-model")).rejects.toThrow(
        "Model invalid-model not found",
      );
    });
  });

  describe("validateModel", () => {
    it("should validate existing model", async () => {
      const config: IProviderConfig = {
        type: AIProviderType.CUSTOM,
        apiKey: "test-key",
      };

      await provider.initialize(config);
      const isValid = await provider.validateModel("mock-model-v1");

      expect(isValid).toBe(true);
    });

    it("should return false for non-existent model", async () => {
      const config: IProviderConfig = {
        type: AIProviderType.CUSTOM,
        apiKey: "test-key",
      };

      await provider.initialize(config);
      const isValid = await provider.validateModel("invalid-model");

      expect(isValid).toBe(false);
    });
  });

  describe("complete", () => {
    it("should generate mock completion", async () => {
      const config: IProviderConfig = {
        type: AIProviderType.CUSTOM,
        apiKey: "test-key",
      };

      await provider.initialize(config);
      const response = await provider.complete("test prompt");

      expect(response).toContain("Mock response to:");
      expect(response).toContain("test prompt");
    });
  });
});
