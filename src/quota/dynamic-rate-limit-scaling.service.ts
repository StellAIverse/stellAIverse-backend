import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import os from "os";

export interface ScalingContext {
  key: string;
  userId: string;
  endpoint: string;
  policy: string;
  baseLimit: number;
  baseWindowMs: number;
  baseBurst: number;
}

export interface ScalingAdjustment {
  limit: number;
  windowMs: number;
  burst: number;
  multiplier: number;
  confidence: number;
  predictedBurst: boolean;
  reasons: string[];
  predictionLatencyMs: number;
  systemLoad: number;
}

export interface ScalingRecordInput {
  context: ScalingContext;
  allowed: boolean;
  remaining: number;
}

interface UsageHistory {
  bucketMs: number;
  buckets: Map<number, number>;
  ewmaShort: number;
  ewmaLong: number;
  trend: number;
  alpha: number;
  beta: number;
  previousMultiplier: number;
  lastDirection: -1 | 0 | 1;
  lastDirectionAt: number;
  lastPrediction?: {
    predictedRate: number;
    actualRate?: number;
    confidence: number;
    at: number;
    error?: number;
  };
  accuracyWindow: number[];
  lastAdjustment?: ScalingAdjustment;
}

export interface ScalingDecisionLog {
  key: string;
  endpoint: string;
  policy: string;
  baseLimit: number;
  adjustedLimit: number;
  multiplier: number;
  predictedBurst: boolean;
  confidence: number;
  reasons: string[];
  predictionLatencyMs: number;
  systemLoad: number;
  createdAt: Date;
}

@Injectable()
export class DynamicRateLimitScalingService {
  private readonly logger = new Logger(DynamicRateLimitScalingService.name);
  private readonly histories = new Map<string, UsageHistory>();
  private readonly decisions: ScalingDecisionLog[] = [];
  private readonly maxDecisions = 20_000;

  private readonly enabled: boolean;
  private readonly minScale: number;
  private readonly maxScale: number;
  private readonly maxStepChange: number;
  private readonly antiOscillationCooldownMs: number;
  private readonly bucketMs: number;
  private readonly minHistoryPoints: number;
  private readonly manual = {
    enabled: false,
    multiplier: 1,
    reason: "",
    updatedAt: undefined as Date | undefined,
    updatedBy: undefined as string | undefined,
  };

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<string>("DYNAMIC_RATE_LIMIT_ENABLED", "true") !== "false";
    this.minScale = this.getNumber("DYNAMIC_RATE_LIMIT_MIN_SCALE", 0.5, 0.1, 1);
    this.maxScale = this.getNumber("DYNAMIC_RATE_LIMIT_MAX_SCALE", 2.5, 1, 8);
    this.maxStepChange = this.getNumber("DYNAMIC_RATE_LIMIT_MAX_STEP", 0.2, 0.01, 1);
    this.antiOscillationCooldownMs = this.getNumber(
      "DYNAMIC_RATE_LIMIT_COOLDOWN_MS",
      30_000,
      1_000,
      300_000,
    );
    this.bucketMs = this.getNumber("DYNAMIC_RATE_LIMIT_BUCKET_MS", 1_000, 250, 60_000);
    this.minHistoryPoints = this.getNumber("DYNAMIC_RATE_LIMIT_MIN_HISTORY_POINTS", 8, 3, 120);
  }

  getAdjustment(context: ScalingContext): ScalingAdjustment {
    const start = Date.now();

    if (!this.enabled) {
      return {
        limit: context.baseLimit,
        windowMs: context.baseWindowMs,
        burst: context.baseBurst,
        multiplier: 1,
        confidence: 0,
        predictedBurst: false,
        reasons: ["dynamic_scaling_disabled"],
        predictionLatencyMs: Date.now() - start,
        systemLoad: this.computeSystemLoad(),
      };
    }

    const history = this.getOrCreateHistory(context.key);
    const now = Date.now();
    const { predictedRate, burstProbability, confidence, reasons } =
      this.predictUsage(history);
    const systemLoad = this.computeSystemLoad();

    let targetMultiplier = this.computeTargetMultiplier(
      predictedRate,
      history,
      burstProbability,
      systemLoad,
      reasons,
    );

    if (this.manual.enabled) {
      targetMultiplier *= this.manual.multiplier;
      reasons.push(`manual_override:${this.manual.multiplier.toFixed(2)}`);
    }

    targetMultiplier = this.clamp(targetMultiplier, this.minScale, this.maxScale);
    const gradualMultiplier = this.applyGradualChange(history, targetMultiplier, now, reasons);

    const adjustedLimit = this.clampInt(
      Math.round(context.baseLimit * gradualMultiplier),
      1,
      Math.max(1, Math.round(context.baseLimit * this.maxScale)),
    );

    const adjustedBurst = this.clampInt(
      Math.round(context.baseBurst * (0.8 + gradualMultiplier * 0.25)),
      0,
      Math.max(0, Math.round(context.baseBurst * this.maxScale)),
    );

    const adjustment: ScalingAdjustment = {
      limit: adjustedLimit,
      windowMs: context.baseWindowMs,
      burst: adjustedBurst,
      multiplier: gradualMultiplier,
      confidence,
      predictedBurst: burstProbability >= 0.65,
      reasons,
      predictionLatencyMs: Date.now() - start,
      systemLoad,
    };

    history.lastAdjustment = adjustment;
    history.lastPrediction = {
      predictedRate,
      confidence,
      at: now,
    };

    this.recordDecision(context, adjustment);
    return adjustment;
  }

  recordFeedback(input: ScalingRecordInput): void {
    const history = this.getOrCreateHistory(input.context.key);
    this.addUsageEvent(history);

    const actualRate = this.getRecentRate(history, 5_000);
    const prediction = history.lastPrediction;
    if (prediction) {
      prediction.actualRate = actualRate;
      const error = Math.abs(actualRate - prediction.predictedRate);
      prediction.error = error;

      const baseline = Math.max(1, actualRate);
      const relativeError = error / baseline;
      history.accuracyWindow.push(1 - this.clamp(relativeError, 0, 1));
      if (history.accuracyWindow.length > 200) {
        history.accuracyWindow.shift();
      }

      this.applyOnlineLearning(history, relativeError);
    }

    if (!input.allowed && input.remaining <= 0) {
      history.ewmaShort += 0.25;
    }
  }

  getDecisionLogs(limit = 100): ScalingDecisionLog[] {
    return this.decisions
      .slice(-Math.max(1, Math.min(2_000, limit)))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getStatus() {
    const accuracies = Array.from(this.histories.values())
      .flatMap((h) => h.accuracyWindow)
      .filter((v) => Number.isFinite(v));

    const avgAccuracy =
      accuracies.length > 0
        ? Number((accuracies.reduce((a, b) => a + b, 0) / accuracies.length).toFixed(4))
        : 0;

    return {
      enabled: this.enabled,
      minScale: this.minScale,
      maxScale: this.maxScale,
      maxStepChange: this.maxStepChange,
      antiOscillationCooldownMs: this.antiOscillationCooldownMs,
      bucketMs: this.bucketMs,
      activeKeys: this.histories.size,
      averagePredictionAccuracy: avgAccuracy,
      decisionCount: this.decisions.length,
      manualOverride: { ...this.manual },
    };
  }

  setManualOverride(data: {
    enabled: boolean;
    multiplier?: number;
    reason?: string;
    adminId: string;
  }) {
    this.manual.enabled = Boolean(data.enabled);
    this.manual.multiplier = this.clamp(data.multiplier ?? 1, 0.2, 5);
    this.manual.reason = data.reason || "manual scaling control";
    this.manual.updatedBy = data.adminId;
    this.manual.updatedAt = new Date();
    return this.getStatus().manualOverride;
  }

  private getOrCreateHistory(key: string): UsageHistory {
    if (this.histories.has(key)) {
      return this.histories.get(key);
    }

    const initial: UsageHistory = {
      bucketMs: this.bucketMs,
      buckets: new Map(),
      ewmaShort: 1,
      ewmaLong: 1,
      trend: 0,
      alpha: 0.35,
      beta: 0.2,
      previousMultiplier: 1,
      lastDirection: 0,
      lastDirectionAt: 0,
      accuracyWindow: [],
    };

    this.histories.set(key, initial);
    return initial;
  }

  private addUsageEvent(history: UsageHistory): void {
    const now = Date.now();
    const bucket = Math.floor(now / history.bucketMs);
    history.buckets.set(bucket, (history.buckets.get(bucket) ?? 0) + 1);

    const expiredBefore = bucket - Math.ceil((10 * 60_000) / history.bucketMs);
    for (const key of history.buckets.keys()) {
      if (key < expiredBefore) {
        history.buckets.delete(key);
      }
    }

    const current = history.buckets.get(bucket) ?? 0;
    history.ewmaShort = 0.55 * current + 0.45 * history.ewmaShort;
    history.ewmaLong = 0.12 * current + 0.88 * history.ewmaLong;
    history.trend = 0.7 * history.trend + 0.3 * (history.ewmaShort - history.ewmaLong);
  }

  private getRecentRate(history: UsageHistory, horizonMs: number): number {
    const nowBucket = Math.floor(Date.now() / history.bucketMs);
    const bucketCount = Math.max(1, Math.ceil(horizonMs / history.bucketMs));

    let total = 0;
    for (let i = 0; i < bucketCount; i += 1) {
      total += history.buckets.get(nowBucket - i) ?? 0;
    }

    return total / (bucketCount * (history.bucketMs / 1000));
  }

  private predictUsage(history: UsageHistory) {
    const points = history.buckets.size;
    const reasons: string[] = [];

    if (points < this.minHistoryPoints) {
      reasons.push("insufficient_history");
      return {
        predictedRate: history.ewmaShort,
        burstProbability: 0.2,
        confidence: 0.35,
        reasons,
      };
    }

    const level = history.ewmaLong;
    const trend = history.trend;
    const predictedRate = Math.max(0, level + trend);

    const ratio = history.ewmaShort / Math.max(0.1, history.ewmaLong);
    const burstProbability = this.clamp((ratio - 1) * 0.8 + Math.max(0, trend) * 0.08, 0, 1);

    const accuracy =
      history.accuracyWindow.length > 0
        ? history.accuracyWindow.reduce((a, b) => a + b, 0) / history.accuracyWindow.length
        : 0.6;

    const confidence = this.clamp(0.5 + accuracy * 0.4 + (ratio > 1 ? 0.1 : 0), 0, 0.98);

    if (burstProbability >= 0.65) {
      reasons.push("predicted_burst");
    }
    if (trend > 0.5) {
      reasons.push("upward_trend");
    }

    return {
      predictedRate,
      burstProbability,
      confidence,
      reasons,
    };
  }

  private computeTargetMultiplier(
    predictedRate: number,
    history: UsageHistory,
    burstProbability: number,
    systemLoad: number,
    reasons: string[],
  ): number {
    const baseline = Math.max(0.5, history.ewmaLong);
    const pressure = predictedRate / baseline;

    let multiplier = 1;
    if (pressure > 1) {
      multiplier += Math.min(1.2, (pressure - 1) * 0.7);
      reasons.push("usage_pressure_up");
    } else {
      multiplier -= Math.min(0.4, (1 - pressure) * 0.35);
      reasons.push("usage_pressure_down");
    }

    if (burstProbability >= 0.65 && systemLoad < 0.85) {
      multiplier += 0.18;
      reasons.push("burst_preparation");
    }

    if (systemLoad > 0.75) {
      multiplier -= (systemLoad - 0.75) * 0.9;
      reasons.push("high_system_load");
    }

    return multiplier;
  }

  private applyGradualChange(
    history: UsageHistory,
    target: number,
    now: number,
    reasons: string[],
  ): number {
    const previous = history.previousMultiplier;
    const delta = this.clamp(target - previous, -this.maxStepChange, this.maxStepChange);
    const candidate = this.clamp(previous + delta, this.minScale, this.maxScale);
    const direction: -1 | 0 | 1 = delta > 0 ? 1 : delta < 0 ? -1 : 0;

    if (
      direction !== 0 &&
      history.lastDirection !== 0 &&
      direction !== history.lastDirection &&
      now - history.lastDirectionAt < this.antiOscillationCooldownMs
    ) {
      reasons.push("anti_oscillation_hold");
      return previous;
    }

    if (direction !== 0) {
      history.lastDirection = direction;
      history.lastDirectionAt = now;
    }

    history.previousMultiplier = candidate;
    return candidate;
  }

  private recordDecision(context: ScalingContext, adjustment: ScalingAdjustment): void {
    this.decisions.push({
      key: context.key,
      endpoint: context.endpoint,
      policy: context.policy,
      baseLimit: context.baseLimit,
      adjustedLimit: adjustment.limit,
      multiplier: adjustment.multiplier,
      predictedBurst: adjustment.predictedBurst,
      confidence: adjustment.confidence,
      reasons: adjustment.reasons,
      predictionLatencyMs: adjustment.predictionLatencyMs,
      systemLoad: adjustment.systemLoad,
      createdAt: new Date(),
    });

    if (this.decisions.length > this.maxDecisions) {
      this.decisions.splice(0, this.decisions.length - this.maxDecisions);
    }
  }

  private applyOnlineLearning(history: UsageHistory, relativeError: number): void {
    const highError = relativeError > 0.35;
    const lowError = relativeError < 0.12;

    if (highError) {
      history.alpha = this.clamp(history.alpha + 0.03, 0.15, 0.75);
      history.beta = this.clamp(history.beta + 0.02, 0.05, 0.6);
      this.logger.debug(`Adjusted model params up: alpha=${history.alpha}, beta=${history.beta}`);
      return;
    }

    if (lowError) {
      history.alpha = this.clamp(history.alpha - 0.01, 0.15, 0.75);
      history.beta = this.clamp(history.beta - 0.01, 0.05, 0.6);
    }
  }

  private computeSystemLoad(): number {
    const memory = process.memoryUsage();
    const heapRatio = memory.heapTotal > 0 ? memory.heapUsed / memory.heapTotal : 0;
    const cores = Math.max(1, os.cpus().length);
    const loadAvg = process.platform === "win32" ? 0 : os.loadavg()[0] / cores;
    return this.clamp(heapRatio * 0.6 + loadAvg * 0.4, 0, 1.5);
  }

  private getNumber(key: string, fallback: number, min: number, max: number): number {
    const raw = Number(this.configService.get<string>(key, String(fallback)));
    if (!Number.isFinite(raw)) {
      return fallback;
    }
    return this.clamp(raw, min, max);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private clampInt(value: number, min: number, max: number): number {
    return Math.floor(this.clamp(value, min, max));
  }
}