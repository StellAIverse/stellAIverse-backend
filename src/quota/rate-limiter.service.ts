import { Injectable } from "@nestjs/common";

export interface QuotaResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

@Injectable()
export class RateLimiterService {
  async checkQuota(
    _key: string,
    limit: number,
    _windowMs: number,
    _burst?: number,
  ): Promise<QuotaResult> {
    return { allowed: true, remaining: limit, resetMs: 0 };
  }
}
