import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { PolicyService } from "./policy.service";
import { PolicyScope, RateLimitAlgorithmType } from "./policy.entity";
import { RateLimitAlgorithm, RateLimitResult } from "./rate-limiting/algorithm.interface";
import { TokenBucketAlgorithm } from "./rate-limiting/algorithms/token-bucket.algorithm";
import { SlidingWindowAlgorithm } from "./rate-limiting/algorithms/sliding-window.algorithm";
import { LeakyBucketAlgorithm } from "./rate-limiting/algorithms/leaky-bucket.algorithm";
import { FixedWindowAlgorithm } from "./rate-limiting/algorithms/fixed-window.algorithm";

export interface QuotaResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

@Injectable()
export class RateLimiterService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly redis: Redis;
  private readonly algorithms: Map<RateLimitAlgorithmType, RateLimitAlgorithm> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly policyService: PolicyService,
  ) {
    const redisUrl = this.configService.get<string>(
      "REDIS_URL",
      "redis://localhost:6379",
    );
    this.redis = new Redis(redisUrl);

    this.redis.on("error", (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });

    // Initialize algorithms
    this.algorithms.set(RateLimitAlgorithmType.TOKEN_BUCKET, new TokenBucketAlgorithm(this.redis));
    this.algorithms.set(RateLimitAlgorithmType.SLIDING_WINDOW, new SlidingWindowAlgorithm(this.redis));
    this.algorithms.set(RateLimitAlgorithmType.LEAKY_BUCKET, new LeakyBucketAlgorithm(this.redis));
    this.algorithms.set(RateLimitAlgorithmType.FIXED_WINDOW, new FixedWindowAlgorithm(this.redis));
  }

  async enforce(
    userId: string,
    scope: PolicyScope,
    targetId?: string,
    context: any = {},
  ): Promise<QuotaResult> {
    const policy = await this.policyService.getApplicablePolicy(userId, scope, targetId, context);
    
    if (!policy) {
      // fallback: allow if no policy defined
      return { allowed: true, remaining: Infinity, resetMs: 0 };
    }

    const algorithm = this.algorithms.get(policy.algorithm || RateLimitAlgorithmType.TOKEN_BUCKET);
    if (!algorithm) {
      this.logger.error(`Algorithm ${policy.algorithm} not found, falling back to Fixed Window`);
      return this.algorithms.get(RateLimitAlgorithmType.FIXED_WINDOW).checkRateLimit(
        `${scope}:${targetId || userId}`,
        policy.limit,
        policy.windowMs,
      );
    }

    const result = await algorithm.checkRateLimit(
      `${scope}:${targetId || userId}`,
      policy.limit,
      policy.windowMs,
      policy.burst,
    );

    return {
      allowed: result.allowed,
      remaining: result.remaining,
      resetMs: result.resetMs,
    };
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
