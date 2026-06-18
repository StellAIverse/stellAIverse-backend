import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { AlertPreferencesService } from "./alert-preferences.service";
import {
  CreateAlertPreferenceDto,
  UpdateAlertPreferenceDto,
} from "./dto/alert-preference.dto";

@Controller("api/alerts/preferences")
@UseGuards(JwtAuthGuard)
export class AlertPreferencesController {
  constructor(private readonly preferencesService: AlertPreferencesService) {}

  @Post()
  createPreference(@Body() dto: CreateAlertPreferenceDto) {
    return this.preferencesService.createPreference(dto);
  }

  @Get()
  getUserPreferences(@Query("userId") userId: string) {
    return this.preferencesService.getUserPreferences(userId);
  }

  @Patch(":id")
  updatePreference(
    @Param("id") id: string,
    @Body() dto: UpdateAlertPreferenceDto,
  ) {
    return this.preferencesService.updatePreference(id, dto);
  }

  @Delete(":id")
  deletePreference(@Param("id") id: string) {
    return this.preferencesService.deletePreference(id);
  }
}
