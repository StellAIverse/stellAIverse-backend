// src/observability/metrics.service.ts

import { Injectable } from "@nestjs/common";
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
  Gauge,
} from "prom-client";

@Injectable()
export class MetricsService {
  private readonly registry: Registry;

  // 🔢 Core Metrics
  public readonly httpRequestsTotal: Counter<string>;
  public readonly httpRequestDuration: Histogram<string>;

  // 🧠 Business Metrics
  public readonly skillSearchCount: Counter<string>;
  public readonly recommendationRequests: Counter<string>;
  public readonly trendingRequests: Counter<string>;

  // 🛡️ Rate Limiting Metrics
  public readonly rateLimitHits: Counter<string>;
  public readonly rateLimitExceeded: Counter<string>;
  public readonly rateLimitCurrentUsage: Gauge<string>;
  public readonly rateLimitResetTime: Gauge<string>;
  public readonly throttlingEvents: Counter<string>;
  public readonly burstEvents: Counter<string>;
  public readonly rateLimitScalingDecisions: Counter<string>;
  public readonly rateLimitScalingMultiplier: Gauge<string>;
  public readonly rateLimitPredictionLatency: Histogram<string>;
  public readonly rateLimitPredictionConfidence: Gauge<string>;

  // 💰 Premium Tier Metrics
  public readonly premiumTierUsage: Counter<string>;
  public readonly premiumBonusClaims: Counter<string>;
  public readonly referralBonusUsage: Counter<string>;

  // 📊 User Behavior Metrics
  public readonly userSessionsTotal: Counter<string>;
  public readonly userSessionDuration: Histogram<string>;
  public readonly userActionsTotal: Counter<string>;
  public readonly userSegmentsActive: Gauge<string>;

  constructor() {
    this.registry = new Registry();

    // Collect default Node metrics (CPU, memory, etc.)
    collectDefaultMetrics({ register: this.registry });

    // -------------------------------------
    // HTTP METRICS
    // -------------------------------------
    this.httpRequestsTotal = new Counter({
      name: "http_requests_total",
      help: "Total number of HTTP requests",
      labelNames: ["method", "route", "status"],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: "http_request_duration_seconds",
      help: "HTTP request latency in seconds",
      labelNames: ["method", "route", "status"],
      buckets: [0.1, 0.3, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    // -------------------------------------
    // BUSINESS METRICS
    // -------------------------------------
    this.skillSearchCount = new Counter({
      name: "skill_search_total",
      help: "Total number of skill searches",
      registers: [this.registry],
    });

    this.recommendationRequests = new Counter({
      name: "skill_recommendation_total",
      help: "Total recommendation requests",
      registers: [this.registry],
    });

    this.trendingRequests = new Counter({
      name: "skill_trending_requests_total",
      help: "Total trending skill requests",
      registers: [this.registry],
    });

    // -------------------------------------
    // RATE LIMITING METRICS
    // -------------------------------------
    this.rateLimitHits = new Counter({
      name: "rate_limit_hits_total",
      help: "Total number of rate limit checks",
      labelNames: ["policy", "user_tier", "endpoint"],
      registers: [this.registry],
    });

    this.rateLimitExceeded = new Counter({
      name: "rate_limit_exceeded_total",
      help: "Total number of rate limit violations",
      labelNames: ["policy", "user_tier", "endpoint"],
      registers: [this.registry],
    });

    this.rateLimitCurrentUsage = new Gauge({
      name: "rate_limit_current_usage",
      help: "Current usage count for rate limits",
      labelNames: ["policy", "user_id", "endpoint"],
      registers: [this.registry],
    });

    this.rateLimitResetTime = new Gauge({
      name: "rate_limit_reset_time",
      help: "Time until rate limit resets (unix timestamp)",
      labelNames: ["policy", "user_id", "endpoint"],
      registers: [this.registry],
    });

    this.throttlingEvents = new Counter({
      name: "throttling_events_total",
      help: "Total number of throttling events",
      labelNames: ["severity", "policy", "user_tier"],
      registers: [this.registry],
    });

    this.burstEvents = new Counter({
      name: "burst_events_total",
      help: "Total number of burst traffic events",
      labelNames: ["policy", "user_tier", "duration"],
      registers: [this.registry],
    });

    this.rateLimitScalingDecisions = new Counter({
      name: "rate_limit_scaling_decisions_total",
      help: "Total number of dynamic scaling decisions",
      labelNames: ["policy", "endpoint", "direction", "predicted_burst"],
      registers: [this.registry],
    });

    this.rateLimitScalingMultiplier = new Gauge({
      name: "rate_limit_scaling_multiplier",
      help: "Current dynamic scaling multiplier",
      labelNames: ["policy", "endpoint"],
      registers: [this.registry],
    });

    this.rateLimitPredictionLatency = new Histogram({
      name: "rate_limit_prediction_latency_ms",
      help: "Prediction latency for dynamic rate scaling in milliseconds",
      labelNames: ["policy", "endpoint"],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 20, 50],
      registers: [this.registry],
    });

    this.rateLimitPredictionConfidence = new Gauge({
      name: "rate_limit_prediction_confidence",
      help: "Prediction confidence for dynamic scaling decisions",
      labelNames: ["policy", "endpoint"],
      registers: [this.registry],
    });

    // -------------------------------------
    // PREMIUM TIER METRICS
    // -------------------------------------
    this.premiumTierUsage = new Counter({
      name: "premium_tier_usage_total",
      help: "Total usage of premium tier features",
      labelNames: ["feature", "user_tier", "plan"],
      registers: [this.registry],
    });

    this.premiumBonusClaims = new Counter({
      name: "premium_bonus_claims_total",
      help: "Total premium bonus claims",
      labelNames: ["bonus_type", "user_tier", "source"],
      registers: [this.registry],
    });

    this.referralBonusUsage = new Counter({
      name: "referral_bonus_usage_total",
      help: "Total referral bonus redemptions",
      labelNames: ["bonus_type", "referrer_tier", "referee_tier"],
      registers: [this.registry],
    });

    // -------------------------------------
    // USER BEHAVIOR METRICS
    // -------------------------------------
    this.userSessionsTotal = new Counter({
      name: "user_sessions_total",
      help: "Total number of user sessions",
      labelNames: ["user_tier", "device_type", "country"],
      registers: [this.registry],
    });

    this.userSessionDuration = new Histogram({
      name: "user_session_duration_seconds",
      help: "Duration of user sessions",
      labelNames: ["user_tier", "device_type"],
      buckets: [60, 300, 900, 1800, 3600, 7200], // 1min to 2hrs
      registers: [this.registry],
    });

    this.userActionsTotal = new Counter({
      name: "user_actions_total",
      help: "Total user actions performed",
      labelNames: ["action_type", "user_tier", "feature"],
      registers: [this.registry],
    });

    this.userSegmentsActive = new Gauge({
      name: "user_segments_active",
      help: "Number of active users in each segment",
      labelNames: ["segment", "tier"],
      registers: [this.registry],
    });
  }

  // -------------------------------------
  // EXPORT METRICS
  // -------------------------------------
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getRegistry(): Registry {
    return this.registry;
  }
}
