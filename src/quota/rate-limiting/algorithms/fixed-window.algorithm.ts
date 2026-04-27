import { RateLimitAlgorithm, RateLimitResult } from "../algorithm.interface";
import Redis from "ioredis";

/**
 * Fixed Window Algorithm
 * Simple and efficient, but has "edge" problems where double the limit can pass at window boundaries.
 */
export class FixedWindowAlgorithm implements RateLimitAlgorithm {
  name = "fixed-window";

  constructor(private readonly redis: Redis) {}

  async checkRateLimit(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    const windowId = Math.floor(Date.now() / windowMs);
    const redisKey = `ratelimit:fw:${key}:${windowId}`;

    const count = await this.redis.incr(redisKey);
    if (count === 1) {
      await this.redis.pexpire(redisKey, windowMs);
    }

    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);

    return {
      allowed,
      remaining,
      resetMs: windowMs - (Date.now() % windowMs),
      limit,
    };
  }
}
