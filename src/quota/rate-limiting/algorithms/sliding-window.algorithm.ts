import { RateLimitAlgorithm, RateLimitResult } from "../algorithm.interface";
import Redis from "ioredis";

/**
 * Sliding Window Log Algorithm
 * Very accurate but memory intensive for high traffic.
 */
export class SlidingWindowAlgorithm implements RateLimitAlgorithm {
  name = "sliding-window";

  constructor(private readonly redis: Redis) {}

  async checkRateLimit(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    const redisKey = `ratelimit:sw:${key}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    const luaScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window_start = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])

      -- Remove old entries
      redis.call('zremrangebyscore', key, 0, window_start)

      -- Count current entries
      local current_count = redis.call('zcard', key)

      local allowed = 0
      if current_count < limit then
        redis.call('zadd', key, now, now)
        current_count = current_count + 1
        allowed = 1
      end

      redis.call('expire', key, math.ceil(${windowMs} / 1000))

      return {allowed, limit - current_count}
    `;

    const [allowed, remaining] = (await this.redis.eval(
      luaScript,
      1,
      redisKey,
      now,
      windowStart,
      limit,
    )) as [number, number];

    return {
      allowed: allowed === 1,
      remaining,
      resetMs: windowMs,
      limit,
    };
  }
}
