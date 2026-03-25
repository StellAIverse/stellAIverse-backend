// src/observability/metrics.service.ts

import { Injectable } from '@nestjs/common';
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

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

  constructor() {
    this.registry = new Registry();

    // Collect default Node metrics (CPU, memory, etc.)
    collectDefaultMetrics({ register: this.registry });

    // -------------------------------------
    // HTTP METRICS
    // -------------------------------------
    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.1, 0.3, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    // -------------------------------------
    // BUSINESS METRICS
    // -------------------------------------
    this.skillSearchCount = new Counter({
      name: 'skill_search_total',
      help: 'Total number of skill searches',
      registers: [this.registry],
    });

    this.recommendationRequests = new Counter({
      name: 'skill_recommendation_total',
      help: 'Total recommendation requests',
      registers: [this.registry],
    });

    this.trendingRequests = new Counter({
      name: 'skill_trending_requests_total',
      help: 'Total trending skill requests',
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