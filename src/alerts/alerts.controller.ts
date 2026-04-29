import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
} from "@nestjs/common";
import { AlertsService } from "./alerts.service";
import { CreatePriceAlertDto, CreatePortfolioAlertDto } from "./dto/alert.dto";

@Controller("api/alerts")
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post("price")
  createPriceAlert(@Body() dto: CreatePriceAlertDto) {
    return this.alertsService.createPriceAlert(dto);
  }

  @Post("portfolio")
  createPortfolioAlert(@Body() dto: CreatePortfolioAlertDto) {
    return this.alertsService.createPortfolioAlert(dto);
  }

  @Get()
  getUserAlerts(@Query("userId") userId: string) {
    return this.alertsService.getUserAlerts(userId);
  }

  @Delete(":alertId")
  deleteAlert(@Param("alertId") alertId: string) {
    return this.alertsService.deleteAlert(alertId);
  }

  @Get("history")
  getAlertHistory(@Query("userId") userId: string) {
    return this.alertsService.getAlertHistory(userId);
  }
}
