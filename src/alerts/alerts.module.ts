import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Alert } from "./entities/alert.entity";
import { AlertTriggerLog } from "./entities/alert-trigger-log.entity";
import { AlertsService } from "./alerts.service";
import { AlertsController } from "./alerts.controller";

@Module({
  imports: [TypeOrmModule.forFeature([Alert, AlertTriggerLog])],
  providers: [AlertsService],
  controllers: [AlertsController],
  exports: [AlertsService],
})
export class AlertsModule {}
