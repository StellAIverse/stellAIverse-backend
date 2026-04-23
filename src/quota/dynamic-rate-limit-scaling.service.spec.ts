import { ConfigService } from "@nestjs/config";
import { DynamicRateLimitScalingService } from "./dynamic-rate-limit-scaling.service";

describe("DynamicRateLimitScalingService", () => {
  const context = {
    key: "user:test",
    userId: "test",
    endpoint: "/compute/run",
    policy: "free",
    baseLimit: 100,
    baseWindowMs: 60_000,
    baseBurst: 20,
  };

  let service: DynamicRateLimitScalingService;

  beforeEach(() => {
    const configService = {
      get: jest.fn((key: string, fallback: string) => {
        const overrides: Record<string, string> = {
          DYNAMIC_RATE_LIMIT_ENABLED: "true",
          DYNAMIC_RATE_LIMIT_MIN_SCALE: "0.5",
          DYNAMIC_RATE_LIMIT_MAX_SCALE: "2.5",
          DYNAMIC_RATE_LIMIT_MAX_STEP: "0.2",
          DYNAMIC_RATE_LIMIT_COOLDOWN_MS: "30000",
          DYNAMIC_RATE_LIMIT_BUCKET_MS: "1000",
          DYNAMIC_RATE_LIMIT_MIN_HISTORY_POINTS: "4",
        };
        return overrides[key] ?? fallback;
      }),
    } as unknown as ConfigService;

    service = new DynamicRateLimitScalingService(configService);
  });

  it("returns base limits when history is insufficient", () => {
    const adjustment = service.getAdjustment(context);

    expect(adjustment.limit).toBeGreaterThan(0);
    expect(adjustment.windowMs).toBe(context.baseWindowMs);
    expect(adjustment.reasons).toContain("insufficient_history");
  });

  it("scales up gradually under sustained pressure", () => {
    for (let i = 0; i < 20; i += 1) {
      const adjustment = service.getAdjustment(context);
      service.recordFeedback({
        context,
        allowed: true,
        remaining: Math.max(0, context.baseLimit - i),
      });

      // Simulate bursty behavior by submitting extra observations.
      if (i % 2 === 0) {
        service.recordFeedback({
          context,
          allowed: true,
          remaining: Math.max(0, context.baseLimit - i - 1),
        });
      }

      expect(adjustment.multiplier).toBeGreaterThanOrEqual(0.5);
      expect(adjustment.multiplier).toBeLessThanOrEqual(2.5);
    }

    const latest = service.getAdjustment(context);
    expect(latest.multiplier).toBeGreaterThanOrEqual(0.5);
    expect(latest.multiplier).toBeLessThanOrEqual(2.5);
    expect(latest.limit).toBeGreaterThan(0);
  });

  it("honors anti-oscillation and manual override", () => {
    for (let i = 0; i < 8; i += 1) {
      service.recordFeedback({
        context,
        allowed: true,
        remaining: 20,
      });
    }

    const first = service.getAdjustment(context);

    service.setManualOverride({
      enabled: true,
      multiplier: 0.7,
      reason: "incident response",
      adminId: "admin",
    });

    const overridden = service.getAdjustment(context);
    expect(overridden.multiplier).toBeLessThanOrEqual(first.multiplier);

    const status = service.getStatus();
    expect(status.manualOverride.enabled).toBe(true);
    expect(status.manualOverride.updatedBy).toBe("admin");
  });

  it("records scaling decision logs for observability", () => {
    service.getAdjustment(context);
    const logs = service.getDecisionLogs(10);

    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]).toHaveProperty("predictionLatencyMs");
    expect(logs[0]).toHaveProperty("multiplier");
  });
});
