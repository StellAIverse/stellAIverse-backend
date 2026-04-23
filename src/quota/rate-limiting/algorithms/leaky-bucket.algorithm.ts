import { RateLimitAlgorithm, RateLimitResult } from "../algorithm.interface";
import Redis from "ioredis";

/**
 * Leaky Bucket Algorithm
 * Smooths out bursts of traffic by processing requests at a constant rate.
 */
export class LeakyBucketAlgorithm implements RateLimitAlgorithm {
  name = "leaky-bucket";

  constructor(private readonly redis: Redis) {}

  async checkRateLimit(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    const redisKey = `ratelimit:lb:${key}`;
    const now = Date.now();
    const leakRate = limit / (windowMs / 1000); // requests per second

    const luaScript = `
      local key = KEYS[1]
      local capacity = tonumber(ARGV[1])
      local leak_rate = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])

      local bucket = redis.call('hgetall', key)
      local last_leak = now
      local water = 0

      if #bucket > 0 then
        local data = {}
        for i = 1, #bucket, 2 do
          data[bucket[i]] = bucket[i+1]
        end
        water = tonumber(data['water'])
        last_leak = tonumber(data['last_leak'])
      end

      -- Leak water
      local elapsed = math.max(0, now - last_leak) / 1000
      water = math.max(0, water - (elapsed * leak_rate))

      local allowed = 0
      if water < capacity then
        water = water + 1
        allowed = 1
      end

      redis.call('hmset', key, 'water', water, 'last_leak', now)
      redis.call('expire', key, math.ceil(${windowMs} / 1000) * 2)

      return {allowed, math.floor(capacity - water)}
    `;

    const [allowed, remaining] = (await this.redis.eval(
      luaScript,
      1,
      redisKey,
      limit,
      leakRate,
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
