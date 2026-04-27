import { SetMetadata, applyDecorators } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

/**
 * Apply a named throttle configuration to a controller or handler.
 *
 * Usage:
 *   @SensitiveRateLimit('auth')     → 5 req / 60 s
 *   @SensitiveRateLimit('oracle')   → 10 req / 60 s
 *   @SensitiveRateLimit('compute')  → 20 req / 60 s
 */
export type SensitiveTier = 'auth' | 'oracle' | 'compute' | 'default';

const TIER_CONFIG: Record<SensitiveTier, { limit: number; ttl: number }> = {
  auth:    { limit: 5,   ttl: 60_000 },  // 5 req/min – login, wallet-auth, recovery
  oracle:  { limit: 10,  ttl: 60_000 },  // 10 req/min – signed-payload submission
  compute: { limit: 20,  ttl: 60_000 },  // 20 req/min – compute job queueing
  default: { limit: 60,  ttl: 60_000 },  // 60 req/min – general endpoints
};

export function SensitiveRateLimit(tier: SensitiveTier = 'default') {
  const { limit, ttl } = TIER_CONFIG[tier];
  return applyDecorators(
    Throttle({ default: { limit, ttl } }),
  );
}
