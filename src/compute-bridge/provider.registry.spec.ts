import { Test, TestingModule } from "@nestjs/testing";
import { ModuleRef } from "@nestjs/core";
import { ProviderRegistry } from "./provider.registry";
import { AIProviderType, IProviderConfig } from "./provider.interface";
import { MockProvider } from "./providers/mock.provider";

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;
  let moduleRef: ModuleRef;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProviderRegistry],
    }).compile();

    registry = module.get<ProviderRegistry>(ProviderRegistry);
    moduleRef = module.get<ModuleRef>(ModuleRef);
  });

  it("should be defined", () => {
    expect(registry).toBeDefined();
  });

  describe("register", () => {
    it("should register a provider instance", async () => {
      const provider = new MockProvider();
      const config: IProviderConfig = {
        type: AIProviderType.CUSTOM,
        apiKey: "test-key",
      };

      await registry.register(AIProviderType.CUSTOM, provider, config);

      expect(registry.has(AIProviderType.CUSTOM)).toBe(true);
    });

    it("should throw error when registering duplicate provider", async () => {
      const provider = new MockProvider();
      const config: IProviderConfig = {
        type: AIProviderType.CUSTOM,
        apiKey: "test-key",
      };

      await registry.register(AIProviderType.CUSTOM, provider, config);

      await expect(
        registry.register(AIProviderType.CUSTOM, provider, config),
      ).rejects.toThrow("Provider custom is already registered");
    });
  });

  describe("get", () => {
    it("should retrieve a registered provider", async () => {
      const provider = new MockProvider();
      const config: IProviderConfig = {
        type: AIProviderType.CUSTOM,
        apiKey: "test-key",
      };

      await registry.register(AIProviderType.CUSTOM, provider, config);
      const retrieved = await registry.get(AIProviderType.CUSTOM);

      expect(retrieved).toBe(provider);
    });

    it("should return undefined for unregistered provider", async () => {
      const retrieved = await registry.get(AIProviderType.OPENAI);
      expect(retrieved).toBeUndefined();
    });
  });

  describe("has", () => {
    it("should return true for registered provider", async () => {
      const provider = new MockProvider();
      const config: IProviderConfig = {
        type: AIProviderType.CUSTOM,
        apiKey: "test-key",
      };

      await registry.register(AIProviderType.CUSTOM, provider, config);

      expect(registry.has(AIProviderType.CUSTOM)).toBe(true);
    });

    it("should return false for unregistered provider", () => {
      expect(registry.has(AIProviderType.OPENAI)).toBe(false);
    });
  });

  describe("list", () => {
    it("should list all registered providers", async () => {
      const provider = new MockProvider();
      const config: IProviderConfig = {
        type: AIProviderType.CUSTOM,
        apiKey: "test-key",
      };

      await registry.register(AIProviderType.CUSTOM, provider, config);

      const list = registry.list();
      expect(list).toContain(AIProviderType.CUSTOM);
      expect(list.length).toBe(1);
    });

    it("should return empty array when no providers registered", () => {
      const list = registry.list();
      expect(list).toEqual([]);
    });
  });

  describe("unregister", () => {
    it("should unregister a provider", async () => {
      const provider = new MockProvider();
      const config: IProviderConfig = {
        type: AIProviderType.CUSTOM,
        apiKey: "test-key",
      };

      await registry.register(AIProviderType.CUSTOM, provider, config);
      const removed = registry.unregister(AIProviderType.CUSTOM);

      expect(removed).toBe(true);
      expect(registry.has(AIProviderType.CUSTOM)).toBe(false);
    });

    it("should return false when unregistering non-existent provider", () => {
      const removed = registry.unregister(AIProviderType.OPENAI);
      expect(removed).toBe(false);
    });
  });

  describe("registerClass", () => {
    it("should register a provider class", () => {
      const metadata = {
        type: AIProviderType.CUSTOM,
        providerClass: MockProvider,
        config: {
          type: AIProviderType.CUSTOM,
          apiKey: "test-key",
        },
      };

      registry.registerClass(metadata);

      expect(registry.has(AIProviderType.CUSTOM)).toBe(true);
    });

    it("should throw error when registering duplicate class", () => {
      const metadata = {
        type: AIProviderType.CUSTOM,
        providerClass: MockProvider,
      };

      registry.registerClass(metadata);

      expect(() => registry.registerClass(metadata)).toThrow(
        "Provider class custom is already registered",
      );
    });
  });
});
