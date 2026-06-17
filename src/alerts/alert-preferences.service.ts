import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AlertPreference } from "./entities/alert-preference.entity";
import { CreateAlertPreferenceDto, UpdateAlertPreferenceDto } from "./dto/alert-preference.dto";
import { AlertType } from "./entities/alert.entity";

@Injectable()
export class AlertPreferencesService {
  constructor(
    @InjectRepository(AlertPreference)
    private readonly preferenceRepo: Repository<AlertPreference>,
  ) {}

  createPreference(dto: CreateAlertPreferenceDto): Promise<AlertPreference> {
    const preference = this.preferenceRepo.create({
      ...dto,
      alertTypes: dto.alertTypes || [],
      config: dto.config || {},
      enabled: dto.enabled !== false,
    });
    return this.preferenceRepo.save(preference);
  }

  getUserPreferences(userId: string): Promise<AlertPreference[]> {
    return this.preferenceRepo.find({ where: { userId } });
  }

  async getPreferencesForUser(userId: string, alertType: AlertType): Promise<AlertPreference[]> {
    const preferences = await this.preferenceRepo.find({ where: { userId, enabled: true } });
    return preferences.filter(
      (preference) =>
        !preference.alertTypes?.length ||
        preference.alertTypes.includes(alertType),
    );
  }

  async updatePreference(
    id: string,
    dto: UpdateAlertPreferenceDto,
  ): Promise<AlertPreference> {
    const preference = await this.preferenceRepo.findOne({ where: { id } });
    if (!preference) {
      throw new NotFoundException(`Alert preference ${id} not found`);
    }

    Object.assign(preference, {
      ...dto,
      alertTypes: dto.alertTypes || preference.alertTypes,
      config: dto.config ?? preference.config,
      enabled: dto.enabled ?? preference.enabled,
    });

    return this.preferenceRepo.save(preference);
  }

  async deletePreference(id: string): Promise<void> {
    const preference = await this.preferenceRepo.findOne({ where: { id } });
    if (!preference) {
      throw new NotFoundException(`Alert preference ${id} not found`);
    }
    await this.preferenceRepo.remove(preference);
  }
}
