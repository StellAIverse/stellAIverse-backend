import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface RetryBackoffPolicy {
  type: "fixed" | "exponential" | "linear" | "custom";
  delay: number;
  factor?: number; // For exponential backoff
  maxDelay?: number; // Maximum delay cap
}

export interface RetryPolicy {
  maxAttempts: number;
  backoff: RetryBackoffPolicy;
  retryIf?: (error: Error) => boolean; // Custom retry condition
  jitter?: boolean; // Add randomness to delays to prevent thundering herd
  minDelay?: number; // Minimum delay between retries
}

type RetryPolicyMap = Record<string, Partial<RetryPolicy>>;

@Injectable()
export class RetryPolicyService {
  private readonly logger = new Logger(RetryPolicyService.name);

  private readonly defaultPolicy: RetryPolicy = {
    maxAttempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
      factor: 2,
      maxDelay: 30000, // 30 seconds max
    },
    jitter: true,
  };

  private readonly defaultTypePolicies: Record<string, RetryPolicy> = {
    "email-notification": {
      maxAttempts: 2,
      backoff: { type: "fixed", delay: 1000 },
      jitter: false,
    },
    "batch-operation": {
      maxAttempts: 5,
      backoff: {
        type: "exponential",
        delay: 1000,
        factor: 1.5,
        maxDelay: 60000, // 1 minute max
      },
      jitter: true,
    },
    "data-processing": {
      maxAttempts: 3,
      backoff: {
        type: "linear",
        delay: 2000,
        maxDelay: 10000, // 10 seconds max
      },
      jitter: true,
    },
    "ai-computation": {
      maxAttempts: 4,
      backoff: {
        type: "exponential",
        delay: 3000,
        factor: 2,
        maxDelay: 120000, // 2 minutes max
      },
      jitter: true,
    },
  };

  private readonly configuredPolicies: Record<string, RetryPolicy>;

  constructor(private readonly configService: ConfigService) {
    this.configuredPolicies = this.loadConfiguredPolicies();
  }

  getPolicy(jobType: string): RetryPolicy {
    return {
      ...this.defaultPolicy,
      ...(this.configuredPolicies[jobType] ||
        this.defaultTypePolicies[jobType]),
    };
  }

  /**
   * Calculate the delay for the next retry attempt
   */
  calculateRetryDelay(policy: RetryPolicy, attemptNumber: number): number {
    let delay: number;

    switch (policy.backoff.type) {
      case "fixed":
        delay = policy.backoff.delay;
        break;

      case "linear":
        delay = policy.backoff.delay * attemptNumber;
        break;

      case "exponential":
        const factor = policy.backoff.factor || 2;
        delay = policy.backoff.delay * Math.pow(factor, attemptNumber - 1);
        break;

      case "custom":
        // For custom backoff, use the base delay with multiplier
        delay = policy.backoff.delay * attemptNumber;
        break;

      default:
        delay = policy.backoff.delay;
    }

    // Apply minimum delay constraint
    if (policy.minDelay && delay < policy.minDelay) {
      delay = policy.minDelay;
    }

    // Apply maximum delay constraint
    if (policy.backoff.maxDelay && delay > policy.backoff.maxDelay) {
      delay = policy.backoff.maxDelay;
    }

    // Apply jitter if enabled
    if (policy.jitter) {
      const jitterFactor = 0.1; // 10% jitter
      const jitter = Math.random() * delay * jitterFactor;
      delay = delay + jitter;
    }

    return Math.floor(delay);
  }

  /**
   * Determine if a job should be retried based on the error and policy
   */
  shouldRetry(
    jobType: string,
    error: Error,
    attemptNumber: number,
    maxAttempts: number,
  ): boolean {
    const policy = this.getPolicy(jobType);

    // Don't retry if max attempts reached
    if (attemptNumber >= maxAttempts) {
      return false;
    }

    // Check custom retry condition if provided
    if (policy.retryIf) {
      return policy.retryIf(error);
    }

    // Default retry logic - don't retry for certain error types
    const nonRetryableErrors = [
      "ValidationError",
      "AuthenticationError",
      "BadRequestError",
      "UnauthorizedError",
      "NotFoundError",
      "Email recipient is required",
    ];

    const isNonRetryable = nonRetryableErrors.some(
      (errType) => error.name === errType || error.message.includes(errType),
    );

    return !isNonRetryable;
  }

  private loadConfiguredPolicies(): Record<string, RetryPolicy> {
    const raw = this.configService.get<string>("COMPUTE_JOB_RETRY_POLICIES");
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw) as RetryPolicyMap;
      const result: Record<string, RetryPolicy> = {};

      for (const [jobType, policy] of Object.entries(parsed)) {
        const merged = this.normalizePolicy(policy);
        if (merged) {
          result[jobType] = merged;
        }
      }

      return result;
    } catch (error) {
      this.logger.warn(
        `Invalid COMPUTE_JOB_RETRY_POLICIES JSON. Falling back to defaults: ${error.message}`,
      );
      return {};
    }
  }

  private normalizePolicy(policy: Partial<RetryPolicy>): RetryPolicy | null {
    const maxAttempts = Number(policy?.maxAttempts);
    const backoffType = policy?.backoff?.type;
    const backoffDelay = Number(policy?.backoff?.delay);
    const backoffFactor = Number(policy?.backoff?.factor);
    const backoffMaxDelay = Number(policy?.backoff?.maxDelay);
    const minDelay = Number(policy?.minDelay);

    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      return null;
    }

    if (
      !["fixed", "exponential", "linear", "custom"].includes(backoffType) ||
      !Number.isFinite(backoffDelay) ||
      backoffDelay < 0
    ) {
      return null;
    }

    const normalizedPolicy: RetryPolicy = {
      maxAttempts,
      backoff: {
        type: backoffType,
        delay: backoffDelay,
      },
    };

    if (Number.isFinite(backoffFactor)) {
      normalizedPolicy.backoff.factor = backoffFactor;
    }

    if (Number.isFinite(backoffMaxDelay)) {
      normalizedPolicy.backoff.maxDelay = backoffMaxDelay;
    }

    if (Number.isFinite(minDelay)) {
      normalizedPolicy.minDelay = minDelay;
    }

    if (typeof policy.jitter === "boolean") {
      normalizedPolicy.jitter = policy.jitter;
    }

    return normalizedPolicy;
  }
}
