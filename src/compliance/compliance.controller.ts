import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Delete,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { ComplianceService } from "./compliance.service";
import {
  WatchlistEntryDto,
  KycProfileDto,
  ComplianceTransactionDto,
  FrameworkConfigDto,
} from "./dto/compliance.dto";

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

  @Post("kyc")
  submitKyc(@Body() profile: KycProfileDto) {
    return this.complianceService.submitKyc(profile);
  }

  @Get("kyc/:userId")
  getKycStatus(@Param("userId") userId: string) {
    return this.complianceService.getKycStatus(userId);
  }

  @Get("frameworks")
  getFrameworks() {
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
  getTransaction(@Param("txId") txId: string) {
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
