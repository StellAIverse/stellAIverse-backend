import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
  Optional,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RateLimiterService } from "../../quota/rate-limiter.service";
import { DynamicRateLimitScalingService } from "../../quota/dynamic-rate-limit-scaling.service";
import { PremiumFeatureBonusService } from "../../quota/premium-feature-bonus.service";
import { AnalyticsDashboardService } from "../../observability/analytics-dashboard.service";
import { MetricsService } from "../../observability/metrics.service";
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
} from "../decorators/rate-limit.decorator";
import { QUOTA_LEVELS, DEFAULT_QUOTA } from "../../config/quota.config";

@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimiterService: RateLimiterService,
    @Optional()
    private readonly dynamicScaling?: DynamicRateLimitScalingService,
    @Optional()
    private readonly premiumBonus?: PremiumFeatureBonusService,
    @Optional() private readonly analytics?: AnalyticsDashboardService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const trackerKey = this.getTrackerKey(request);

    // Merge options with level config
    const levelConfig = QUOTA_LEVELS[options.level || "free"] || DEFAULT_QUOTA;
    const baseLimit = options.limit ?? levelConfig.limit;
    const baseWindowMs = options.windowMs ?? levelConfig.windowMs;
    const baseBurst = options.burst ?? levelConfig.burst;

    const endpoint = request.route?.path || request.originalUrl || request.url || "unknown";
    const userId = String(request.user?.id || trackerKey);
    const userTier = request.user?.tier || options.level || "unknown";
    const policy = options.level || "custom";

    const dynamic = this.dynamicScaling?.getAdjustment({
      key: trackerKey,
      userId,
      endpoint,
      policy,
      baseLimit,
      baseWindowMs,
      baseBurst,
    });

    const dynamicLimit = dynamic?.limit ?? baseLimit;
    const dynamicWindowMs = dynamic?.windowMs ?? baseWindowMs;
    const dynamicBurst = dynamic?.burst ?? baseBurst;

    if (dynamic) {
      const direction =
        dynamic.multiplier > 1.01 ? "up" : dynamic.multiplier < 0.99 ? "down" : "stable";
      this.metrics?.rateLimitScalingDecisions.inc({
        policy,
        endpoint,
        direction,
        predicted_burst: String(dynamic.predictedBurst),
      });
      this.metrics?.rateLimitScalingMultiplier.set(
        {
          policy,
          endpoint,
        },
        dynamic.multiplier,
      );
      this.metrics?.rateLimitPredictionConfidence.set(
        {
          policy,
          endpoint,
        },
        dynamic.confidence,
      );
      this.metrics?.rateLimitPredictionLatency.observe(
        {
          policy,
          endpoint,
        },
        dynamic.predictionLatencyMs,
      );
    }

    const control = this.analytics?.getEffectiveControl(
      request.user?.id,
      dynamicLimit,
      dynamicWindowMs,
      dynamicBurst,
    );

    const controlledLimit = control?.limit ?? dynamicLimit;
    const controlledWindowMs = control?.windowMs ?? dynamicWindowMs;
    const controlledBurst = control?.burst ?? dynamicBurst;

    const premiumAdjustment = this.premiumBonus
      ? await this.premiumBonus.getAdjustment({
          userId,
          userTier: String(userTier),
          endpoint,
          policy,
          baseLimit: controlledLimit,
          baseWindowMs: controlledWindowMs,
          baseBurst: controlledBurst,
        })
      : undefined;

    const limit = premiumAdjustment?.limit ?? controlledLimit;
    const windowMs = premiumAdjustment?.windowMs ?? controlledWindowMs;
    const burst = premiumAdjustment?.burst ?? controlledBurst;

    const startedAt = Date.now();

    const result = await this.rateLimiterService.checkQuota(
      trackerKey,
      limit,
      windowMs,
      burst,
    );

    const decisionMs = Date.now() - startedAt;

    this.metrics?.rateLimitHits.inc({ policy, user_tier: userTier, endpoint });
    this.metrics?.rateLimitCurrentUsage.set(
      {
        policy,
        user_id: String(userId),
        endpoint,
      },
      Math.max(0, limit - result.remaining),
    );
    this.metrics?.rateLimitResetTime.set(
      {
        policy,
        user_id: String(userId),
        endpoint,
      },
      Date.now() + result.resetMs,
    );

    if (!result.allowed) {
      this.metrics?.rateLimitExceeded.inc({ policy, user_tier: userTier, endpoint });
      this.metrics?.throttlingEvents.inc({
        severity: result.remaining <= 0 ? "high" : "medium",
        policy,
        user_tier: userTier,
      });
    }

    if (premiumAdjustment && premiumAdjustment.bonusApplied) {
      this.metrics?.premiumTierUsage.inc({
        feature: premiumAdjustment.feature,
        user_tier: String(userTier),
        plan: policy,
      });

      this.metrics?.premiumBonusClaims.inc({
        bonus_type: premiumAdjustment.activeBoostIds.length > 0 ? "boost" : "tier",
        user_tier: String(userTier),
        source: premiumAdjustment.activeBoostIds.length > 0 ? "manual_or_campaign" : "tier_policy",
      });

      if (premiumAdjustment.componentMultipliers.referral > 0) {
        this.metrics?.referralBonusUsage.inc({
          bonus_type: "rate_limit",
          referrer_tier: String(userTier),
          referee_tier: String(userTier),
        });
      }
    }

    this.dynamicScaling?.recordFeedback({
      context: {
        key: trackerKey,
        userId,
        endpoint,
        policy,
        baseLimit,
        baseWindowMs,
        baseBurst,
      },
      allowed: result.allowed,
      remaining: result.remaining,
    });

    if (premiumAdjustment) {
      this.premiumBonus?.recordUsage({
        userId,
        userTier: String(userTier),
        endpoint,
        feature: premiumAdjustment.feature,
        policy,
        baseLimit: controlledLimit,
        effectiveLimit: limit,
        allowed: result.allowed,
        remaining: result.remaining,
        adjustment: premiumAdjustment,
      });
    }

    this.analytics?.recordRateLimitDecision({
      key: trackerKey,
      userId: String(userId),
      endpoint,
      policy,
      userTier: String(userTier),
      allowed: result.allowed,
      remaining: result.remaining,
      limit,
      resetMs: result.resetMs,
      decisionMs,
    });

    const response = context.switchToHttp().getResponse();

    // Set headers
    response.header("X-RateLimit-Limit", limit);
    response.header("X-RateLimit-Remaining", result.remaining);
    response.header(
      "X-RateLimit-Reset",
      new Date(Date.now() + result.resetMs).toISOString(),
    );

    if (!result.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Rate limit exceeded",
          retryAfterMs: result.resetMs,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private getTrackerKey(req: any): string {
    const userId = req.user?.id;
    if (userId) {
      return `user:${userId}`;
    }

    const xff = req.headers?.["x-forwarded-for"];
    const ip = typeof xff === "string" ? xff.split(",")[0].trim() : req.ip;

    return `ip:${ip || "unknown"}`;
  }
}
