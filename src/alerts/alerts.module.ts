import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Alert } from "./entities/alert.entity";
import { AlertTriggerLog } from "./entities/alert-trigger-log.entity";
import { AlertPreference } from "./entities/alert-preference.entity";
import { AlertDeliveryLog } from "./entities/alert-delivery-log.entity";
import { AlertsService } from "./alerts.service";
import { AlertPreferencesService } from "./alert-preferences.service";
import { AlertDispatcherService } from "./alert-dispatcher.service";
import { AlertPublisherService } from "./alert-publisher.service";
import { AlertEventListener } from "./alert-event-listener.service";
import { AlertsController } from "./alerts.controller";
import { AlertPreferencesController } from "./alert-preferences.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Alert,
      AlertTriggerLog,
      AlertPreference,
      AlertDeliveryLog,
    ]),
  ],
  providers: [
    AlertsService,
    AlertPreferencesService,
    AlertDispatcherService,
    AlertPublisherService,
    AlertEventListener,
  ],
  controllers: [AlertsController, AlertPreferencesController],
  exports: [AlertsService, AlertPreferencesService, AlertPublisherService],
})
export class AlertsModule {}
