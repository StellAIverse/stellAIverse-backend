import {
  Controller,
  Get,
  Res,
  Req,
  UnauthorizedException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Response, Request } from "express";
import { register } from "../config/metrics";

@Controller()
export class MetricsController {

  // -------------------------------------
  // PROMETHEUS METRICS ENDPOINT
  // -------------------------------------
  @Get("metrics")
  async getMetrics(@Req() req: Request, @Res() res: Response) {
    try {
      // 🔐 Optional security for production
      if (process.env.NODE_ENV === "production") {
        const key = req.headers["x-metrics-key"];

        if (!key || key !== process.env.METRICS_KEY) {
          throw new UnauthorizedException("Unauthorized metrics access");
        }
      }

      res.setHeader("Content-Type", register.contentType);

      const metrics = await register.metrics();

      return res.send(metrics);
    } catch (error) {
      return res.status(500).send({
        error: "Failed to collect metrics",
        message: error?.message || "Unknown error",
      });
    }
  }

  // -------------------------------------
  // READINESS CHECK (for Kubernetes / CI)
  // -------------------------------------
  @Get("ready")
  async getReadiness() {
    try {
      // 👉 Add real checks here (DB, cache, etc.)
      // Example:
      // await this.dbService.ping();

      return {
        status: "ready",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new ServiceUnavailableException({
        status: "not_ready",
        error: error?.message || "Dependency check failed",
      });
    }
  }

  // -------------------------------------
  // LIVENESS CHECK (optional but strong)
  // -------------------------------------
  @Get("health")
  getLiveness() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }
}