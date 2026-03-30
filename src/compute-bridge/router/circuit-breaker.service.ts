import { Injectable, Logger } from "@nestjs/common";
import { AIProviderType } from "../provider.interface";
import {
  CircuitBreakerState,
  CircuitBreakerConfig,
  ProviderHealthStatus,
} from "./routing.interface";

/**
 * Internal circuit breaker state tracking
 */
interface InternalCircuitBreakerState {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime: Date;
  nextAttemptTime: Date;
  currentBackoff: number;
}

/**
 * Circuit breaker event
 */
export interface CircuitBreakerEvent {
  provider: AIProviderType;
  state: CircuitBreakerState;
  timestamp: Date;
  reason?: string;
}

/**
 * Circuit Breaker Service
 *
 * Implements the circuit breaker pattern to prevent cascading failures
 * and provide automatic recovery with exponential backoff.
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly circuitBreakers = new Map<
    AIProviderType,
    InternalCircuitBreakerState
  >();
  private readonly eventListeners = new Set<
    (event: CircuitBreakerEvent) => void
  >();

  constructor() {}

  /**
   * Initialize circuit breaker for a provider
   */
  initializeCircuitBreaker(
    provider: AIProviderType,
    config: CircuitBreakerConfig,
  ): void {
    const state: InternalCircuitBreakerState = {
      state: CircuitBreakerState.CLOSED,
      failureCount: 0,
      successCount: 0,
      lastFailureTime: new Date(),
      nextAttemptTime: new Date(),
      currentBackoff: config.recoveryTimeout,
    };

    this.circuitBreakers.set(provider, state);
    this.logger.log(`Circuit breaker initialized for provider: ${provider}`);
  }

  /**
   * Check if a request can be executed for a provider
   */
  canExecute(provider: AIProviderType): boolean {
    const breaker = this.circuitBreakers.get(provider);
    if (!breaker) {
      this.logger.warn(`Circuit breaker not found for provider: ${provider}`);
      return true; // Allow if no circuit breaker exists
    }

    const now = new Date();

    switch (breaker.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        // Check if recovery timeout has passed
        if (now >= breaker.nextAttemptTime) {
          this.transitionToHalfOpen(provider, "Recovery timeout elapsed");
          return true;
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        return true;

      default:
        return false;
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(provider: AIProviderType): void {
    const breaker = this.circuitBreakers.get(provider);
    if (!breaker) return;

    breaker.successCount++;

    switch (breaker.state) {
      case CircuitBreakerState.CLOSED:
        // Reset failure count on success
        breaker.failureCount = 0;
        break;

      case CircuitBreakerState.HALF_OPEN:
        // Check if we've reached success threshold
        if (breaker.successCount >= this.getSuccessThreshold(provider)) {
          this.transitionToClosed(provider, "Success threshold reached");
        }
        break;

      case CircuitBreakerState.OPEN:
        // Should not happen, but handle gracefully
        this.logger.warn(
          `Success recorded in OPEN state for provider: ${provider}`,
        );
        break;
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(provider: AIProviderType, error?: string): void {
    const breaker = this.circuitBreakers.get(provider);
    if (!breaker) return;

    breaker.failureCount++;
    breaker.lastFailureTime = new Date();

    switch (breaker.state) {
      case CircuitBreakerState.CLOSED:
        // Check if failure threshold is reached
        if (breaker.failureCount >= this.getFailureThreshold(provider)) {
          this.transitionToOpen(provider, error || "Failure threshold reached");
        }
        break;

      case CircuitBreakerState.HALF_OPEN:
        // Any failure in half-open state opens the circuit
        this.transitionToOpen(provider, error || "Failure in half-open state");
        break;

      case CircuitBreakerState.OPEN:
        // Already open, just update backoff
        this.updateBackoff(provider);
        break;
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(provider: AIProviderType): CircuitBreakerState | undefined {
    return this.circuitBreakers.get(provider)?.state;
  }

  /**
   * Get all circuit breaker states
   */
  getAllStates(): Map<AIProviderType, CircuitBreakerState> {
    const result = new Map<AIProviderType, CircuitBreakerState>();
    for (const [provider, breaker] of this.circuitBreakers) {
      result.set(provider, breaker.state);
    }
    return result;
  }

  /**
   * Get providers with closed circuit breakers (available)
   */
  getAvailableProviders(): AIProviderType[] {
    const available: AIProviderType[] = [];
    for (const [provider, breaker] of this.circuitBreakers) {
      if (
        breaker.state === CircuitBreakerState.CLOSED ||
        breaker.state === CircuitBreakerState.HALF_OPEN
      ) {
        available.push(provider);
      }
    }
    return available;
  }

  /**
   * Manually reset circuit breaker for a provider
   */
  resetCircuitBreaker(provider: AIProviderType): void {
    const breaker = this.circuitBreakers.get(provider);
    if (breaker) {
      this.transitionToClosed(provider, "Manual reset");
    }
  }

  /**
   * Add event listener for circuit breaker events
   */
  addEventListener(listener: (event: CircuitBreakerEvent) => void): void {
    this.eventListeners.add(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: (event: CircuitBreakerEvent) => void): void {
    this.eventListeners.delete(listener);
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(provider: AIProviderType, reason: string): void {
    const breaker = this.circuitBreakers.get(provider);
    if (!breaker) return;

    const oldState = breaker.state;
    breaker.state = CircuitBreakerState.CLOSED;
    breaker.failureCount = 0;
    breaker.successCount = 0;
    breaker.currentBackoff = this.getRecoveryTimeout(provider);

    this.emitEvent(provider, oldState, CircuitBreakerState.CLOSED, reason);
    this.logger.log(
      `Circuit breaker CLOSED for provider: ${provider} - ${reason}`,
    );
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(provider: AIProviderType, reason: string): void {
    const breaker = this.circuitBreakers.get(provider);
    if (!breaker) return;

    const oldState = breaker.state;
    breaker.state = CircuitBreakerState.OPEN;
    breaker.successCount = 0;
    breaker.nextAttemptTime = new Date(Date.now() + breaker.currentBackoff);

    this.emitEvent(provider, oldState, CircuitBreakerState.OPEN, reason);
    this.logger.warn(
      `Circuit breaker OPEN for provider: ${provider} - ${reason}`,
    );
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(provider: AIProviderType, reason: string): void {
    const breaker = this.circuitBreakers.get(provider);
    if (!breaker) return;

    const oldState = breaker.state;
    breaker.state = CircuitBreakerState.HALF_OPEN;
    breaker.successCount = 0;

    this.emitEvent(provider, oldState, CircuitBreakerState.HALF_OPEN, reason);
    this.logger.log(
      `Circuit breaker HALF_OPEN for provider: ${provider} - ${reason}`,
    );
  }

  /**
   * Update exponential backoff
   */
  private updateBackoff(provider: AIProviderType): void {
    const breaker = this.circuitBreakers.get(provider);
    if (!breaker) return;

    const config = this.getConfig(provider);
    if (config?.backoffMultiplier) {
      breaker.currentBackoff = Math.min(
        breaker.currentBackoff * config.backoffMultiplier,
        config.maxBackoffTime || breaker.currentBackoff * 2,
      );
    }

    breaker.nextAttemptTime = new Date(Date.now() + breaker.currentBackoff);
  }

  /**
   * Emit circuit breaker event
   */
  private emitEvent(
    provider: AIProviderType,
    oldState: CircuitBreakerState,
    newState: CircuitBreakerState,
    reason: string,
  ): void {
    const event: CircuitBreakerEvent = {
      provider,
      state: newState,
      timestamp: new Date(),
      reason,
    };

    this.eventListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        this.logger.error("Error in circuit breaker event listener:", error);
      }
    });
  }

  /**
   * Helper methods to get configuration values
   * These would be injected from configuration in a real implementation
   */
  private getFailureThreshold(provider: AIProviderType): number {
    // TODO: Get from configuration
    return 5;
  }

  private getSuccessThreshold(provider: AIProviderType): number {
    // TODO: Get from configuration
    return 3;
  }

  private getRecoveryTimeout(provider: AIProviderType): number {
    // TODO: Get from configuration
    return 30000; // 30 seconds
  }

  private getConfig(
    provider: AIProviderType,
  ): CircuitBreakerConfig | undefined {
    // TODO: Get from configuration service
    return undefined;
  }
}
