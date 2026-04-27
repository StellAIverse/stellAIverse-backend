# Multi-Provider Load Balancing and Failover System

## Overview

This implementation provides intelligent request routing across multiple AI compute providers (OpenAI, Anthropic, Google, HuggingFace) with real-time health monitoring, circuit breaker patterns, weighted load balancing, and automatic failover to maintain SLA requirements.

## Architecture

### Core Components

1. **ProviderRouterService** - Central routing engine with multiple load balancing strategies
2. **ProviderHealthService** - Real-time health monitoring and metrics collection
3. **CircuitBreakerService** - Failure detection and automatic recovery with exponential backoff
4. **ProviderMetricsService** - Prometheus metrics for monitoring and observability
5. **ProviderRouterConfigService** - Configuration management for routing strategies

### Key Features

#### Load Balancing Strategies
- **Health-Aware** - Routes to providers based on health scores, response time, and success rate
- **Round-Robin** - Distributes requests evenly across available providers
- **Weighted** - Routes based on configured weights (cost, latency, custom factors)
- **Least Connections** - Routes to provider with fewest active connections
- **Random** - Random selection from available providers
- **Cost-Optimized** - Routes to cheapest available providers

#### Circuit Breaker Pattern
- Automatic failure detection after N consecutive failures
- Exponential backoff for recovery attempts
- Three states: CLOSED (normal), OPEN (failing), HALF_OPEN (testing recovery)
- Configurable thresholds and timeouts

#### Health Monitoring
- 30-second health check intervals
- Response time, success rate, and error tracking
- Provider status: HEALTHY, DEGRADED, UNHEALTHY, UNKNOWN
- Real-time metrics updates

#### Automatic Failover
- Configurable fallback chains (e.g., OpenAI → Anthropic → Google → Local)
- Request retry logic with backoff
- Fallback history tracking for debugging
- Routing metadata preservation

## Usage

### Basic Request with Intelligent Routing

```typescript
const request: CompletionRequestDto = {
  provider: AIProviderType.OPENAI, // Preferred provider
  model: 'gpt-4',
  messages: [
    { role: MessageRole.USER, content: 'Hello, world!' }
  ]
};

const routingContext: Partial<RoutingContext> = {
  strategy: LoadBalancingStrategy.HEALTH_AWARE,
  fallbackChain: [
    AIProviderType.OPENAI,
    AIProviderType.ANTHROPIC,
    AIProviderType.GOOGLE
  ],
  maxRetries: 3,
  costSensitivity: 0.7, // Higher cost sensitivity
  latencySensitivity: 0.3  // Lower latency sensitivity
};

const response = await computeBridgeService.complete(request, routingContext);
```

### Provider Registration

```typescript
const openaiProvider = new OpenAIProvider();
await computeBridgeService.registerProvider(openaiProvider, {
  type: AIProviderType.OPENAI,
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000,
  maxRetries: 3
});
```

### Configuration

Environment variables for routing configuration:

```bash
# Load balancing strategy
COMPUTE_ROUTER_STRATEGY=health_aware

# Health check interval (ms)
COMPUTE_HEALTH_CHECK_INTERVAL=30000

# Circuit breaker settings
COMPUTE_CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
COMPUTE_CIRCUIT_BREAKER_RECOVERY_TIMEOUT=30000
COMPUTE_CIRCUIT_BREAKER_SUCCESS_THRESHOLD=3
COMPUTE_CIRCUIT_BREAKER_BACKOFF_MULTIPLIER=2
COMPUTE_CIRCUIT_BREAKER_MAX_BACKOFF=300000

# Provider weights and configuration
COMPUTE_PROVIDER_OPENAI_WEIGHT=1.0
COMPUTE_PROVIDER_OPENAI_COST_FACTOR=1.0
COMPUTE_PROVIDER_OPENAI_LATENCY_FACTOR=1.0

COMPUTE_PROVIDER_ANTHROPIC_WEIGHT=0.8
COMPUTE_PROVIDER_ANTHROPIC_COST_FACTOR=1.2
COMPUTE_PROVIDER_ANTHROPIC_LATENCY_FACTOR=0.8

# Fallback chain
COMPUTE_FALLBACK_CHAIN=openai,anthropic,google,huggingface

# Request limits
COMPUTE_MAX_CONCURRENT_REQUESTS=100
COMPUTE_REQUEST_TIMEOUT=30000
```

## API Reference

### RoutingContext

```typescript
interface RoutingContext {
  requestId: string;
  requestType: 'completion' | 'embedding';
  preferredProviders?: AIProviderType[];
  fallbackChain?: AIProviderType[];
  strategy?: LoadBalancingStrategy;
  maxRetries?: number;
  priority?: 'low' | 'normal' | 'high';
  costSensitivity?: number; // 0-1
  latencySensitivity?: number; // 0-1
  tenantId?: string;
}
```

### SelectedProvider

```typescript
interface SelectedProvider {
  provider: AIProviderType;
  reason: string;
  expectedResponseTime?: number;
  expectedCost?: number;
  routingPath: string[];
  fallbackHistory: FallbackEvent[];
}
```

### Provider Health Metrics

```typescript
interface ProviderHealthMetrics {
  status: ProviderHealthStatus;
  responseTime: number;
  successRate: number;
  activeConnections: number;
  lastCheck: Date;
  consecutiveFailures: number;
  totalRequests: number;
  errorRate: number;
}
```

## Monitoring and Metrics

### Prometheus Metrics

The system exposes the following metrics:

- `compute_requests_total` - Total requests by provider, type, and status
- `compute_request_duration_seconds` - Request duration histogram
- `compute_request_errors_total` - Error count by type
- `compute_provider_health` - Provider health status (1=healthy, 0.5=degraded, 0=unhealthy)
- `compute_provider_response_time_ms` - Average response time per provider
- `compute_provider_active_connections` - Active connections per provider
- `compute_provider_success_rate` - Success rate per provider
- `compute_circuit_breaker_state` - Circuit breaker state per provider
- `compute_circuit_breaker_transitions_total` - Circuit breaker state transitions
- `compute_routing_decisions_total` - Routing decisions by strategy and reason
- `compute_fallback_events_total` - Fallback events between providers

### Health Check Endpoints

```typescript
// Get all provider health metrics
GET /api/compute/health/providers

// Get specific provider health
GET /api/compute/health/providers/:provider

// Get provider statistics
GET /api/compute/stats/providers

// Prometheus metrics endpoint
GET /metrics
```

## Testing

### Integration Tests

The system includes comprehensive integration tests covering:

- Provider registration and basic routing
- Automatic failover between providers
- Circuit breaker functionality
- Load balancing strategies
- Health monitoring
- Metrics collection

Run tests:

```bash
npm test -- provider-router.integration.spec.ts
```

### Mock Provider for Testing

```typescript
class MockAIProvider implements IAIProvider {
  constructor(
    private readonly providerType: AIProviderType,
    options: { shouldFail?: boolean; responseTime?: number } = {}
  ) {}
  
  // Control mock behavior for testing scenarios
  setShouldFail(shouldFail: boolean): void;
  setResponseTime(responseTime: number): void;
}
```

## Implementation Details

### Circuit Breaker State Machine

```
CLOSED ──(N failures)──► OPEN ──(timeout)──► HALF_OPEN
    ◄──(success threshold)───     │
    │                            ▼
    └──────(any failure)──────────┘
```

### Health Score Calculation

The health-aware routing algorithm calculates a composite score:

```
healthScore = (healthStatus * 0.4) + 
              (latencyScore * 0.3) + 
              (successRate * 0.3)
```

Where:
- `healthStatus`: 1 (healthy), 0.5 (degraded), 0 (unhealthy)
- `latencyScore`: Normalized against 10s maximum
- `successRate`: 0-1 based on recent request success

### Request Flow

1. **Request Reception** - Create routing context with defaults
2. **Provider Selection** - Apply configured load balancing strategy
3. **Circuit Breaker Check** - Verify provider is available
4. **Request Execution** - Call provider with timeout
5. **Response Handling** - Record metrics and update health
6. **Fallback (if needed)** - Retry with next provider in chain

## Performance Considerations

- **Concurrent Request Limits** - Configurable per provider
- **Health Check Overhead** - Minimal impact with 30s intervals
- **Circuit Breaker Efficiency** - Fast failure detection without network calls
- **Metrics Collection** - Async to avoid request latency
- **Memory Usage** - Bounded metrics retention

## Security

- **API Key Management** - Stored securely in provider configurations
- **Request Isolation** - Tenant-based routing and quota management
- **Audit Logging** - Complete request tracing and fallback history
- **Rate Limiting** - Per-provider and per-tenant limits

## Future Enhancements

- **Machine Learning Routing** - Predictive provider selection
- **Geographic Routing** - Region-aware provider selection
- **Cost Optimization** - Real-time price comparison
- **Advanced Metrics** - Custom dashboards and alerting
- **Provider Plugins** - Dynamic provider registration
- **Streaming Support** - Real-time response streaming with failover

## Troubleshooting

### Common Issues

1. **All Providers Unhealthy**
   - Check network connectivity
   - Verify API keys and quotas
   - Review health check logs

2. **Circuit Breaker Stuck Open**
   - Check failure threshold configuration
   - Verify recovery timeout settings
   - Manually reset if needed

3. **Poor Load Balancing**
   - Review provider weights configuration
   - Check health metrics accuracy
   - Verify strategy selection

### Debug Information

Enable debug logging:

```bash
LOG_LEVEL=debug npm start
```

Request tracing includes:
- Provider selection reason
- Complete fallback history
- Performance metrics
- Error details

## Contributing

When adding new providers or features:

1. Implement `IAIProvider` interface
2. Add provider-specific configuration
3. Update integration tests
4. Add relevant metrics
5. Update documentation

## License

This implementation follows the project's Apache 2.0 license.
