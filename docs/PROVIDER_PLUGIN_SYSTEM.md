# Provider Plugin System

## Overview

The Provider Plugin System enables dynamic registration and management of AI compute providers (OpenAI, Anthropic, local workers, etc.) through a pluggable architecture. This system allows adding new providers without modifying core code.

## Architecture

### Core Components

1. **ProviderRegistry** - Central registry managing provider lifecycle
2. **IAIProvider** - Interface all providers must implement
3. **BaseAIProvider** - Abstract base class with common functionality
4. **@Provider** - Decorator for marking provider classes

### Key Features

- Dynamic provider registration at runtime
- Lazy instantiation support
- Type-safe provider lookup
- Automatic initialization and lifecycle management
- Pluggable architecture via dependency injection

## Usage

### Creating a Provider

Extend `BaseAIProvider` and implement required methods:

```typescript
import { BaseAIProvider } from "./base-provider.service";
import { AIProviderType, IModelInfo } from "./provider.interface";
import { Provider } from "./provider.decorator";

@Provider(AIProviderType.CUSTOM)
export class MyCustomProvider extends BaseAIProvider {
  constructor() {
    super(MyCustomProvider.name);
  }

  getProviderType(): AIProviderType {
    return AIProviderType.CUSTOM;
  }

  protected async initializeProvider(): Promise<void> {
    // Custom initialization logic
    this.logger.log("Custom provider initialized");
  }

  async listModels(): Promise<IModelInfo[]> {
    // Return available models
    return [
      {
        id: "my-model",
        name: "My Model",
        capabilities: {
          completion: true,
          embedding: false,
          streaming: false,
        },
      },
    ];
  }

  async getModelInfo(modelId: string): Promise<IModelInfo> {
    // Return model information
    const models = await this.listModels();
    const model = models.find((m) => m.id === modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }
    return model;
  }
}
```

### Registering a Provider

#### Option 1: Module Registration (Recommended)

Add your provider to the module:

```typescript
@Module({
  providers: [
    ProviderRegistry,
    ComputeBridgeService,
    MyCustomProvider, // Add your provider here
  ],
})
export class ComputeBridgeModule {}
```

Then register it in your service:

```typescript
constructor(
  private readonly registry: ProviderRegistry,
  private readonly myProvider: MyCustomProvider,
) {}

async onModuleInit() {
  await this.registry.register(
    AIProviderType.CUSTOM,
    this.myProvider,
    {
      type: AIProviderType.CUSTOM,
      apiKey: process.env.MY_PROVIDER_API_KEY,
    },
  );
}
```

#### Option 2: Dynamic Registration

Register providers at runtime:

```typescript
const provider = new MyCustomProvider();
await registry.register(AIProviderType.CUSTOM, provider, {
  type: AIProviderType.CUSTOM,
  apiKey: "your-api-key",
});
```

#### Option 3: Class Registration (Lazy Loading)

Register a provider class for lazy instantiation:

```typescript
registry.registerClass({
  type: AIProviderType.CUSTOM,
  providerClass: MyCustomProvider,
  config: {
    type: AIProviderType.CUSTOM,
    apiKey: "your-api-key",
  },
});
```

### Using Providers

```typescript
// Check if provider exists
if (registry.has(AIProviderType.OPENAI)) {
  // Get provider instance
  const provider = await registry.get(AIProviderType.OPENAI);

  // Use provider
  const models = await provider.listModels();
  const isValid = await provider.validateModel("gpt-4");
}

// List all registered providers
const providers = registry.list();
console.log("Available providers:", providers);
```

## Provider Interface

All providers must implement `IAIProvider`:

```typescript
interface IAIProvider {
  initialize(config: IProviderConfig): Promise<void>;
  isInitialized(): boolean;
  getProviderType(): AIProviderType;
  listModels(): Promise<IModelInfo[]>;
  getModelInfo(modelId: string): Promise<IModelInfo>;
  validateModel(modelId: string): Promise<boolean>;
}
```

## Configuration

Provider configuration structure:

```typescript
interface IProviderConfig {
  type: AIProviderType;
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  metadata?: Record<string, any>;
}
```

## Example: Mock Provider

See `src/compute-bridge/providers/mock.provider.ts` for a complete example implementation.

## Testing

The system includes comprehensive tests:

- `provider.registry.spec.ts` - Registry functionality tests
- `mock.provider.spec.ts` - Example provider tests

Run tests:

```bash
npm test -- provider.registry
npm test -- mock.provider
```

## Best Practices

1. **Extend BaseAIProvider** - Provides common functionality like retry logic and error handling
2. **Use the @Provider decorator** - Enables future auto-discovery features
3. **Validate configuration** - Override `validateConfig()` for custom validation
4. **Handle errors gracefully** - Use `sanitizeError()` to remove sensitive data from logs
5. **Implement retry logic** - Use `executeWithRetry()` for resilient API calls
6. **Add comprehensive tests** - Test initialization, model listing, and error cases

## Adding New Provider Types

To add a new provider type:

1. Add to `AIProviderType` enum in `provider.interface.ts`:

```typescript
export enum AIProviderType {
  OPENAI = "openai",
  ANTHROPIC = "anthropic",
  GOOGLE = "google",
  HUGGINGFACE = "huggingface",
  CUSTOM = "custom",
  MYNEWPROVIDER = "mynewprovider", // Add here
}
```

2. Create provider implementation
3. Register in module
4. Add tests and documentation

## Migration Guide

### From Old System

Before:
```typescript
private readonly providers: Map<AIProviderType, IAIProvider> = new Map();

async registerProvider(provider: IAIProvider, config: IProviderConfig) {
  await provider.initialize(config);
  this.providers.set(config.type, provider);
}
```

After:
```typescript
constructor(private readonly registry: ProviderRegistry) {}

async registerProvider(provider: IAIProvider, config: IProviderConfig) {
  await this.registry.register(config.type, provider, config);
}
```

## Troubleshooting

### Provider not found
- Ensure provider is registered in module
- Check provider type matches enum value
- Verify initialization completed successfully

### Initialization fails
- Validate API key is set
- Check network connectivity
- Review provider-specific requirements

### Duplicate registration error
- Each provider type can only be registered once
- Use `unregister()` before re-registering
- Check for multiple registration calls

## Future Enhancements

- Auto-discovery via decorators
- Hot-reload provider plugins
- Provider health monitoring
- Metrics and telemetry
- Provider versioning support
