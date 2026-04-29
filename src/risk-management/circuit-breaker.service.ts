import { Injectable, Logger } from '@nestjs/common';

type CircuitState = 'closed' | 'open' | 'half-open';

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime?: Date;
  private readonly failureThreshold = 5;
  private readonly recoveryTimeMs = 60000; // 1 minute

  isOpen(): boolean {
    if (this.state === 'open') {
      // Auto-transition to half-open after recovery time
      if (this.lastFailureTime && Date.now() - this.lastFailureTime.getTime() > this.recoveryTimeMs) {
        this.state = 'half-open';
        this.logger.log('Circuit breaker transitioned to half-open');
      }
    }
    return this.state === 'open';
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.reset();
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      this.logger.warn(`Circuit breaker OPENED after ${this.failureCount} failures`);
    }
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.lastFailureTime = undefined;
    this.logger.log('Circuit breaker reset to closed');
  }

  getStatus(): { state: CircuitState; failureCount: number; lastFailureTime?: Date } {
    return { state: this.state, failureCount: this.failureCount, lastFailureTime: this.lastFailureTime };
  }
}
