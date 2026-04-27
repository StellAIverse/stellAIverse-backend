/**
 * Rate limit decorator specifically for referral operations
 * Uses different limits than general rate limiting
 */
import { SetMetadata } from "@nestjs/common";

export const REFERRAL_RATE_LIMIT_KEY = "referral_rate_limit";

export interface ReferralRateLimitOptions {
  limit: number;
  windowMs: number;
  keyPrefix?: string;
}

/**
 * Apply rate limiting to referral endpoints
 * @param options - Rate limit configuration
 *
 * @example
 * @ReferralRateLimit({ limit: 10, windowMs: 3600000 }) // 10 requests per hour
 * @Post('codes')
 * createReferralCode() { ... }
 */
export const ReferralRateLimit = (options: ReferralRateLimitOptions) =>
  SetMetadata(REFERRAL_RATE_LIMIT_KEY, options);
