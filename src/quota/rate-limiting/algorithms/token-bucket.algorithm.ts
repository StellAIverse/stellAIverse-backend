import { RateLimitAlgorithm, RateLimitResult } from "../algorithm.interface";
import Redis from "ioredis";

/**
 * Token Bucket Algorithm
 * Allows for bursts of traffic. Tokens are added to the bucket at a fixed rate.
 */
export class TokenBucketAlgorithm implements RateLimitAlgorithm {
  name = "token-bucket";

  constructor(private readonly redis: Redis) {}

  async checkRateLimit(
    key: string,
    limit: number,
    windowMs: number,
    burst: number = 0,
  ): Promise<RateLimitResult> {
    const redisKey = `ratelimit:tb:${key}`;
    const now = Date.now();
    const refillRate = limit / (windowMs / 1000); // tokens per second
    const capacity = limit + burst;

    const luaScript = `
      local key = KEYS[1]
      local capacity = tonumber(ARGV[1])
      local refill_rate = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local requested = 1

      local bucket = redis.call('hgetall', key)
      local last_refill = now
      local tokens = capacity

      if #bucket > 0 then
        local data = {}
        for i = 1, #bucket, 2 do
          data[bucket[i]] = bucket[i+1]
        end
        tokens = tonumber(data['tokens'])
        last_refill = tonumber(data['last_refill'])
      end

      local elapsed = math.max(0, now - last_refill) / 1000
      tokens = math.min(capacity, tokens + (elapsed * refill_rate))

      local allowed = 0
      if tokens >= requested then
        tokens = tokens - requested
        allowed = 1
      end

      redis.call('hmset', key, 'tokens', tokens, 'last_refill', now)
      redis.call('expire', key, math.ceil(${windowMs} / 1000) * 2)

      return {allowed, math.floor(tokens)}
    `;

    const [allowed, remaining] = (await this.redis.eval(
      luaScript,
      1,
      redisKey,
      capacity,
      refillRate,
      now,
    )) as [number, number];

    return {
      allowed: allowed === 1,
      remaining,
      resetMs: windowMs,
      limit,
    };
  }
}
