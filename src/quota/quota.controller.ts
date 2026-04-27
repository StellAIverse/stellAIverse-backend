import { Controller, Get, Request, UseGuards } from "@nestjs/common";
import { RateLimiterService } from "./rate-limiter.service";
import { QUOTA_LEVELS, DEFAULT_QUOTA } from "../config/quota.config";
import { AuthGuard } from "@nestjs/passport";
import { PremiumFeatureBonusService } from "./premium-feature-bonus.service";

@Controller("quota")
export class QuotaController {
  constructor(
    private readonly rateLimiterService: RateLimiterService,
    private readonly premiumBonus: PremiumFeatureBonusService,
  ) {}

  @Get("usage")
  @UseGuards(AuthGuard("jwt"))
  async getUsage(@Request() req: any) {
    const userId = req.user.id;
    // Assuming we want to check against 'standard' level for authenticated users by default
    // or we could fetch user's tier from their profile.
    const level = req.user.tier || "standard";
    const config = QUOTA_LEVELS[level] || DEFAULT_QUOTA;

    const premiumAdjustment = await this.premiumBonus.getAdjustment({
      userId,
      userTier: String(level),
      endpoint: req.route?.path || req.originalUrl || req.url || "quota/usage",
      policy: level,
      baseLimit: config.limit,
      baseWindowMs: config.windowMs,
      baseBurst: config.burst,
    });

    // We use a dummy call (requested=0) to check state without consuming
    const status = await this.rateLimiterService.checkQuota(
      `user:${userId}`,
      premiumAdjustment.limit,
      premiumAdjustment.windowMs,
      premiumAdjustment.burst,
      0, // Don't use tokens
    );

    return {
      tier: level,
      config,
      effectiveConfig: {
        limit: premiumAdjustment.limit,
        windowMs: premiumAdjustment.windowMs,
        burst: premiumAdjustment.burst,
      },
      premiumAdjustment,
      remaining: status.remaining,
      resetMs: status.resetMs,
    };
  }
}
