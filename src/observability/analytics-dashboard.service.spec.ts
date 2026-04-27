import { AnalyticsDashboardService } from "./analytics-dashboard.service";
import { MetricsService } from "./metrics.service";

describe("AnalyticsDashboardService", () => {
  let service: AnalyticsDashboardService;

  beforeEach(() => {
    service = new AnalyticsDashboardService(new MetricsService());
  });

  it("aggregates rate limiting metrics from recorded decisions", async () => {
    service.recordRateLimitDecision({
      key: "user:1",
      userId: "1",
      endpoint: "/auth/login",
      policy: "free",
      userTier: "free",
      allowed: true,
      remaining: 9,
      limit: 10,
      resetMs: 60_000,
      decisionMs: 2,
    });

    service.recordRateLimitDecision({
      key: "user:1",
      userId: "1",
      endpoint: "/auth/login",
      policy: "free",
      userTier: "free",
      allowed: false,
      remaining: 0,
      limit: 10,
      resetMs: 60_000,
      decisionMs: 3,
    });

    const metrics = await service.getRateLimitingMetrics("1h");

    expect(metrics.throttlingStats.totalHits).toBe(2);
    expect(metrics.throttlingStats.totalExceeded).toBe(1);
    expect(metrics.currentUsage.length).toBeGreaterThan(0);
  });

  it("creates alerts when exceeded ratio threshold is crossed", async () => {
    for (let i = 0; i < 20; i += 1) {
      service.recordRateLimitDecision({
        key: `user:${i}`,
        userId: `${i}`,
        endpoint: "/compute/run",
        policy: "free",
        userTier: "free",
        allowed: i % 2 === 0,
        remaining: i % 2 === 0 ? 3 : 0,
        limit: 4,
        resetMs: 60_000,
        decisionMs: 5,
      });
    }

    const alerts = await service.getAlerts();
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].severity).toBeDefined();
  });

  it("applies emergency multiplier and user overrides", () => {
    service.setEmergencyMode(true, 0.5, "traffic spike", "admin");

    const emergency = service.getEffectiveControl("user-a", 100, 60_000, 10);
    expect(emergency.limit).toBe(50);

    service.setUserOverride({
      userId: "user-a",
      limit: 5,
      windowMs: 30_000,
      burst: 1,
      adminId: "admin",
    });

    const override = service.getEffectiveControl("user-a", 100, 60_000, 10);
    expect(override.limit).toBe(5);
    expect(override.windowMs).toBe(30_000);
    expect(override.burst).toBe(1);
  });
});
