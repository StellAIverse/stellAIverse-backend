import {
  Controller,
  Get,
  UseGuards,
  Query,
  Res,
  Header,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { AnalyticsService } from "./analytics.service";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guard/roles.guard";
import { JwtAuthGuard } from "../auth/jwt.guard";

@Controller("referral")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Get main referral analytics (Admin only)
   */
  @Get("analytics")
  @Roles(Role.ADMIN)
  async getAnalytics() {
    return this.analyticsService.getReferralMetrics();
  }

  /**
   * Get abuse logs (Admin only)
   */
  @Get("abuse-log")
  @Roles(Role.ADMIN)
  async getAbuseLogs() {
    return this.analyticsService.exportAbuseDataJson();
  }

  /**
   * Export referral data as CSV (Admin only)
   */
  @Get("export/csv")
  @Roles(Role.ADMIN)
  @Header("Content-Type", "text/csv")
  @Header("Content-Disposition", 'attachment; filename="referrals.csv"')
  async exportCsv(@Res() res: Response) {
    const csvData = await this.analyticsService.exportReferralDataCsv();
    return res.status(HttpStatus.OK).send(csvData);
  }

  /**
   * Export abuse data as JSON file (Admin only)
   */
  @Get("export/json")
  @Roles(Role.ADMIN)
  @Header("Content-Type", "application/json")
  @Header("Content-Disposition", 'attachment; filename="abuse-events.json"')
  async exportJson(@Res() res: Response) {
    const jsonData = await this.analyticsService.exportAbuseDataJson();
    return res.status(HttpStatus.OK).send(jsonData);
  }
}
