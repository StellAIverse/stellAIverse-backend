# Compute Bridge API Documentation

The Compute Bridge is a provider-agnostic system for orchestrating AI compute requests across multiple providers.

## Architecture

The bridge uses the **Strategy/Adapter Pattern** to decouple the core logic from specific AI provider implementations.

- **`IComputeProvider`**: The base interface that all adapters must implement.
- **`ComputeBridgeService`**: The central orchestration service that routes requests.
- **Adapters**: Provider-specific implementations (e.g., `OpenAIAdapter`, `MockAdapter`).

## Provider Interface

```typescript
export interface IComputeProvider {
  initialize(config?: any): Promise<void>;
  execute(request: any): Promise<any>;
  getStatus(): Promise<{ status: string; healthy: boolean }>;
  getProviderType(): ProviderType;
}
```

## Adding a New Provider

To add a new AI provider (e.g., Anthropic):

1.  **Define the Provider Type**: Add the new type to the `ProviderType` enum in `src/compute/interfaces/provider.interface.ts`.
2.  **Create the Adapter**: Create a new class in `src/compute/providers/` that implements `IComputeProvider`.
3.  **Register the Adapter**: Update `src/compute/compute.module.ts` to include the new adapter in the `providers` array.
4.  **Update ComputeBridgeService**: Inject the new adapter into `ComputeBridgeService` and add it to the `providers` map in `onModuleInit`.

## Example Usage

```typescript
// Inject ComputeBridgeService
constructor(private readonly computeBridge: ComputeBridgeService) {}

// Execute a request
const result = await this.computeBridge.execute(ProviderType.OPENAI, {
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```
