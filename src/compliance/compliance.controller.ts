import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Delete,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { SkipKyc } from "../common/decorators/skip-kyc.decorator";
import { ComplianceService, KycActorContext } from "./compliance.service";
import {
  WatchlistEntryDto,
  KycProfileDto,
  ComplianceTransactionDto,
  FrameworkConfigDto,
} from "./dto/compliance.dto";
import { RequireRole } from "../common/rbac/roles.decorator";
import { RolesGuard } from "../common/rbac/roles.guard";
import { Role } from "../common/rbac/roles.enum";

@Controller("compliance")
@UseGuards(JwtAuthGuard)
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Post("watchlist")
  addWatchlistEntry(@Body() entry: WatchlistEntryDto) {
    return this.complianceService.addWatchlistEntry(entry);
  }

  @Delete("watchlist/:id")
  removeWatchlistEntry(@Param("id") id: string) {
    return this.complianceService.removeWatchlistEntry(id);
  }

  @Get("watchlist")
  getWatchlist() {
    return this.complianceService.listWatchlist();
  }

  @UseGuards(RolesGuard)
  @RequireRole(Role.KYC_OPERATOR)
  @Post("kyc")
  @SkipKyc()
  submitKyc(
    @Body() profile: KycProfileDto,
    @Req() request: { user?: KycActorContext },
  ) {
    return this.complianceService.submitKyc(profile, request.user);
  }

  @UseGuards(RolesGuard)
  @RequireRole(Role.KYC_OPERATOR, Role.ADMIN)
  @Get("kyc/:userId")
  @SkipKyc()
  getKycStatus(@Param("userId") userId: string) {
    return this.complianceService.getKycStatus(userId);
  }

  @Get("frameworks")
  getFrameworks(): unknown {
    return this.complianceService.getFrameworks();
  }

  @Post("frameworks")
  upsertFramework(@Body() config: FrameworkConfigDto) {
    return this.complianceService.addOrUpdateFramework(config);
  }

  @Post("transaction/surveillance")
  async evaluateTransaction(@Body() tx: ComplianceTransactionDto) {
    return await this.complianceService.evaluateTransaction(tx);
  }

  @Get("transaction/:txId")
  getTransaction(@Param("txId") txId: string): unknown {
    return this.complianceService.getTransaction(txId);
  }

  @Get("alerts/:userId")
  getAlerts(@Param("userId") userId: string) {
    return this.complianceService.getAlerts(userId);
  }

  @Get("report")
  generateRegulatoryReport(@Query("framework") framework?: string) {
    return this.complianceService.generateRegulatoryReport(framework);
  }
}
