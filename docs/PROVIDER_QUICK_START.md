# Provider Plugin System - Quick Reference

## Adding a New Provider (3 Steps)

### 1. Create Provider Class

```typescript
// src/compute-bridge/providers/anthropic.provider.ts
import { BaseAIProvider } from "../base-provider.service";
import { Provider } from "../provider.decorator";
import { AIProviderType, IModelInfo } from "../provider.interface";

@Provider(AIProviderType.ANTHROPIC)
export class AnthropicProvider extends BaseAIProvider {
  constructor() {
    super(AnthropicProvider.name);
  }

  getProviderType(): AIProviderType {
    return AIProviderType.ANTHROPIC;
  }

  protected async initializeProvider(): Promise<void> {
    // Initialize your provider
    this.logger.log("Anthropic provider initialized");
  }

  async listModels(): Promise<IModelInfo[]> {
    return [
      {
        id: "claude-3-opus",
        name: "Claude 3 Opus",
        provider: AIProviderType.ANTHROPIC,
        capabilities: {
          textGeneration: true,
          imageUnderstanding: true,
          functionCalling: true,
          streaming: true,
          embeddings: false,
          maxContextTokens: 200000,
        },
      },
    ];
  }

  async getModelInfo(modelId: string): Promise<IModelInfo> {
    const models = await this.listModels();
    const model = models.find((m) => m.id === modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }
    return model;
  }
}
```

### 2. Register in Module

```typescript
// src/compute-bridge/compute-bridge.module.ts
@Module({
  providers: [
    ProviderRegistry,
    ComputeBridgeService,
    MockProvider,
    AnthropicProvider, // Add here
  ],
})
export class ComputeBridgeModule implements OnModuleInit {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly mockProvider: MockProvider,
    private readonly anthropicProvider: AnthropicProvider, // Inject
  ) {}

  async onModuleInit() {
    // Register MockProvider
    await this.registry.register(AIProviderType.CUSTOM, this.mockProvider, {
      type: AIProviderType.CUSTOM,
      apiKey: "mock-key",
    });

    // Register AnthropicProvider
    await this.registry.register(
      AIProviderType.ANTHROPIC,
      this.anthropicProvider,
      {
        type: AIProviderType.ANTHROPIC,
        apiKey: process.env.ANTHROPIC_API_KEY,
      },
    );
  }
}
```

### 3. Use Provider

```typescript
// In your service
const provider = await this.computeBridgeService.getProvider(
  AIProviderType.ANTHROPIC,
);
const models = await provider.listModels();
```

## Common Operations

### List All Providers
```typescript
const providers = computeBridgeService.listProviders();
// ['openai', 'anthropic', 'custom']
```

### Check Provider Exists
```typescript
if (computeBridgeService.hasProvider(AIProviderType.ANTHROPIC)) {
  // Provider is available
}
```

### Get Provider
```typescript
const provider = await computeBridgeService.getProvider(AIProviderType.ANTHROPIC);
```

### List Models
```typescript
const models = await computeBridgeService.getAvailableModels(AIProviderType.ANTHROPIC);
```

### Validate Model
```typescript
const isValid = await computeBridgeService.validateModel(
  AIProviderType.ANTHROPIC,
  "claude-3-opus",
);
```

## Testing Your Provider

```typescript
// providers/anthropic.provider.spec.ts
import { Test } from "@nestjs/testing";
import { AnthropicProvider } from "./anthropic.provider";
import { AIProviderType, IProviderConfig } from "../provider.interface";

describe("AnthropicProvider", () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    provider = new AnthropicProvider();
  });

  it("should initialize", async () => {
    const config: IProviderConfig = {
      type: AIProviderType.ANTHROPIC,
      apiKey: "test-key",
    };

    await provider.initialize(config);
    expect(provider.isInitialized()).toBe(true);
  });

  it("should list models", async () => {
    const config: IProviderConfig = {
      type: AIProviderType.ANTHROPIC,
      apiKey: "test-key",
    };

    await provider.initialize(config);
    const models = await provider.listModels();
    
    expect(models.length).toBeGreaterThan(0);
    expect(models[0].id).toBe("claude-3-opus");
  });
});
```

## Environment Variables

```bash
# .env
ANTHROPIC_API_KEY=your-api-key-here
OPENAI_API_KEY=your-api-key-here
```

## Troubleshooting

### Provider not found
```typescript
// Check if registered
console.log(registry.list()); // See all registered providers
```

### Initialization fails
```typescript
// Check logs for initialization errors
// Verify API key is set
// Ensure provider is added to module providers array
```

### Type errors
```typescript
// Ensure provider extends BaseAIProvider
// Implement all required methods from IAIProvider
```

## Best Practices

1. **Always extend BaseAIProvider** - Gets retry logic, error handling, logging
2. **Use @Provider decorator** - Enables future auto-discovery
3. **Validate config** - Override `validateConfig()` for custom validation
4. **Handle errors** - Use `sanitizeError()` to remove sensitive data
5. **Add tests** - Test initialization, models, and error cases
6. **Document models** - Include capabilities and token limits

## Need Help?

- Full docs: `docs/PROVIDER_PLUGIN_SYSTEM.md`
- Example: `src/compute-bridge/providers/mock.provider.ts`
- Tests: `src/compute-bridge/providers/mock.provider.spec.ts`
