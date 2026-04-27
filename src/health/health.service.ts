import { Injectable } from "@nestjs/common";

export interface HealthStatus {
  status: string;
  timestamp: string;
  uptime: number;
  version: string;
}

export interface LivenessStatus {
  status: string;
  timestamp: string;
  uptime: number;
}

@Injectable()
export class HealthService {
  private readonly startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Get liveness status - simple check that process is running
   */
  getLivenessStatus(): LivenessStatus {
    return {
      status: "alive",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  /**
   * Get general health status
   */
  getHealthStatus(): HealthStatus {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || "0.1.0",
    };
  }

  /**
   * Calculate memory usage stats
   */
  getMemoryStats() {
    const usage = process.memoryUsage();
    return {
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`,
    };
  }
}
