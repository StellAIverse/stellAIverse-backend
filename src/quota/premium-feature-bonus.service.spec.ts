import { ConfigService } from "@nestjs/config";
import { PremiumFeatureBonusService } from "./premium-feature-bonus.service";
import { RewardStatus } from "../referral/reward.entity";

describe("PremiumFeatureBonusService", () => {
  let service: PremiumFeatureBonusService;
  const rewardService = {
    getRewardsForUser: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string, fallback: string) => {
      const overrides: Record<string, string> = {
        PREMIUM_ELIGIBLE_TIERS: "premium,enterprise,vip",
        PREMIUM_BONUS_REFERRAL_MULTIPLIER: "0.1",
        PREMIUM_BONUS_REFERRAL_CACHE_TTL_MS: "60000",
      };
      return overrides[key] ?? fallback;
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    rewardService.getRewardsForUser.mockReset();
    service = new PremiumFeatureBonusService(
      configService,
      rewardService as any,
    );
  });

  it("applies tier and feature-specific bonus to premium users", async () => {
    rewardService.getRewardsForUser.mockResolvedValue([]);

    const adjustment = await service.getAdjustment({
      userId: "u1",
      userTier: "premium",
      endpoint: "/compute/run",
      policy: "premium",
      baseLimit: 100,
      baseWindowMs: 60_000,
      baseBurst: 20,
    });

    expect(adjustment.feature).toBe("compute");
    expect(adjustment.limit).toBeGreaterThan(100);
    expect(adjustment.bonusApplied).toBe(true);
  });

  it("adds referral multiplier for users with awarded referral rewards", async () => {
    rewardService.getRewardsForUser.mockResolvedValue([
      { status: RewardStatus.AWARDED },
    ]);

    const adjustment = await service.getAdjustment({
      userId: "u2",
      userTier: "premium",
      endpoint: "/portfolio/snapshot",
      policy: "premium",
      baseLimit: 100,
      baseWindowMs: 60_000,
      baseBurst: 20,
    });

    expect(adjustment.componentMultipliers.referral).toBeGreaterThan(0);
    expect(adjustment.reasons.some((reason) => reason.includes("referral_bonus"))).toBe(true);
  });

  it("allocates and uses time-limited boosts", async () => {
    rewardService.getRewardsForUser.mockResolvedValue([]);

    const boost = service.allocateBoost({
      userId: "u3",
      feature: "compute",
      bonusMultiplier: 0.25,
      extraLimit: 80,
      extraBurst: 15,
      durationMinutes: 30,
      actor: "admin",
      reason: "campaign",
    });

    const adjustment = await service.getAdjustment({
      userId: "u3",
      userTier: "premium",
      endpoint: "/compute/jobs",
      policy: "premium",
      baseLimit: 100,
      baseWindowMs: 60_000,
      baseBurst: 20,
    });

    expect(boost.id).toBeDefined();
    expect(adjustment.activeBoostIds).toContain(boost.id);
    expect(adjustment.limit).toBeGreaterThan(100);
  });

  it("tracks bonus usage and updates pool consumption", async () => {
    rewardService.getRewardsForUser.mockResolvedValue([]);

    const adjustment = await service.getAdjustment({
      userId: "u4",
      userTier: "premium",
      endpoint: "/referral/redeem",
      policy: "premium",
      baseLimit: 100,
      baseWindowMs: 60_000,
      baseBurst: 20,
    });

    service.recordUsage({
      userId: "u4",
      userTier: "premium",
      endpoint: "/referral/redeem",
      feature: adjustment.feature,
      policy: "premium",
      baseLimit: 100,
      effectiveLimit: adjustment.limit,
      allowed: true,
      remaining: Math.max(0, adjustment.limit - 10),
      adjustment,
    });

    const summary = service.getUsageSummary(50);
    const pools = service.getPoolStatus();

    expect(summary.recentEvents.length).toBeGreaterThan(0);
    expect(pools.find((entry) => entry.feature === adjustment.feature)?.consumed).toBeGreaterThanOrEqual(0);
  });

  it("supports admin emergency mode and policy updates", () => {
    const mode = service.setEmergencyMode(true, 0.8, "incident", "admin");
    const policy = service.upsertPolicy(
      {
        feature: "oracle",
        poolCapacity: 99999,
        maxBonusMultiplier: 2.1,
        enabled: true,
      },
      "admin",
    );

    expect(mode.enabled).toBe(true);
    expect(mode.multiplier).toBe(0.8);
    expect(policy.feature).toBe("oracle");
    expect(service.getOperationLogs(20).length).toBeGreaterThan(0);
  });

  it("supports bulk boost allocation and revocation", () => {
    const allocation = service.bulkAllocateBoosts(
      [
        {
          userId: "u5",
          feature: "compute",
          campaignId: "campaign-1",
          durationMinutes: 20,
          extraLimit: 25,
          source: "campaign",
          reason: "campaign:campaign-1",
        },
        {
          userId: "u6",
          feature: "portfolio",
          durationMinutes: 30,
          extraLimit: 30,
          source: "admin",
        },
      ],
      "admin",
    );

    expect(allocation.succeeded).toBe(2);

    const revoke = service.bulkRevokeBoosts(
      allocation.boosts.map((boost) => boost.id),
      "admin",
    );

    expect(revoke.removed).toBe(2);
  });
});
