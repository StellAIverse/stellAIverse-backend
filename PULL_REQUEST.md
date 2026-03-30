# PR: Refactor Compute Bridge for Provider Agnosticism

## Description
This pull request refactors the Compute Bridge to remove provider-specific coupling from the core logic. By implementing a strict **Adapter Pattern**, the system now supports the seamless integration of new AI providers without requiring modifications to the orchestration layer.

## Changes
- **Standardized Interface**: Defined `IComputeProvider` in `src/compute/interfaces/provider.interface.ts` to enforce a consistent contract (initialize, execute, getStatus) across all providers.
- **Provider Adapters**: 
    - Implemented `OpenAIAdapter` using the existing OpenAI logic but now adhering to the new interface.
    - Implemented `MockAdapter` for local development, testing, and fallback scenarios.
- **ComputeBridgeService**: Refactored the core service in `src/compute/compute-bridge.service.ts` to manage a registry of adapters and route requests dynamically based on the requested `ProviderType`.
- **Module Integration**: Updated `ComputeModule` to handle dependency injection for the new service and its adapters.

## Technical Details
- **Pattern**: Strategy/Adapter Pattern.
- **Error Handling**: Standardized error logging and status reporting across adapters.
- **Extensibility**: Adding a new provider now only requires creating a new adapter class and registering it in the module.

## Verification
- **Unit Tests**: Added comprehensive test suites in `test/compute/` covering both the `ComputeBridgeService` routing and the `OpenAIAdapter` execution.
- **Test Results**: 12 tests passed, 0 failures.
- **Configuration**: Created `test/jest-unit.json` to facilitate unit testing outside the standard E2E suite.

#137
