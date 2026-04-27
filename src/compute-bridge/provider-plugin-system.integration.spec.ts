import { Test, TestingModule } from "@nestjs/testing";
import { ComputeBridgeModule } from "./compute-bridge.module";
import { ComputeBridgeService } from "./compute-bridge.service";
import { ProviderRegistry } from "./provider.registry";
import { AIProviderType } from "./provider.interface";

describe("Provider Plugin System Integration", () => {
  let module: TestingModule;
  let service: ComputeBridgeService;
  let registry: ProviderRegistry;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ComputeBridgeModule],
    }).compile();

    await module.init();

    service = module.get<ComputeBridgeService>(ComputeBridgeService);
    registry = module.get<ProviderRegistry>(ProviderRegistry);
  });

  afterAll(async () => {
    await module.close();
  });

  it("should initialize the module", () => {
    expect(service).toBeDefined();
    expect(registry).toBeDefined();
  });

  it("should have MockProvider available", () => {
    const providers = service.listProviders();
    expect(providers).toContain(AIProviderType.CUSTOM);
  });

  it("should retrieve and use MockProvider", async () => {
    const provider = await service.getProvider(AIProviderType.CUSTOM);
    expect(provider).toBeDefined();
    expect(provider.isInitialized()).toBe(true); // Initialized by module

    // Check provider type
    expect(provider.getProviderType()).toBe(AIProviderType.CUSTOM);
  });

  it("should list models from MockProvider", async () => {
    const models = await service.getAvailableModels(AIProviderType.CUSTOM);
    expect(models).toHaveLength(2);
    expect(models[0].id).toBe("mock-model-v1");
    expect(models[1].id).toBe("mock-model-v2");
  });

  it("should validate models", async () => {
    const isValid = await service.validateModel(
      AIProviderType.CUSTOM,
      "mock-model-v1",
    );
    expect(isValid).toBe(true); // Should be valid

    const isInvalid = await service.validateModel(
      AIProviderType.CUSTOM,
      "non-existent-model",
    );
    expect(isInvalid).toBe(false);
  });
});
