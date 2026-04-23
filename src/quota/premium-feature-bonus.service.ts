import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RewardService } from "../referral/reward.service";
import { RewardStatus } from "../referral/reward.entity";

export interface PremiumBonusPolicy {
  feature: string;
  tierMultipliers: Record<string, number>;
  maxBonusMultiplier: number;
  allowStacking: boolean;
  poolCapacity: number;
  enabled: boolean;
}

export interface PremiumBoost {
  id: string;
  userId: string;
  feature: string;
  bonusMultiplier: number;
  extraLimit: number;
  extraBurst: number;
  expiresAt: Date;
  source: "admin" | "referral" | "campaign" | "system";
  reason: string;
  createdBy: string;
  createdAt: Date;
}

export interface PremiumAdjustmentContext {
  userId: string;
  userTier: string;
  endpoint: string;
  policy: string;
  baseLimit: number;
  baseWindowMs: number;
  baseBurst: number;
}

export interface PremiumAdjustment {
  feature: string;
  limit: number;
  windowMs: number;
  burst: number;
  bonusApplied: boolean;
  totalMultiplier: number;
  componentMultipliers: {
    tier: number;
    referral: number;
    boosts: number;
    adaptive: number;
  };
  reasons: string[];
  activeBoostIds: string[];
}

export interface BonusUsageEvent {
  userId: string;
  userTier: string;
  endpoint: string;
  feature: string;
  policy: string;
  baseLimit: number;
  effectiveLimit: number;
  allowed: boolean;
  remaining: number;
  adjustment: PremiumAdjustment;
}

export interface BonusOperationLog {
  id: string;
  type:
    | "policy_update"
    | "boost_allocated"
    | "boost_revoked"
    | "emergency_toggle"
    | "pool_reset";
  actor: string;
  feature?: string;
  userId?: string;
  details: Record<string, unknown>;
  createdAt: Date;
}

interface FeaturePoolState {
  feature: string;
  capacity: number;
  allocated: number;
  consumed: number;
}

interface ReferralProfile {
  lastCheckedAt: number;
  expiresAt: number;
  eligible: boolean;
  awardedRewards: number;
}

interface FeatureLearningState {
  adaptiveMultiplier: number;
  ewmaUsageRatio: number;
  ewmaExceededRatio: number;
  lastUpdatedAt: number;
}

@Injectable()
export class PremiumFeatureBonusService {
  private readonly logger = new Logger(PremiumFeatureBonusService.name);

  private readonly policies = new Map<string, PremiumBonusPolicy>();
  private readonly boostsByUser = new Map<string, PremiumBoost[]>();
  private readonly pools = new Map<string, FeaturePoolState>();
  private readonly operationLogs: BonusOperationLog[] = [];
  private readonly usageEvents: BonusUsageEvent[] = [];
  private readonly referralCache = new Map<string, ReferralProfile>();
  private readonly learningState = new Map<string, FeatureLearningState>();
  private readonly smoothing = new Map<string, number>();

  private readonly maxLogs = 20_000;
  private readonly maxUsageEvents = 50_000;
  private readonly maxActiveBoostsPerUser: number;
  private readonly maxTotalMultiplier: number;
  private readonly maxStepPerDecision: number;
  private readonly referralCacheTtlMs: number;
  private readonly referralBonusMultiplier: number;
  private readonly tierNames: Set<string>;

  private emergency = {
    enabled: false,
    multiplier: 1,
    reason: "",
    updatedAt: undefined as Date | undefined,
    updatedBy: undefined as string | undefined,
  };

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly rewardService?: RewardService,
  ) {
    this.maxActiveBoostsPerUser = this.getNumber(
      "PREMIUM_BONUS_MAX_ACTIVE_BOOSTS_PER_USER",
      5,
      1,
      50,
    );
    this.maxTotalMultiplier = this.getNumber(
      "PREMIUM_BONUS_MAX_TOTAL_MULTIPLIER",
      2.5,
      1,
      8,
    );
    this.maxStepPerDecision = this.getNumber(
      "PREMIUM_BONUS_MAX_STEP_PER_DECISION",
      0.18,
      0.01,
      1,
    );
    this.referralCacheTtlMs = this.getNumber(
      "PREMIUM_BONUS_REFERRAL_CACHE_TTL_MS",
      60_000,
      5_000,
      15 * 60_000,
    );
    this.referralBonusMultiplier = this.getNumber(
      "PREMIUM_BONUS_REFERRAL_MULTIPLIER",
      0.08,
      0,
      1,
    );

    const configuredTiers = this.configService
      .get<string>("PREMIUM_ELIGIBLE_TIERS", "premium,enterprise,vip")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    this.tierNames = new Set(configuredTiers);

    this.seedDefaultPolicies();
  }

  async getAdjustment(context: PremiumAdjustmentContext): Promise<PremiumAdjustment> {
    this.evictExpiredBoosts();

    const tier = String(context.userTier || "").toLowerCase();
    const feature = this.detectFeature(context.endpoint);
    const policy = this.policies.get(feature) ?? this.policies.get("default");

    const baseResponse: PremiumAdjustment = {
      feature,
      limit: context.baseLimit,
      windowMs: context.baseWindowMs,
      burst: context.baseBurst,
      bonusApplied: false,
      totalMultiplier: 1,
      componentMultipliers: {
        tier: 0,
        referral: 0,
        boosts: 0,
        adaptive: 0,
      },
      reasons: ["no_bonus_applied"],
      activeBoostIds: [],
    };

    if (!policy || !policy.enabled) {
      baseResponse.reasons = ["policy_disabled"];
      return baseResponse;
    }

    if (!this.tierNames.has(tier)) {
      baseResponse.reasons = ["user_tier_not_eligible"];
      return baseResponse;
    }

    const reasons: string[] = [];
    const tierBonus = policy.tierMultipliers[tier] ?? policy.tierMultipliers.premium ?? 0;
    if (tierBonus > 0) {
      reasons.push(`tier_bonus:${tierBonus.toFixed(3)}`);
    }

    const referralBonus = await this.getReferralBonus(context.userId);
    if (referralBonus > 0) {
      reasons.push(`referral_bonus:${referralBonus.toFixed(3)}`);
    }

    const boosts = this.getActiveBoosts(context.userId, feature);
    let boostBonus = 0;
    let boostLimit = 0;
    let boostBurst = 0;

    if (boosts.length > 0) {
      if (policy.allowStacking) {
        boostBonus = boosts.reduce((acc, current) => acc + current.bonusMultiplier, 0);
      } else {
        boostBonus = Math.max(...boosts.map((entry) => entry.bonusMultiplier));
      }
      boostLimit = boosts.reduce((acc, current) => acc + current.extraLimit, 0);
      boostBurst = boosts.reduce((acc, current) => acc + current.extraBurst, 0);
      reasons.push(`active_boosts:${boosts.length}`);
    }

    const adaptiveBonus = this.getAdaptiveBonus(feature);
    if (adaptiveBonus !== 0) {
      reasons.push(`adaptive_bonus:${adaptiveBonus.toFixed(3)}`);
    }

    let totalMultiplier = 1 + tierBonus + referralBonus + boostBonus + adaptiveBonus;

    if (this.emergency.enabled) {
      totalMultiplier *= this.emergency.multiplier;
      reasons.push(`emergency_multiplier:${this.emergency.multiplier.toFixed(2)}`);
    }

    totalMultiplier = this.clamp(totalMultiplier, 1, Math.min(policy.maxBonusMultiplier, this.maxTotalMultiplier));
    totalMultiplier = this.applySmoothing(context.userId, feature, totalMultiplier);

    const baseBonusLimit = Math.max(0, Math.round(context.baseLimit * (totalMultiplier - 1)));
    const pool = this.getOrCreatePool(feature, policy.poolCapacity);
    const availablePool = Math.max(0, pool.capacity - pool.consumed);
    const poolConstrainedBonus = Math.min(baseBonusLimit + boostLimit, availablePool);
    const finalLimit = context.baseLimit + poolConstrainedBonus;

    if (finalLimit === context.baseLimit && (baseBonusLimit > 0 || boostLimit > 0)) {
      reasons.push("pool_exhausted_or_constrained");
    }

    const finalBurst = Math.max(
      context.baseBurst,
      Math.round(context.baseBurst * (1 + (totalMultiplier - 1) * 0.6)) + boostBurst,
    );

    return {
      feature,
      limit: finalLimit,
      windowMs: context.baseWindowMs,
      burst: finalBurst,
      bonusApplied: finalLimit > context.baseLimit || finalBurst > context.baseBurst,
      totalMultiplier,
      componentMultipliers: {
        tier: tierBonus,
        referral: referralBonus,
        boosts: boostBonus,
        adaptive: adaptiveBonus,
      },
      reasons: reasons.length > 0 ? reasons : ["bonus_not_required"],
      activeBoostIds: boosts.map((entry) => entry.id),
    };
  }

  recordUsage(event: BonusUsageEvent): void {
    this.usageEvents.push({
      ...event,
      adjustment: {
        ...event.adjustment,
        reasons: [...event.adjustment.reasons],
        activeBoostIds: [...event.adjustment.activeBoostIds],
      },
    });
    if (this.usageEvents.length > this.maxUsageEvents) {
      this.usageEvents.splice(0, this.usageEvents.length - this.maxUsageEvents);
    }

    const pool = this.pools.get(event.feature);
    if (pool && event.adjustment.bonusApplied) {
      const consumed = Math.max(0, event.effectiveLimit - event.baseLimit);
      pool.consumed = Math.min(pool.capacity, pool.consumed + consumed);
    }

    this.applyLearning(event);
  }

  getUsageSummary(limit = 200) {
    const rows = this.usageEvents.slice(-Math.max(1, Math.min(2_000, limit)));
    const byFeature = new Map<string, { requests: number; bonusHits: number; exceeded: number }>();

    for (const row of rows) {
      if (!byFeature.has(row.feature)) {
        byFeature.set(row.feature, { requests: 0, bonusHits: 0, exceeded: 0 });
      }
      const current = byFeature.get(row.feature);
      current.requests += 1;
      if (row.adjustment.bonusApplied) {
        current.bonusHits += 1;
      }
      if (!row.allowed) {
        current.exceeded += 1;
      }
    }

    return {
      recentEvents: rows,
      byFeature: Array.from(byFeature.entries()).map(([feature, value]) => ({
        feature,
        ...value,
      })),
    };
  }

  listPolicies(): PremiumBonusPolicy[] {
    return Array.from(this.policies.values()).sort((a, b) => a.feature.localeCompare(b.feature));
  }

  upsertPolicy(input: Partial<PremiumBonusPolicy> & { feature: string }, actor = "system") {
    const existing = this.policies.get(input.feature);
    const next: PremiumBonusPolicy = {
      feature: input.feature,
      tierMultipliers: input.tierMultipliers ?? existing?.tierMultipliers ?? { premium: 0.2 },
      maxBonusMultiplier: this.clamp(
        Number(input.maxBonusMultiplier ?? existing?.maxBonusMultiplier ?? this.maxTotalMultiplier),
        1,
        this.maxTotalMultiplier,
      ),
      allowStacking: input.allowStacking ?? existing?.allowStacking ?? true,
      poolCapacity: this.clampInt(
        Number(input.poolCapacity ?? existing?.poolCapacity ?? 20_000),
        100,
        10_000_000,
      ),
      enabled: input.enabled ?? existing?.enabled ?? true,
    };

    this.policies.set(next.feature, next);

    const pool = this.getOrCreatePool(next.feature, next.poolCapacity);
    pool.capacity = next.poolCapacity;

    this.pushOperation({
      type: "policy_update",
      actor,
      feature: next.feature,
      details: {
        policy: next,
      },
    });

    return next;
  }

  allocateBoost(input: {
    userId: string;
    feature: string;
    bonusMultiplier?: number;
    extraLimit?: number;
    extraBurst?: number;
    durationMinutes: number;
    source?: PremiumBoost["source"];
    reason?: string;
    actor: string;
  }): PremiumBoost {
    this.evictExpiredBoosts();

    const feature = input.feature || "default";
    const policy = this.policies.get(feature) ?? this.policies.get("default");

    if (!policy || !policy.enabled) {
      throw new Error(`Cannot allocate boost: policy disabled for feature ${feature}`);
    }

    const existing = this.boostsByUser.get(input.userId) ?? [];
    if (existing.length >= this.maxActiveBoostsPerUser) {
      throw new Error("Maximum active boosts per user reached");
    }

    const durationMs = this.clampInt(input.durationMinutes, 1, 60 * 24 * 30) * 60_000;
    const boost: PremiumBoost = {
      id: `boost_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId: input.userId,
      feature,
      bonusMultiplier: this.clamp(Number(input.bonusMultiplier ?? 0), 0, 1.5),
      extraLimit: this.clampInt(Number(input.extraLimit ?? 0), 0, 500_000),
      extraBurst: this.clampInt(Number(input.extraBurst ?? 0), 0, 100_000),
      expiresAt: new Date(Date.now() + durationMs),
      source: input.source ?? "admin",
      reason: input.reason || "manual allocation",
      createdBy: input.actor,
      createdAt: new Date(),
    };

    const pool = this.getOrCreatePool(feature, policy.poolCapacity);
    const reservationCost = Math.max(0, boost.extraLimit);
    if (pool.allocated + reservationCost > pool.capacity) {
      throw new Error(`Insufficient bonus pool capacity for ${feature}`);
    }

    pool.allocated += reservationCost;

    this.boostsByUser.set(input.userId, [...existing, boost]);

    this.pushOperation({
      type: "boost_allocated",
      actor: input.actor,
      feature,
      userId: input.userId,
      details: {
        boostId: boost.id,
        source: boost.source,
        expiresAt: boost.expiresAt.toISOString(),
      },
    });

    return boost;
  }

  revokeBoost(boostId: string, actor = "system") {
    for (const [userId, boosts] of this.boostsByUser.entries()) {
      const index = boosts.findIndex((entry) => entry.id === boostId);
      if (index < 0) {
        continue;
      }

      const [removed] = boosts.splice(index, 1);
      const policy = this.policies.get(removed.feature);
      const pool = this.getOrCreatePool(removed.feature, policy?.poolCapacity ?? 20_000);
      pool.allocated = Math.max(0, pool.allocated - removed.extraLimit);

      if (boosts.length === 0) {
        this.boostsByUser.delete(userId);
      } else {
        this.boostsByUser.set(userId, boosts);
      }

      this.pushOperation({
        type: "boost_revoked",
        actor,
        feature: removed.feature,
        userId,
        details: { boostId },
      });

      return { removed: true, userId, boostId };
    }

    return { removed: false, boostId };
  }

  listActiveBoosts(userId?: string): PremiumBoost[] {
    this.evictExpiredBoosts();
    const rows = userId
      ? this.boostsByUser.get(userId) ?? []
      : Array.from(this.boostsByUser.values()).flat();

    return [...rows].sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime());
  }

  getPoolStatus() {
    return Array.from(this.pools.values())
      .map((entry) => ({
        feature: entry.feature,
        capacity: entry.capacity,
        allocated: entry.allocated,
        consumed: entry.consumed,
        available: Math.max(0, entry.capacity - entry.consumed),
      }))
      .sort((a, b) => a.feature.localeCompare(b.feature));
  }

  resetPool(feature: string, actor = "system") {
    const policy = this.policies.get(feature);
    const pool = this.getOrCreatePool(feature, policy?.poolCapacity ?? 20_000);
    pool.allocated = 0;
    pool.consumed = 0;

    this.pushOperation({
      type: "pool_reset",
      actor,
      feature,
      details: {},
    });

    return { feature, ...pool };
  }

  setEmergencyMode(enabled: boolean, multiplier: number, reason: string, actor: string) {
    this.emergency = {
      enabled: Boolean(enabled),
      multiplier: this.clamp(multiplier || 1, 0.25, 3),
      reason: reason || "manual",
      updatedAt: new Date(),
      updatedBy: actor,
    };

    this.pushOperation({
      type: "emergency_toggle",
      actor,
      details: {
        enabled: this.emergency.enabled,
        multiplier: this.emergency.multiplier,
        reason: this.emergency.reason,
      },
    });

    return this.getEmergencyMode();
  }

  getEmergencyMode() {
    return { ...this.emergency };
  }

  getOperationLogs(limit = 100) {
    return this.operationLogs
      .slice(-Math.max(1, Math.min(2_000, limit)))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  private async getReferralBonus(userId: string): Promise<number> {
    if (!this.rewardService) {
      return 0;
    }

    const now = Date.now();
    const cached = this.referralCache.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.eligible ? this.referralBonusMultiplier : 0;
    }

    try {
      const rewards = await this.rewardService.getRewardsForUser(userId);
      const awarded = rewards.filter((reward) => reward.status === RewardStatus.AWARDED).length;
      const eligible = awarded > 0;

      this.referralCache.set(userId, {
        lastCheckedAt: now,
        expiresAt: now + this.referralCacheTtlMs,
        eligible,
        awardedRewards: awarded,
      });

      return eligible ? this.referralBonusMultiplier : 0;
    } catch (error) {
      this.logger.warn(`Referral bonus lookup failed for user ${userId}: ${error.message}`);
      return 0;
    }
  }

  private detectFeature(endpoint: string): string {
    if (!endpoint) {
      return "default";
    }

    const path = endpoint.split("?")[0].toLowerCase();
    if (path.includes("/compute")) return "compute";
    if (path.includes("/portfolio")) return "portfolio";
    if (path.includes("/oracle")) return "oracle";
    if (path.includes("/recommend")) return "recommendation";
    if (path.includes("/referral")) return "referral";
    if (path.includes("/websocket") || path.includes("/ws")) return "realtime";
    return "default";
  }

  private getActiveBoosts(userId: string, feature: string): PremiumBoost[] {
    const boosts = this.boostsByUser.get(userId) ?? [];
    const now = Date.now();

    return boosts.filter((boost) => {
      if (boost.expiresAt.getTime() <= now) {
        return false;
      }
      return boost.feature === feature || boost.feature === "all";
    });
  }

  private getAdaptiveBonus(feature: string): number {
    const learning = this.learningState.get(feature);
    if (!learning) {
      return 0;
    }
    return learning.adaptiveMultiplier - 1;
  }

  private applySmoothing(userId: string, feature: string, target: number): number {
    const key = `${userId}:${feature}`;
    const previous = this.smoothing.get(key) ?? 1;
    const delta = this.clamp(target - previous, -this.maxStepPerDecision, this.maxStepPerDecision);
    const next = this.clamp(previous + delta, 1, this.maxTotalMultiplier);
    this.smoothing.set(key, next);
    return next;
  }

  private applyLearning(event: BonusUsageEvent): void {
    const now = Date.now();
    const state =
      this.learningState.get(event.feature) ??
      {
        adaptiveMultiplier: 1,
        ewmaUsageRatio: 0,
        ewmaExceededRatio: 0,
        lastUpdatedAt: now,
      };

    const usageRatio = event.effectiveLimit > 0
      ? this.clamp((event.effectiveLimit - Math.max(0, event.remaining)) / event.effectiveLimit, 0, 1)
      : 0;
    const exceeded = event.allowed ? 0 : 1;

    state.ewmaUsageRatio = 0.25 * usageRatio + 0.75 * state.ewmaUsageRatio;
    state.ewmaExceededRatio = 0.2 * exceeded + 0.8 * state.ewmaExceededRatio;

    if (state.ewmaExceededRatio > 0.2 && state.adaptiveMultiplier < 1.25) {
      state.adaptiveMultiplier = this.clamp(state.adaptiveMultiplier + 0.02, 0.85, 1.25);
    } else if (state.ewmaUsageRatio < 0.35 && state.ewmaExceededRatio < 0.05 && state.adaptiveMultiplier > 0.9) {
      state.adaptiveMultiplier = this.clamp(state.adaptiveMultiplier - 0.01, 0.85, 1.25);
    }

    state.lastUpdatedAt = now;
    this.learningState.set(event.feature, state);
  }

  private getOrCreatePool(feature: string, capacity: number): FeaturePoolState {
    const existing = this.pools.get(feature);
    if (existing) {
      if (capacity !== undefined && Number.isFinite(capacity)) {
        existing.capacity = this.clampInt(capacity, 100, 10_000_000);
      }
      return existing;
    }

    const pool: FeaturePoolState = {
      feature,
      capacity: this.clampInt(capacity, 100, 10_000_000),
      allocated: 0,
      consumed: 0,
    };
    this.pools.set(feature, pool);
    return pool;
  }

  private evictExpiredBoosts(): void {
    const now = Date.now();
    for (const [userId, boosts] of this.boostsByUser.entries()) {
      const active = boosts.filter((boost) => boost.expiresAt.getTime() > now);
      if (active.length === boosts.length) {
        continue;
      }

      const expired = boosts.filter((boost) => boost.expiresAt.getTime() <= now);
      for (const entry of expired) {
        const policy = this.policies.get(entry.feature);
        const pool = this.getOrCreatePool(entry.feature, policy?.poolCapacity ?? 20_000);
        pool.allocated = Math.max(0, pool.allocated - entry.extraLimit);
      }

      if (active.length === 0) {
        this.boostsByUser.delete(userId);
      } else {
        this.boostsByUser.set(userId, active);
      }
    }
  }

  private pushOperation(
    input: Omit<BonusOperationLog, "id" | "createdAt">,
  ) {
    this.operationLogs.push({
      id: `bonus_op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date(),
      ...input,
    });

    if (this.operationLogs.length > this.maxLogs) {
      this.operationLogs.splice(0, this.operationLogs.length - this.maxLogs);
    }
  }

  private seedDefaultPolicies(): void {
    const defaults: PremiumBonusPolicy[] = [
      {
        feature: "default",
        tierMultipliers: {
          premium: 0.12,
          enterprise: 0.2,
          vip: 0.3,
        },
        maxBonusMultiplier: 2,
        allowStacking: true,
        poolCapacity: 120_000,
        enabled: true,
      },
      {
        feature: "compute",
        tierMultipliers: {
          premium: 0.2,
          enterprise: 0.3,
          vip: 0.4,
        },
        maxBonusMultiplier: 2.5,
        allowStacking: true,
        poolCapacity: 250_000,
        enabled: true,
      },
      {
        feature: "portfolio",
        tierMultipliers: {
          premium: 0.15,
          enterprise: 0.25,
          vip: 0.3,
        },
        maxBonusMultiplier: 2.2,
        allowStacking: true,
        poolCapacity: 150_000,
        enabled: true,
      },
      {
        feature: "referral",
        tierMultipliers: {
          premium: 0.1,
          enterprise: 0.15,
          vip: 0.2,
        },
        maxBonusMultiplier: 1.8,
        allowStacking: false,
        poolCapacity: 80_000,
        enabled: true,
      },
    ];

    for (const policy of defaults) {
      this.policies.set(policy.feature, policy);
      this.getOrCreatePool(policy.feature, policy.poolCapacity);
    }
  }

  private getNumber(key: string, fallback: number, min: number, max: number): number {
    const value = Number(this.configService.get<string>(key, String(fallback)));
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return this.clamp(value, min, max);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private clampInt(value: number, min: number, max: number): number {
    return Math.floor(this.clamp(value, min, max));
  }
}
