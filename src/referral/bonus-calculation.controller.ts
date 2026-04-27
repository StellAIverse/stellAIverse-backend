import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { BonusCalculationService } from "./bonus-calculation.service";
import {
  CreateBonusConfigurationDto,
  UpdateBonusConfigurationDto,
  CalculateBonusDto,
} from "./dto/bonus-calculation.dto";
import { BonusCategory } from "./bonus-configuration.entity";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("bonus-calculations")
@UseGuards(JwtAuthGuard)
export class BonusCalculationController {
  constructor(private readonly bonusCalculationService: BonusCalculationService) {}

  @Post("configurations")
  @HttpCode(HttpStatus.CREATED)
  async createConfiguration(
    @Body() dto: CreateBonusConfigurationDto,
  ) {
    return this.bonusCalculationService.createConfiguration(dto);
  }

  @Get("configurations")
  async getConfigurations(
    @Query("category") category?: BonusCategory,
  ) {
    return this.bonusCalculationService.getActiveConfigurations(category);
  }

  @Get("configurations/:id")
  async getConfiguration(@Param("id") id: string) {
    return this.bonusCalculationService.getConfiguration(id);
  }

  @Put("configurations/:id")
  async updateConfiguration(
    @Param("id") id: string,
    @Body() dto: UpdateBonusConfigurationDto,
  ) {
    return this.bonusCalculationService.updateConfiguration(id, dto);
  }

  @Delete("configurations/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConfiguration(@Param("id") id: string) {
    return this.bonusCalculationService.deleteConfiguration(id);
  }

  @Post("calculate")
  async calculateBonus(
    @Body() dto: CalculateBonusDto,
  ) {
    return this.bonusCalculationService.calculateBonus(dto);
  }

  @Get("user/:userId")
  async getUserBonuses(
    @Param("userId") userId: string,
    @Query("category") category?: BonusCategory,
  ) {
    return this.bonusCalculationService.getUserBonuses(userId, category);
  }

  @Get("user/:userId/totals")
  async getUserTotalBonuses(@Param("userId") userId: string) {
    return this.bonusCalculationService.getUserTotalBonuses(userId);
  }

  @Get("user/:userId/gaming-detection")
  async detectGamingPatterns(@Param("userId") userId: string) {
    return this.bonusCalculationService.detectGamingPatterns(userId);
  }
}
