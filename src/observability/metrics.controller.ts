import { Controller, Get, Res } from "@nestjs/common";
import { Response } from "express";
import { register } from "../config/metrics";

@Controller()
export class MetricsController {
  @Get("metrics")
  async getMetrics(@Res() res: Response) {
    try {
      res.set("Content-Type", register.contentType);
      const metrics = await register.metrics();
      res.send(metrics);
    } catch (error) {
      res.status(500).send(error);
    }
  }

  @Get("ready")
  getReadiness() {
    // Add your readiness checks here (database connection, etc.)
    return {
      status: "ready",
      timestamp: new Date().toISOString(),
    };
  }
}