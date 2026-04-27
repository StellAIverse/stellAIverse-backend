import { Injectable } from "@nestjs/common";
import {
  PremiumFeatureBonusService,
  BonusOperationLog,
  BonusUsageEvent,
  PremiumBoost,
} from "../quota/premium-feature-bonus.service";

export interface ReportRequest {
  name: string;
  timeRange: "1h" | "24h" | "7d" | "30d";
  includeSections?: Array<"effectiveness" | "engagement" | "campaigns" | "operations" | "predictive">;
  anonymizeUsers?: boolean;
}

export interface ReportSchedule {
  id: string;
  name: string;
  cron: string;
  format: "json" | "csv";
  recipients: string[];
  enabled: boolean;
  lastRunAt?: Date;
  nextRunAt: Date;
  createdAt: Date;
  createdBy: string;
  request: ReportRequest;
}

@Injectable()
export class RewardAnalyticsService {
  private readonly schedules = new Map<string, ReportSchedule>();
  private readonly generatedReports: Array<{
    id: string;
    name: string;
    generatedAt: Date;
    format: "json" | "csv";
    payload: unknown;
  }> = [];

  constructor(private readonly premiumBonus: PremiumFeatureBonusService) {}

  getRewardEffectiveness(timeRange: ReportRequest["timeRange"] = "24h") {
    const events = this.getEventsByRange(timeRange, false);
    const byFeature = new Map<string, {
      totalRequests: number;
      bonusRequests: number;
      blockedRequests: number;
      totalBaseLimit: number;
      totalEffectiveLimit: number;
    }>();

    for (const event of events) {
      if (!byFeature.has(event.feature)) {
        byFeature.set(event.feature, {
          totalRequests: 0,
          bonusRequests: 0,
          blockedRequests: 0,
          totalBaseLimit: 0,
          totalEffectiveLimit: 0,
        });
      }

      const row = byFeature.get(event.feature);
      row.totalRequests += 1;
      if (event.adjustment.bonusApplied) {
        row.bonusRequests += 1;
      }
      if (!event.allowed) {
        row.blockedRequests += 1;
      }
      row.totalBaseLimit += event.baseLimit;
      row.totalEffectiveLimit += event.effectiveLimit;
    }

    const effectiveness = Array.from(byFeature.entries()).map(([feature, row]) => {
      const avgLift = row.totalRequests > 0
        ? (row.totalEffectiveLimit - row.totalBaseLimit) / row.totalRequests
        : 0;

      return {
        feature,
        totalRequests: row.totalRequests,
        bonusCoverageRate: this.round(row.bonusRequests / Math.max(1, row.totalRequests)),
        blockRate: this.round(row.blockedRequests / Math.max(1, row.totalRequests)),
        averageLimitLift: this.round(avgLift),
        estimatedRoi: this.round(
          (row.totalEffectiveLimit - row.totalBaseLimit) / Math.max(1, row.totalEffectiveLimit),
        ),
      };
    });

    return {
      timeRange,
      generatedAt: new Date(),
      featureMetrics: effectiveness.sort((a, b) => b.totalRequests - a.totalRequests),
      summary: {
        totalEvents: events.length,
        bonusHitRate: this.round(
          events.filter((event) => event.adjustment.bonusApplied).length / Math.max(1, events.length),
        ),
      },
    };
  }

  getUserEngagementMetrics(timeRange: ReportRequest["timeRange"] = "24h") {
    const events = this.getEventsByRange(timeRange, true);
    const byUser = new Map<string, {
      requests: number;
      bonusHits: number;
      blocked: number;
      features: Set<string>;
      lastSeen: Date;
    }>();

    for (const event of events) {
      const userId = event.userId;
      if (!byUser.has(userId)) {
        byUser.set(userId, {
          requests: 0,
          bonusHits: 0,
          blocked: 0,
          features: new Set<string>(),
          lastSeen: new Date(0),
        });
      }

      const row = byUser.get(userId);
      row.requests += 1;
      if (event.adjustment.bonusApplied) {
        row.bonusHits += 1;
      }
      if (!event.allowed) {
        row.blocked += 1;
      }
      row.features.add(event.feature);
      const ts = this.getEventDate(event);
      if (ts > row.lastSeen) {
        row.lastSeen = ts;
      }
    }

    const users = Array.from(byUser.entries()).map(([userId, row]) => ({
      userId,
      requests: row.requests,
      bonusHitRate: this.round(row.bonusHits / Math.max(1, row.requests)),
      blockedRate: this.round(row.blocked / Math.max(1, row.requests)),
      uniqueFeatures: row.features.size,
      lastSeen: row.lastSeen,
    }));

    return {
      timeRange,
      generatedAt: new Date(),
      engagement: {
        activeUsers: users.length,
        avgRequestsPerUser: this.round(
          users.reduce((acc, row) => acc + row.requests, 0) / Math.max(1, users.length),
        ),
        avgFeatureBreadth: this.round(
          users.reduce((acc, row) => acc + row.uniqueFeatures, 0) / Math.max(1, users.length),
        ),
      },
      users: users.sort((a, b) => b.requests - a.requests).slice(0, 250),
    };
  }

  getCampaignPerformance(timeRange: ReportRequest["timeRange"] = "7d") {
    const cutoff = this.getCutoff(timeRange);
    const boosts = this.premiumBonus
      .listActiveBoosts()
      .filter((boost) => boost.source === "campaign" || Boolean(boost.campaignId));

    const operations = this.premiumBonus
      .getOperationLogs(10_000)
      .filter((entry) => entry.createdAt >= cutoff);

    const campaignRows = new Map<string, {
      boostsAllocated: number;
      activeBoosts: number;
      revocations: number;
      allocatedExtraLimit: number;
      allocatedExtraBurst: number;
      users: Set<string>;
    }>();

    const upsert = (campaignId: string) => {
      if (!campaignRows.has(campaignId)) {
        campaignRows.set(campaignId, {
          boostsAllocated: 0,
          activeBoosts: 0,
          revocations: 0,
          allocatedExtraLimit: 0,
          allocatedExtraBurst: 0,
          users: new Set<string>(),
        });
      }
      return campaignRows.get(campaignId);
    };

    for (const boost of boosts) {
      const campaignId = boost.campaignId || this.campaignFromReason(boost.reason) || "unknown";
      const row = upsert(campaignId);
      row.activeBoosts += 1;
      row.allocatedExtraLimit += boost.extraLimit;
      row.allocatedExtraBurst += boost.extraBurst;
      row.users.add(boost.userId);
    }

    for (const entry of operations) {
      if (entry.type === "boost_allocated") {
        const campaignId = String(entry.details?.campaignId || "unknown");
        const row = upsert(campaignId);
        row.boostsAllocated += 1;
        if (entry.userId) {
          row.users.add(entry.userId);
        }
      }

      if (entry.type === "boost_revoked") {
        const campaignId = String(entry.details?.campaignId || "unknown");
        const row = upsert(campaignId);
        row.revocations += 1;
      }
    }

    const campaigns = Array.from(campaignRows.entries()).map(([campaignId, row]) => ({
      campaignId,
      boostsAllocated: row.boostsAllocated,
      activeBoosts: row.activeBoosts,
      revocations: row.revocations,
      allocatedExtraLimit: row.allocatedExtraLimit,
      allocatedExtraBurst: row.allocatedExtraBurst,
      reachedUsers: row.users.size,
      healthScore: this.round(
        (row.activeBoosts + row.boostsAllocated - row.revocations) / Math.max(1, row.boostsAllocated + 1),
      ),
    }));

    return {
      timeRange,
      generatedAt: new Date(),
      campaigns: campaigns.sort((a, b) => b.boostsAllocated - a.boostsAllocated),
      summary: {
        activeCampaigns: campaigns.length,
        totalActiveBoosts: campaigns.reduce((acc, row) => acc + row.activeBoosts, 0),
      },
    };
  }

  getPredictiveAnalytics(timeRange: ReportRequest["timeRange"] = "30d") {
    const events = this.getEventsByRange(timeRange, false);
    const daily = new Map<number, number>();

    for (const event of events) {
      const ts = this.getEventDate(event).getTime();
      const bucket = Math.floor(ts / 86_400_000) * 86_400_000;
      daily.set(bucket, (daily.get(bucket) ?? 0) + 1);
    }

    const points = Array.from(daily.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([timestamp, value]) => ({ timestamp, value }));

    const prediction = this.predictNext(points);

    return {
      timeRange,
      generatedAt: new Date(),
      trend: points.map((point) => ({
        date: new Date(point.timestamp),
        value: point.value,
      })),
      forecast: {
        nextDayExpectedRequests: prediction,
        confidence: this.round(Math.min(0.95, 0.55 + Math.min(0.35, points.length * 0.02))),
      },
    };
  }

  generateReport(request: ReportRequest) {
    const sections = request.includeSections ?? [
      "effectiveness",
      "engagement",
      "campaigns",
      "operations",
      "predictive",
    ];

    const payload: Record<string, unknown> = {
      metadata: {
        name: request.name,
        generatedAt: new Date(),
        timeRange: request.timeRange,
      },
    };

    if (sections.includes("effectiveness")) {
      payload.effectiveness = this.getRewardEffectiveness(request.timeRange);
    }
    if (sections.includes("engagement")) {
      payload.engagement = this.getUserEngagementMetrics(request.timeRange);
    }
    if (sections.includes("campaigns")) {
      payload.campaigns = this.getCampaignPerformance(request.timeRange);
    }
    if (sections.includes("operations")) {
      payload.operations = this.premiumBonus.getOperationLogs(2_000);
    }
    if (sections.includes("predictive")) {
      payload.predictive = this.getPredictiveAnalytics(request.timeRange);
    }

    const report = {
      id: `report_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: request.name,
      generatedAt: new Date(),
      payload,
    };

    this.generatedReports.push({
      id: report.id,
      name: report.name,
      generatedAt: report.generatedAt,
      format: "json",
      payload,
    });

    if (this.generatedReports.length > 2_000) {
      this.generatedReports.splice(0, this.generatedReports.length - 2_000);
    }

    return report;
  }

  exportReport(reportId: string, format: "json" | "csv" = "json") {
    const report = this.generatedReports.find((entry) => entry.id === reportId);
    if (!report) {
      return {
        found: false,
        reportId,
      };
    }

    if (format === "json") {
      return {
        found: true,
        format,
        report,
      };
    }

    const rows: string[] = ["section,metric,value"];
    const payload = report.payload as Record<string, unknown>;

    for (const [section, sectionValue] of Object.entries(payload)) {
      if (!sectionValue || typeof sectionValue !== "object") {
        rows.push(`${section},value,${String(sectionValue ?? "")}`);
        continue;
      }

      for (const [metric, metricValue] of Object.entries(sectionValue as Record<string, unknown>)) {
        if (Array.isArray(metricValue)) {
          rows.push(`${section},${metric},${metricValue.length}`);
        } else if (typeof metricValue === "object") {
          rows.push(`${section},${metric},object`);
        } else {
          rows.push(`${section},${metric},${String(metricValue)}`);
        }
      }
    }

    return {
      found: true,
      format,
      reportId,
      csv: rows.join("\n"),
    };
  }

  scheduleReport(
    input: Omit<ReportSchedule, "id" | "createdAt" | "nextRunAt" | "lastRunAt">,
  ) {
    const schedule: ReportSchedule = {
      id: `sched_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date(),
      nextRunAt: this.calculateNextRun(input.cron),
      ...input,
    };

    this.schedules.set(schedule.id, schedule);
    return schedule;
  }

  listSchedules() {
    return Array.from(this.schedules.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  deleteSchedule(scheduleId: string) {
    return {
      removed: this.schedules.delete(scheduleId),
      scheduleId,
    };
  }

  getDashboardOverview(timeRange: ReportRequest["timeRange"] = "24h") {
    const effectiveness = this.getRewardEffectiveness(timeRange);
    const engagement = this.getUserEngagementMetrics(timeRange);
    const campaigns = this.getCampaignPerformance(timeRange);
    const predictive = this.getPredictiveAnalytics(timeRange);

    return {
      generatedAt: new Date(),
      timeRange,
      effectiveness: effectiveness.summary,
      engagement: engagement.engagement,
      campaigns: campaigns.summary,
      predictive: predictive.forecast,
      reportCount: this.generatedReports.length,
      scheduleCount: this.schedules.size,
    };
  }

  getAuditTrail(limit = 500) {
    const operations = this.premiumBonus.getOperationLogs(limit);
    const reports = this.generatedReports.slice(-Math.max(1, Math.min(limit, 2_000)));

    return {
      operations,
      reports,
    };
  }

  private getEventsByRange(timeRange: ReportRequest["timeRange"], anonymize: boolean) {
    const cutoff = this.getCutoff(timeRange);
    const events = this.premiumBonus.getUsageEvents(50_000, anonymize) as BonusUsageEvent[];
    return events.filter((event) => this.getEventDate(event) >= cutoff);
  }

  private getCutoff(timeRange: ReportRequest["timeRange"]) {
    const now = Date.now();
    if (timeRange === "1h") return new Date(now - 60 * 60 * 1000);
    if (timeRange === "24h") return new Date(now - 24 * 60 * 60 * 1000);
    if (timeRange === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000);
    return new Date(now - 30 * 24 * 60 * 60 * 1000);
  }

  private getEventDate(event: BonusUsageEvent): Date {
    const anyEvent = event as BonusUsageEvent & { timestamp?: Date | string };
    if (anyEvent.timestamp) {
      return new Date(anyEvent.timestamp);
    }
    return new Date();
  }

  private campaignFromReason(reason: string): string | null {
    if (!reason) {
      return null;
    }
    const marker = "campaign:";
    const idx = reason.toLowerCase().indexOf(marker);
    if (idx < 0) {
      return null;
    }
    return reason.slice(idx + marker.length).trim() || null;
  }

  private predictNext(points: Array<{ timestamp: number; value: number }>) {
    if (points.length < 2) {
      return points[points.length - 1]?.value ?? 0;
    }

    let xSum = 0;
    let ySum = 0;
    let xySum = 0;
    let x2Sum = 0;

    for (let i = 0; i < points.length; i += 1) {
      const x = i + 1;
      const y = points[i].value;
      xSum += x;
      ySum += y;
      xySum += x * y;
      x2Sum += x * x;
    }

    const n = points.length;
    const denominator = n * x2Sum - xSum * xSum;
    if (denominator === 0) {
      return points[points.length - 1]?.value ?? 0;
    }

    const slope = (n * xySum - xSum * ySum) / denominator;
    const intercept = (ySum - slope * xSum) / n;
    return Math.max(0, Math.round(slope * (n + 1) + intercept));
  }

  private calculateNextRun(cron: string): Date {
    // Lightweight scheduling approximation: treat cron as minute interval when numeric.
    const asNumber = Number(cron);
    const minutes = Number.isFinite(asNumber) ? Math.max(1, Math.min(1440, asNumber)) : 60;
    return new Date(Date.now() + minutes * 60_000);
  }

  private round(value: number): number {
    return Number((value || 0).toFixed(4));
  }
}
