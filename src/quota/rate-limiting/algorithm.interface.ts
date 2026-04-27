export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  limit: number;
}

export interface RateLimitAlgorithm {
  name: string;
  
  /**
   * Check if the request is allowed
   * @param key The unique key for rate limiting (e.g. user ID + endpoint)
   * @param limit Maximum number of requests
   * @param windowMs Time window in milliseconds
   * @param burst Burst allowance
   */
  checkRateLimit(
    key: string,
    limit: number,
    windowMs: number,
    burst?: number,
  ): Promise<RateLimitResult>;
}
