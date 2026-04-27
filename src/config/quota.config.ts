export interface QuotaConfig {
  name: string;
  limit: number; // Number of tokens in the bucket
  windowMs: number; // Time window for refill
  burst: number; // Maximum burst size (capacity)
}

export const QUOTA_LEVELS: Record<string, QuotaConfig> = {
  free: {
    name: "Free Tier",
    limit: 10,
    windowMs: 60_000, // 10 requests per minute
    burst: 15,
  },
  standard: {
    name: "Standard Tier",
    limit: 100,
    windowMs: 60_000, // 100 requests per minute
    burst: 120,
  },
  premium: {
    name: "Premium Tier",
    limit: 1000,
    windowMs: 60_000, // 1000 requests per minute
    burst: 1200,
  },
  internal: {
    name: "Internal Services",
    limit: 10000,
    windowMs: 60_000,
    burst: 15000,
  },
};

export const DEFAULT_QUOTA = QUOTA_LEVELS.free;
