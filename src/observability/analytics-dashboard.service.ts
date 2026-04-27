import { Injectable, Logger } from "@nestjs/common";
import { MetricsService } from "./metrics.service";

export interface RateLimitingMetrics {
  currentUsage: {
    policy: string;
    userId: string;
    endpoint: string;
    usage: number;
    limit: number;
    resetTime: Date;
  }[];
  throttlingStats: {
    totalHits: number;
    totalExceeded: number;
    hitRate: number;
    topViolators: Array<{
      userId: string;
      violations: number;
      lastViolation: Date;
    }>;
  };
  burstAnalysis: {
    eventsLastHour: number;
    eventsLastDay: number;
    peakHour: number;
    averageBurstDuration: number;
  };
  performance: {
    averageDecisionMs: number;
    p95DecisionMs: number;
  };
}

export interface UserBehaviorAnalytics {
  sessionMetrics: {
    totalSessions: number;
    averageSessionDuration: number;
    sessionDistribution: Record<string, number>;
  };
  engagementMetrics: {
    dailyActiveUsers: number;
    weeklyActiveUsers: number;
    monthlyActiveUsers: number;
    userRetention: {
      day1: number;
      day7: number;
      day30: number;
    };
  };
  featureUsage: {
    topFeatures: Array<{
      feature: string;
      usage: number;
      growth: number;
    }>;
    featureAdoption: Record<string, number>;
  };
}

export interface PredictiveInsights {
  scalingRecommendations: Array<{
    metric: string;
    currentValue: number;
    predictedValue: number;
    recommendation: string;
    confidence: number;
  }>;
  anomalyDetection: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    detectedAt: Date;
    affectedUsers: number;
  }>;
  trendAnalysis: {
    traffic: 'increasing' | 'decreasing' | 'stable';
    userGrowth: 'increasing' | 'decreasing' | 'stable';
    errorRate: 'increasing' | 'decreasing' | 'stable';
  };
}

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  metric: "exceeded_ratio" | "throughput";
  threshold: number;
  windowMinutes: number;
  severity: "low" | "medium" | "high" | "critical";
  channels: Array<"email" | "slack" | "webhook" | "log">;
  escalationMinutes: number;
}

export interface AlertRecord {
  id: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  createdAt: Date;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  channelDelivery: Record<string, "pending" | "sent">;
  escalated: boolean;
  metadata?: Record<string, unknown>;
}

export interface UserRateLimitOverride {
  userId: string;
  limit: number;
  windowMs: number;
  burst: number;
  reason?: string;
  expiresAt?: Date;
  updatedAt: Date;
  updatedBy: string;
}

interface RateLimitSample {
  key: string;
  userId: string;
  endpoint: string;
  policy: string;
  userTier: string;
  allowed: boolean;
  remaining: number;
  limit: number;
  resetMs: number;
  timestamp: Date;
  decisionMs: number;
}

@Injectable()
export class AnalyticsDashboardService {
  private readonly logger = new Logger(AnalyticsDashboardService.name);
  private readonly rateLimitSamples: RateLimitSample[] = [];
  private readonly alerts: AlertRecord[] = [];
  private readonly alertRules = new Map<string, AlertRule>();
  private readonly userOverrides = new Map<string, UserRateLimitOverride>();
  private readonly maxSamples = 50_000;
  private readonly maxAlerts = 2_000;
  private emergencyMode = {
    enabled: false,
    limitMultiplier: 1,
    reason: "",
    activatedAt: undefined as Date | undefined,
    activatedBy: undefined as string | undefined,
  };

  constructor(
    private readonly metrics: MetricsService,
  ) {
    this.seedDefaultAlertRules();
  }

  recordRateLimitDecision(sample: Omit<RateLimitSample, "timestamp">): void {
    const item: RateLimitSample = {
      ...sample,
      timestamp: new Date(),
    };

    this.rateLimitSamples.push(item);
    if (this.rateLimitSamples.length > this.maxSamples) {
      this.rateLimitSamples.splice(0, this.rateLimitSamples.length - this.maxSamples);
    }

    this.evaluateAlertRules();
    this.applyEscalations();
  }

  /**
   * Gets real-time rate limiting metrics
   */
  async getRateLimitingMetrics(
    timeRange: "1h" | "24h" | "7d" = "24h",
  ): Promise<RateLimitingMetrics> {
    const samples = this.getSamplesInRange(timeRange);
    const currentUsage = this.getCurrentRateLimitUsage(samples);
    const throttlingStats = this.getThrottlingStats(samples);
    const burstAnalysis = this.getBurstAnalysis(samples);
    const performance = this.getPerformanceStats(samples);

    return {
      currentUsage,
      throttlingStats,
      burstAnalysis,
      performance,
    };
  }

  /**
   * Gets historical usage trends
   */
  async getHistoricalTrends(
    metric: string,
    granularity: "hour" | "day" | "week" = "day",
    days: number = 30,
  ): Promise<Array<{ timestamp: Date; value: number }>> {
    return this.buildTrend(metric, granularity, days);
  }

  /**
   * Gets per-user analytics
   */
  async getUserAnalytics(
    userId?: string,
    segment?: string,
    limit: number = 100,
  ): Promise<{
    userMetrics: Array<{
      userId: string;
      tier: string;
      totalRequests: number;
      rateLimitHits: number;
      averageResponseTime: number;
      lastActivity: Date;
    }>;
    segmentSummary: {
      totalUsers: number;
      averageUsage: number;
      topUsers: string[];
    };
  }> {
    const now = Date.now();
    const last30Days = this.rateLimitSamples.filter(
      (sample) => now - sample.timestamp.getTime() <= 30 * 24 * 60 * 60 * 1000,
    );

    const perUser = new Map<
      string,
      {
        userId: string;
        tier: string;
        totalRequests: number;
        rateLimitHits: number;
        decisionTimeTotal: number;
        lastActivity: Date;
      }
    >();

    for (const sample of last30Days) {
      if (userId && sample.userId !== userId) {
        continue;
      }
      if (!perUser.has(sample.userId)) {
        perUser.set(sample.userId, {
          userId: sample.userId,
          tier: sample.userTier,
          totalRequests: 0,
          rateLimitHits: 0,
          decisionTimeTotal: 0,
          lastActivity: sample.timestamp,
        });
      }
      const entry = perUser.get(sample.userId);
      entry.totalRequests += 1;
      entry.decisionTimeTotal += sample.decisionMs;
      if (!sample.allowed) {
        entry.rateLimitHits += 1;
      }
      if (sample.timestamp > entry.lastActivity) {
        entry.lastActivity = sample.timestamp;
      }
    }

    const userMetrics = Array.from(perUser.values())
      .map((entry) => ({
        userId: entry.userId,
        tier: entry.tier,
        totalRequests: entry.totalRequests,
        rateLimitHits: entry.rateLimitHits,
        averageResponseTime:
          entry.totalRequests > 0
            ? Number((entry.decisionTimeTotal / entry.totalRequests).toFixed(3))
            : 0,
        lastActivity: entry.lastActivity,
      }))
      .sort((a, b) => b.totalRequests - a.totalRequests)
      .slice(0, Math.max(1, Number(limit) || 100));

    const totalUsers = userMetrics.length;
    const totalUsage = userMetrics.reduce((acc, current) => acc + current.totalRequests, 0);

    return {
      userMetrics,
      segmentSummary: {
        totalUsers,
        averageUsage: totalUsers > 0 ? Number((totalUsage / totalUsers).toFixed(2)) : 0,
        topUsers: userMetrics.slice(0, 5).map((entry) => entry.userId),
      },
    };
  }

  /**
   * Gets predictive insights and recommendations
   */
  async getPredictiveInsights(): Promise<PredictiveInsights> {
    const hourlyTrend = await this.getHistoricalTrends("hits", "hour", 2);
    const exceededTrend = await this.getHistoricalTrends("exceeded", "hour", 2);

    const currentHits = hourlyTrend.length > 0 ? hourlyTrend[hourlyTrend.length - 1].value : 0;
    const predictedHits = this.predictNextValue(hourlyTrend);
    const currentExceeded =
      exceededTrend.length > 0 ? exceededTrend[exceededTrend.length - 1].value : 0;
    const predictedExceeded = this.predictNextValue(exceededTrend);
    const predictedExceededRatio = predictedHits > 0 ? predictedExceeded / predictedHits : 0;

    const recommendation =
      predictedHits > currentHits * 1.25
        ? "Scale up API workers and Redis throughput before next peak"
        : "Current capacity is sufficient for expected traffic";

    const anomalies = this.alerts
      .filter((alert) => !alert.acknowledged)
      .slice(-5)
      .map((alert) => ({
        type: alert.type,
        severity: alert.severity,
        description: alert.message,
        detectedAt: alert.createdAt,
        affectedUsers: Number(alert.metadata?.affectedUsers ?? 0),
      }));

    return {
      scalingRecommendations: [
        {
          metric: "request_rate",
          currentValue: Number(currentHits.toFixed(2)),
          predictedValue: Number(predictedHits.toFixed(2)),
          recommendation,
          confidence: this.getConfidence(hourlyTrend),
        },
      ],
      anomalyDetection: anomalies,
      trendAnalysis: {
        traffic: this.getTrendDirection(hourlyTrend),
        userGrowth: this.getTrendDirection(await this.getHistoricalTrends("unique_users", "day", 30)),
        errorRate:
          predictedExceededRatio > 0.2
            ? "increasing"
            : predictedExceededRatio < 0.1
              ? "decreasing"
              : "stable",
      },
    };
  }

  /**
   * Gets user behavior analytics
   */
  async getUserBehaviorAnalytics(
    startDate?: Date,
    endDate?: Date,
  ): Promise<UserBehaviorAnalytics> {
    const from = startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = endDate ?? new Date();
    const samples = this.rateLimitSamples.filter(
      (sample) => sample.timestamp >= from && sample.timestamp <= to,
    );

    const sessionMetrics = this.calculateSessionMetrics(samples);
    const engagementMetrics = this.calculateEngagementMetrics(samples);
    const featureUsage = this.calculateFeatureUsage(samples);

    return {
      sessionMetrics,
      engagementMetrics,
      featureUsage,
    };
  }

  /**
   * Gets alerts and notifications
   */
  async getAlerts(
    severity?: "low" | "medium" | "high" | "critical",
    acknowledged?: boolean,
  ): Promise<AlertRecord[]> {
    return this.alerts
      .filter((alert) => (severity ? alert.severity === severity : true))
      .filter((alert) =>
        acknowledged === undefined ? true : alert.acknowledged === acknowledged,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Acknowledges an alert
   */
  async acknowledgeAlert(alertId: string, adminId: string): Promise<void> {
    const alert = this.alerts.find((entry) => entry.id === alertId);
    if (!alert) {
      return;
    }

    alert.acknowledged = true;
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = adminId;
    this.logger.log(`Alert ${alertId} acknowledged by ${adminId}`);
  }

  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  upsertAlertRule(rule: AlertRule): AlertRule {
    this.alertRules.set(rule.id, { ...rule });
    return this.alertRules.get(rule.id);
  }

  getAlertSummary() {
    const active = this.alerts.filter((alert) => !alert.acknowledged);
    return {
      total: this.alerts.length,
      active: active.length,
      critical: active.filter((alert) => alert.severity === "critical").length,
      acknowledged: this.alerts.filter((alert) => alert.acknowledged).length,
    };
  }

  setEmergencyMode(
    enabled: boolean,
    limitMultiplier: number,
    reason: string,
    adminId: string,
  ) {
    this.emergencyMode = {
      enabled,
      limitMultiplier: Math.max(0.1, Math.min(5, limitMultiplier || 1)),
      reason: reason || "manual",
      activatedAt: enabled ? new Date() : undefined,
      activatedBy: enabled ? adminId : undefined,
    };
    return this.getEmergencyMode();
  }

  getEmergencyMode() {
    return { ...this.emergencyMode };
  }

  setUserOverride(data: {
    userId: string;
    limit: number;
    windowMs: number;
    burst?: number;
    reason?: string;
    expiresAt?: Date;
    adminId: string;
  }): UserRateLimitOverride {
    const override: UserRateLimitOverride = {
      userId: data.userId,
      limit: Math.max(1, Math.floor(data.limit)),
      windowMs: Math.max(1000, Math.floor(data.windowMs)),
      burst: Math.max(0, Math.floor(data.burst ?? 0)),
      reason: data.reason,
      expiresAt: data.expiresAt,
      updatedAt: new Date(),
      updatedBy: data.adminId,
    };
    this.userOverrides.set(data.userId, override);
    return override;
  }

  removeUserOverride(userId: string): boolean {
    return this.userOverrides.delete(userId);
  }

  listUserOverrides(): UserRateLimitOverride[] {
    this.evictExpiredOverrides();
    return Array.from(this.userOverrides.values()).sort((a, b) =>
      a.userId.localeCompare(b.userId),
    );
  }

  getEffectiveControl(
    userId: string | undefined,
    baseLimit: number,
    baseWindowMs: number,
    baseBurst: number,
  ) {
    this.evictExpiredOverrides();

    let limit = baseLimit;
    let windowMs = baseWindowMs;
    let burst = baseBurst;
    const applied: string[] = [];

    if (this.emergencyMode.enabled) {
      limit = Math.max(1, Math.floor(limit * this.emergencyMode.limitMultiplier));
      applied.push(`emergency:${this.emergencyMode.limitMultiplier}`);
    }

    if (userId) {
      const override = this.userOverrides.get(userId);
      if (override) {
        limit = override.limit;
        windowMs = override.windowMs;
        burst = override.burst;
        applied.push("user_override");
      }
    }

    return { limit, windowMs, burst, applied };
  }

  buildExport(
    type: "metrics" | "alerts" | "users",
    format: "csv" | "json" = "json",
    timeRange: "1h" | "24h" | "7d" = "24h",
  ) {
    if (type === "alerts") {
      const alerts = this.alerts.slice(-500);
      return format === "csv"
        ? this.toCsv(
            ["id", "type", "severity", "message", "createdAt", "acknowledged"],
            alerts.map((alert) => [
              alert.id,
              alert.type,
              alert.severity,
              alert.message,
              alert.createdAt.toISOString(),
              String(alert.acknowledged),
            ]),
          )
        : alerts;
    }

    if (type === "users") {
      const users = this.getUserAnalytics(undefined, undefined, 500);
      return users;
    }

    const metrics = this.getRateLimitingMetrics(timeRange);
    return metrics;
  }

  // Private helper methods

  private getStartDate(timeRange: string): Date {
    const now = new Date();
    switch (timeRange) {
      case "1h":
        return new Date(now.getTime() - 60 * 60 * 1000);
      case "24h":
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case "7d":
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  }

  private getSamplesInRange(timeRange: "1h" | "24h" | "7d") {
    const start = this.getStartDate(timeRange);
    return this.rateLimitSamples.filter((sample) => sample.timestamp >= start);
  }

  private getCurrentRateLimitUsage(samples: RateLimitSample[]) {
    const byKey = new Map<string, RateLimitSample>();
    for (const sample of samples) {
      const existing = byKey.get(sample.key);
      if (!existing || sample.timestamp > existing.timestamp) {
        byKey.set(sample.key, sample);
      }
    }

    return Array.from(byKey.values())
      .slice(-250)
      .map((sample) => ({
        policy: sample.policy,
        userId: sample.userId,
        endpoint: sample.endpoint,
        usage: sample.limit - sample.remaining,
        limit: sample.limit,
        resetTime: new Date(sample.timestamp.getTime() + sample.resetMs),
      }));
  }

  private getThrottlingStats(samples: RateLimitSample[]) {
    const totalHits = samples.length;
    const totalExceeded = samples.filter((sample) => !sample.allowed).length;
    const byUser = new Map<string, { violations: number; lastViolation: Date }>();

    for (const sample of samples) {
      if (sample.allowed) {
        continue;
      }
      const existing = byUser.get(sample.userId);
      if (!existing) {
        byUser.set(sample.userId, {
          violations: 1,
          lastViolation: sample.timestamp,
        });
        continue;
      }

      existing.violations += 1;
      if (sample.timestamp > existing.lastViolation) {
        existing.lastViolation = sample.timestamp;
      }
    }

    return {
      totalHits,
      totalExceeded,
      hitRate: totalHits > 0 ? Number((totalExceeded / totalHits).toFixed(4)) : 0,
      topViolators: Array.from(byUser.entries())
        .map(([userId, data]) => ({ userId, ...data }))
        .sort((a, b) => b.violations - a.violations)
        .slice(0, 10),
    };
  }

  private getBurstAnalysis(samples: RateLimitSample[]) {
    const now = Date.now();
    const eventsLastHour = samples.filter(
      (sample) => now - sample.timestamp.getTime() <= 60 * 60 * 1000,
    ).length;
    const eventsLastDay = samples.filter(
      (sample) => now - sample.timestamp.getTime() <= 24 * 60 * 60 * 1000,
    ).length;

    const byHour = new Map<number, number>();
    for (const sample of samples) {
      const hour = sample.timestamp.getHours();
      byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
    }

    let peakHour = 0;
    let peakCount = 0;
    for (const [hour, count] of byHour.entries()) {
      if (count > peakCount) {
        peakHour = hour;
        peakCount = count;
      }
    }

    let burstCount = 0;
    let burstDurationTotal = 0;
    const ordered = [...samples].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    let burstStart: Date | null = null;
    let previous: Date | null = null;

    for (const sample of ordered) {
      if (!previous) {
        burstStart = sample.timestamp;
        previous = sample.timestamp;
        continue;
      }

      const delta = sample.timestamp.getTime() - previous.getTime();
      if (delta <= 5000) {
        previous = sample.timestamp;
        continue;
      }

      if (burstStart) {
        burstCount += 1;
        burstDurationTotal += previous.getTime() - burstStart.getTime();
      }
      burstStart = sample.timestamp;
      previous = sample.timestamp;
    }

    return {
      eventsLastHour,
      eventsLastDay,
      peakHour: 0,
      averageBurstDuration:
        burstCount > 0 ? Number((burstDurationTotal / burstCount / 1000).toFixed(2)) : 0,
    };
  }

  private getPerformanceStats(samples: RateLimitSample[]) {
    const values = samples.map((sample) => sample.decisionMs).sort((a, b) => a - b);
    if (values.length === 0) {
      return { averageDecisionMs: 0, p95DecisionMs: 0 };
    }

    const avg = values.reduce((acc, current) => acc + current, 0) / values.length;
    const p95Index = Math.min(values.length - 1, Math.floor(values.length * 0.95));
    return {
      averageDecisionMs: Number(avg.toFixed(3)),
      p95DecisionMs: Number(values[p95Index].toFixed(3)),
    };
  }

  private calculateSessionMetrics(samples: RateLimitSample[]) {
    const byUser = new Map<string, Date[]>();
    for (const sample of samples) {
      if (!byUser.has(sample.userId)) {
        byUser.set(sample.userId, []);
      }
      byUser.get(sample.userId).push(sample.timestamp);
    }

    let totalSessions = 0;
    let durationTotalSeconds = 0;
    const distribution: Record<string, number> = {
      short: 0,
      medium: 0,
      long: 0,
    };

    for (const entries of byUser.values()) {
      entries.sort((a, b) => a.getTime() - b.getTime());
      let sessionStart = entries[0];
      let last = entries[0];

      for (let index = 1; index < entries.length; index += 1) {
        const current = entries[index];
        if (current.getTime() - last.getTime() > 15 * 60 * 1000) {
          totalSessions += 1;
          const seconds = (last.getTime() - sessionStart.getTime()) / 1000;
          durationTotalSeconds += seconds;
          this.assignSessionBucket(distribution, seconds);
          sessionStart = current;
        }
        last = current;
      }

      totalSessions += 1;
      const seconds = (last.getTime() - sessionStart.getTime()) / 1000;
      durationTotalSeconds += seconds;
      this.assignSessionBucket(distribution, seconds);
    }

    return {
      totalSessions,
      averageSessionDuration:
        totalSessions > 0 ? Number((durationTotalSeconds / totalSessions).toFixed(2)) : 0,
      sessionDistribution: distribution,
    };
  }

  private calculateEngagementMetrics(samples: RateLimitSample[]) {
    const now = Date.now();
    const activityByUser = new Map<string, number>();

    for (const sample of samples) {
      const timestamp = sample.timestamp.getTime();
      const existing = activityByUser.get(sample.userId) ?? 0;
      if (timestamp > existing) {
        activityByUser.set(sample.userId, timestamp);
      }
    }

    const values = Array.from(activityByUser.values());
    const dau = values.filter((value) => now - value <= 24 * 60 * 60 * 1000).length;
    const wau = values.filter((value) => now - value <= 7 * 24 * 60 * 60 * 1000).length;
    const mau = values.filter((value) => now - value <= 30 * 24 * 60 * 60 * 1000).length;

    return {
      dailyActiveUsers: dau,
      weeklyActiveUsers: wau,
      monthlyActiveUsers: mau,
      userRetention: {
        day1: mau > 0 ? Number((dau / mau).toFixed(3)) : 0,
        day7: mau > 0 ? Number((wau / mau).toFixed(3)) : 0,
        day30: 1,
      },
    };
  }

  private calculateFeatureUsage(samples: RateLimitSample[]) {
    const byEndpoint = new Map<string, number>();
    for (const sample of samples) {
      byEndpoint.set(sample.endpoint, (byEndpoint.get(sample.endpoint) ?? 0) + 1);
    }

    const total = Array.from(byEndpoint.values()).reduce((acc, current) => acc + current, 0);
    const sorted = Array.from(byEndpoint.entries())
      .map(([feature, usage]) => ({
        feature,
        usage,
        growth: 0,
      }))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 10);

    const adoption: Record<string, number> = {};
    for (const [feature, usage] of byEndpoint.entries()) {
      adoption[feature] = total > 0 ? Number((usage / total).toFixed(4)) : 0;
    }

    return {
      topFeatures: sorted,
      featureAdoption: adoption,
    };
  }

  private buildTrend(
    metric: string,
    granularity: "hour" | "day" | "week",
    days: number,
  ): Array<{ timestamp: Date; value: number }> {
    const now = Date.now();
    const start = now - Math.max(1, days) * 24 * 60 * 60 * 1000;
    const bucketMs =
      granularity === "hour"
        ? 60 * 60 * 1000
        : granularity === "day"
          ? 24 * 60 * 60 * 1000
          : 7 * 24 * 60 * 60 * 1000;

    const bucketMap = new Map<number, RateLimitSample[]>();
    for (const sample of this.rateLimitSamples) {
      const ts = sample.timestamp.getTime();
      if (ts < start) {
        continue;
      }
      const bucket = Math.floor(ts / bucketMs) * bucketMs;
      if (!bucketMap.has(bucket)) {
        bucketMap.set(bucket, []);
      }
      bucketMap.get(bucket).push(sample);
    }

    const series: Array<{ timestamp: Date; value: number }> = [];
    for (let cursor = Math.floor(start / bucketMs) * bucketMs; cursor <= now; cursor += bucketMs) {
      const bucketSamples = bucketMap.get(cursor) ?? [];
      series.push({
        timestamp: new Date(cursor),
        value: this.metricValue(metric, bucketSamples),
      });
    }
    return series;
  }

  private metricValue(metric: string, samples: RateLimitSample[]): number {
    if (samples.length === 0) {
      return 0;
    }

    switch (metric) {
      case "hits":
      case "requests":
        return samples.length;
      case "exceeded":
      case "violations":
        return samples.filter((sample) => !sample.allowed).length;
      case "allowance_rate":
        return Number(
          (
            samples.filter((sample) => sample.allowed).length / Math.max(1, samples.length)
          ).toFixed(4),
        );
      case "decision_ms":
        return Number(
          (
            samples.reduce((acc, sample) => acc + sample.decisionMs, 0) / Math.max(1, samples.length)
          ).toFixed(3),
        );
      case "unique_users":
        return new Set(samples.map((sample) => sample.userId)).size;
      default:
        return samples.length;
    }
  }

  private predictNextValue(points: Array<{ timestamp: Date; value: number }>): number {
    if (points.length < 2) {
      return points[points.length - 1]?.value ?? 0;
    }

    let xSum = 0;
    let ySum = 0;
    let xySum = 0;
    let x2Sum = 0;

    points.forEach((point, index) => {
      const x = index + 1;
      const y = point.value;
      xSum += x;
      ySum += y;
      xySum += x * y;
      x2Sum += x * x;
    });

    const n = points.length;
    const denominator = n * x2Sum - xSum * xSum;
    if (denominator === 0) {
      return points[points.length - 1]?.value ?? 0;
    }

    const slope = (n * xySum - xSum * ySum) / denominator;
    const intercept = (ySum - slope * xSum) / n;
    return Math.max(0, slope * (n + 1) + intercept);
  }

  private getTrendDirection(
    points: Array<{ timestamp: Date; value: number }>,
  ): "increasing" | "decreasing" | "stable" {
    if (points.length < 3) {
      return "stable";
    }

    const last = points[points.length - 1].value;
    const previous = points[Math.max(0, points.length - 3)].value;
    const delta = last - previous;

    if (delta > Math.max(1, previous * 0.05)) {
      return "increasing";
    }
    if (delta < -Math.max(1, previous * 0.05)) {
      return "decreasing";
    }
    return "stable";
  }

  private getConfidence(points: Array<{ timestamp: Date; value: number }>): number {
    if (points.length < 4) {
      return 0.55;
    }
    const values = points.map((point) => point.value);
    const avg = values.reduce((acc, current) => acc + current, 0) / values.length;
    const variance =
      values.reduce((acc, current) => acc + (current - avg) * (current - avg), 0) /
      values.length;
    const normalizedVariance = avg > 0 ? Math.min(1, variance / (avg * avg)) : 1;
    return Number((1 - normalizedVariance * 0.5).toFixed(2));
  }

  private seedDefaultAlertRules() {
    this.alertRules.set("exceeded_ratio_high", {
      id: "exceeded_ratio_high",
      name: "High exceeded ratio",
      enabled: true,
      metric: "exceeded_ratio",
      threshold: 0.15,
      windowMinutes: 5,
      severity: "high",
      channels: ["log", "email"],
      escalationMinutes: 10,
    });

    this.alertRules.set("throughput_spike", {
      id: "throughput_spike",
      name: "Traffic spike",
      enabled: true,
      metric: "throughput",
      threshold: 250,
      windowMinutes: 5,
      severity: "medium",
      channels: ["log", "slack"],
      escalationMinutes: 15,
    });
  }

  private evaluateAlertRules() {
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) {
        continue;
      }

      const windowMs = rule.windowMinutes * 60 * 1000;
      const cutoff = Date.now() - windowMs;
      const windowSamples = this.rateLimitSamples.filter(
        (sample) => sample.timestamp.getTime() >= cutoff,
      );

      let triggered = false;
      let metricValue = 0;
      if (rule.metric === "exceeded_ratio") {
        metricValue =
          windowSamples.length > 0
            ? windowSamples.filter((sample) => !sample.allowed).length / windowSamples.length
            : 0;
        triggered = metricValue >= rule.threshold;
      } else if (rule.metric === "throughput") {
        metricValue = windowSamples.length;
        triggered = metricValue >= rule.threshold;
      }

      if (!triggered || this.hasRecentAlert(rule.id, windowMs)) {
        continue;
      }

      this.pushAlert({
        id: `alert_${Date.now()}_${rule.id}`,
        type: rule.id,
        severity: rule.severity,
        message: `${rule.name}: value ${metricValue.toFixed(3)} exceeded threshold ${rule.threshold}`,
        createdAt: new Date(),
        acknowledged: false,
        channelDelivery: Object.fromEntries(rule.channels.map((channel) => [channel, "sent"])),
        escalated: false,
        metadata: {
          metric: rule.metric,
          threshold: rule.threshold,
          value: metricValue,
          affectedUsers: new Set(windowSamples.map((sample) => sample.userId)).size,
        },
      });
    }
  }

  private pushAlert(alert: AlertRecord) {
    this.alerts.push(alert);
    if (this.alerts.length > this.maxAlerts) {
      this.alerts.splice(0, this.alerts.length - this.maxAlerts);
    }
    this.logger.warn(`[ALERT:${alert.severity}] ${alert.message}`);
  }

  private hasRecentAlert(type: string, windowMs: number): boolean {
    const cutoff = Date.now() - windowMs;
    return this.alerts.some(
      (alert) => alert.type === type && alert.createdAt.getTime() >= cutoff,
    );
  }

  private applyEscalations() {
    const now = Date.now();
    const severityOrder: AlertRecord["severity"][] = ["low", "medium", "high", "critical"];

    for (const alert of this.alerts) {
      if (alert.acknowledged || alert.escalated) {
        continue;
      }

      const rule = this.alertRules.get(alert.type);
      if (!rule) {
        continue;
      }

      const dueAt = alert.createdAt.getTime() + rule.escalationMinutes * 60 * 1000;
      if (now < dueAt) {
        continue;
      }

      const currentIdx = severityOrder.indexOf(alert.severity);
      if (currentIdx < severityOrder.length - 1) {
        alert.severity = severityOrder[currentIdx + 1];
      }
      alert.escalated = true;
    }
  }

  private evictExpiredOverrides() {
    const now = Date.now();
    for (const [userId, override] of this.userOverrides.entries()) {
      if (override.expiresAt && override.expiresAt.getTime() <= now) {
        this.userOverrides.delete(userId);
      }
    }
  }

  private assignSessionBucket(distribution: Record<string, number>, seconds: number) {
    if (seconds < 5 * 60) {
      distribution.short += 1;
      return;
    }
    if (seconds < 30 * 60) {
      distribution.medium += 1;
      return;
    }
    distribution.long += 1;
  }

  private toCsv(headers: string[], rows: Array<Array<string>>) {
    const escaped = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
    return [
      headers.map((header) => escaped(header)).join(","),
      ...rows.map((row) => row.map((value) => escaped(value)).join(",")),
    ].join("\n");
  }
}