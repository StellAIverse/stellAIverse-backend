import { ConfigService } from "@nestjs/config";
import { PremiumFeatureBonusService } from "../quota/premium-feature-bonus.service";
import { RewardAnalyticsService } from "./reward-analytics.service";

describe("RewardAnalyticsService", () => {
  let premiumBonus: PremiumFeatureBonusService;
  let service: RewardAnalyticsService;

  const rewardService = {
    getRewardsForUser: jest.fn().mockResolvedValue([]),
  };

  const configService = {
    get: jest.fn((key: string, fallback: string) => {
      const overrides: Record<string, string> = {
        PREMIUM_ELIGIBLE_TIERS: "premium,enterprise,vip",
      };
      return overrides[key] ?? fallback;
    }),
  } as unknown as ConfigService;

  beforeEach(async () => {
    premiumBonus = new PremiumFeatureBonusService(configService, rewardService as any);
    service = new RewardAnalyticsService(premiumBonus);

    const adjustment = await premiumBonus.getAdjustment({
      userId: "user-a",
      userTier: "premium",
      endpoint: "/compute/run",
      policy: "premium",
      baseLimit: 100,
      baseWindowMs: 60_000,
      baseBurst: 20,
    });

    premiumBonus.recordUsage({
      timestamp: new Date(),
      userId: "user-a",
      userTier: "premium",
      endpoint: "/compute/run",
      feature: adjustment.feature,
      policy: "premium",
      baseLimit: 100,
      effectiveLimit: adjustment.limit,
      allowed: true,
      remaining: 40,
      adjustment,
    });

    premiumBonus.allocateBoost({
      userId: "user-a",
      feature: "compute",
      campaignId: "spring-launch",
      source: "campaign",
      durationMinutes: 30,
      extraLimit: 20,
      actor: "admin",
      reason: "campaign:spring-launch",
    });
  });

  it("builds reward effectiveness and engagement metrics", () => {
    const effectiveness = service.getRewardEffectiveness("24h");
    const engagement = service.getUserEngagementMetrics("24h");

    expect(effectiveness.summary.totalEvents).toBeGreaterThan(0);
    expect(effectiveness.featureMetrics.length).toBeGreaterThan(0);
    expect(engagement.engagement.activeUsers).toBeGreaterThan(0);
  });

  it("returns campaign performance and predictive insights", () => {
    const campaigns = service.getCampaignPerformance("7d");
    const predictive = service.getPredictiveAnalytics("30d");

    expect(campaigns.summary.activeCampaigns).toBeGreaterThan(0);
    expect(predictive.forecast.nextDayExpectedRequests).toBeGreaterThanOrEqual(0);
  });

  it("supports report generation, export and schedules", () => {
    const report = service.generateReport({
      name: "ops-daily",
      timeRange: "24h",
      includeSections: ["effectiveness", "campaigns"],
    });

    const exported = service.exportReport(report.id, "csv");
    const schedule = service.scheduleReport({
      name: "daily-reward-report",
      cron: "60",
      format: "json",
      recipients: ["ops@example.com"],
      enabled: true,
      createdBy: "admin",
      request: {
        name: "scheduled",
        timeRange: "24h",
      },
    });

    expect(exported.found).toBe(true);
    expect(schedule.id).toBeDefined();
    expect(service.listSchedules().length).toBe(1);
  });
});
