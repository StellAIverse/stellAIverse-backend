import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { PolicyService, PolicyEntity, PolicyScope } from "./policy.service";

export interface QuotaResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

@Injectable()
export class RateLimiterService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly redis: Redis;

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
  }

  async enforce(
    scope: PolicyScope,
    targetId: string,
    requested = 1,
  ): Promise<QuotaResult> {
    const policy = this.policyService.getApplicablePolicy(scope, targetId);
    if (!policy) {
      // fallback: allow if no policy defined
      return { allowed: true, remaining: Infinity, resetMs: 0 };
    }
    return this.checkQuota(
      `${scope}:${targetId}`,
      policy.limit,
      policy.windowMs,
      policy.burst,
      requested,
    );
  }

  private async checkQuota(
    key: string,
    limit: number,
    windowMs: number,
    burst: number,
    requested = 1,
  ): Promise<QuotaResult> {
    try {
      const now = Date.now();
      const result = (await this.redis.eval(
        this.luaScript,
        1,
        `quota:${key}`,
        limit,
        windowMs,
        burst,
        now,
        requested,
      )) as [number, number];

      const [allowed, remaining] = result;

      return {
        allowed: allowed === 1,
        remaining,
        resetMs: windowMs,
      };
    } catch (error) {
      this.logger.error(
        `Failed to check quota for key ${key}: ${error.message}`,
      );
      return { allowed: true, remaining: 0, resetMs: 0 };
    }
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  private readonly luaScript = `...`; // keep your existing Lua script
}
