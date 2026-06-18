import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import axios from "axios";
import { AlertPreference } from "./entities/alert-preference.entity";
import { AlertDeliveryLog } from "./entities/alert-delivery-log.entity";
import { AlertType } from "./entities/alert.entity";
import { AlertChannel, AlertDeliveryStatus } from "./entities/alert.enums";
import { AlertEventPayload } from "./events/alert-events";

@Injectable()
export class AlertDispatcherService {
  private readonly logger = new Logger(AlertDispatcherService.name);
  private readonly maxRetries = 3;

  constructor(
    @InjectRepository(AlertPreference)
    private readonly preferencesRepo: Repository<AlertPreference>,
    @InjectRepository(AlertDeliveryLog)
    private readonly deliveryLogRepo: Repository<AlertDeliveryLog>,
  ) {}

  async dispatch(event: AlertEventPayload): Promise<AlertDeliveryLog[]> {
    const preferences = await this.preferencesRepo.find({
      where: { userId: event.userId, enabled: true },
    });

    const eligible = preferences.filter(
      (preference) =>
        !preference.alertTypes?.length ||
        preference.alertTypes.includes(event.alert.type as any),
    );

    const deliveries: AlertDeliveryLog[] = [];

    for (const preference of eligible) {
      const deduplicationKey = this.createDeduplicationKey(event, preference);
      const existing = await this.deliveryLogRepo.findOne({
        where: { deduplicationKey, status: AlertDeliveryStatus.SENT },
      });

      if (existing) {
        const dedupLog = this.deliveryLogRepo.create({
          userId: event.userId,
          preferenceId: preference.id,
          channel: preference.channel,
          alertType: String(event.alert.type),
          payload: event.alert,
          status: AlertDeliveryStatus.DEDUPED,
          retryCount: 0,
          deduplicationKey,
        });
        const savedDedup = await this.deliveryLogRepo.save(dedupLog);
        deliveries.push(savedDedup);
        continue;
      }

      const log = this.deliveryLogRepo.create({
        userId: event.userId,
        preferenceId: preference.id,
        channel: preference.channel,
        alertType: String(event.alert.type),
        payload: event.alert,
        status: AlertDeliveryStatus.PENDING,
        retryCount: 0,
        deduplicationKey,
      });
      const savedLog = await this.deliveryLogRepo.save(log);

      const delivery = await this.sendWithRetry(preference, event, savedLog);
      deliveries.push(delivery);
    }

    return deliveries;
  }

  private createDeduplicationKey(
    event: AlertEventPayload,
    preference: AlertPreference,
  ): string {
    const endpoint = String(
      preference.config?.endpointUrl || preference.config?.recipientEmail || "",
    );
    return `${event.userId}:${event.alert.type}:${event.alert.message}:${preference.channel}:${endpoint}`;
  }

  private async sendWithRetry(
    preference: AlertPreference,
    event: AlertEventPayload,
    deliveryLog: AlertDeliveryLog,
  ): Promise<AlertDeliveryLog> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < this.maxRetries) {
      attempt += 1;
      deliveryLog.retryCount = attempt;
      deliveryLog.lastAttemptAt = new Date();

      try {
        await this.sendToChannel(preference, event);
        deliveryLog.status = AlertDeliveryStatus.SENT;
        deliveryLog.sentAt = new Date();
        deliveryLog.errorMessage = null;
        return this.deliveryLogRepo.save(deliveryLog);
      } catch (error) {
        lastError = error as Error;
        deliveryLog.status = AlertDeliveryStatus.FAILED;
        deliveryLog.errorMessage = String(error?.message ?? error);
        await this.deliveryLogRepo.save(deliveryLog);

        if (attempt >= this.maxRetries) {
          this.logger.warn(
            `Failed to deliver alert after ${attempt} attempts to ${preference.channel}`,
          );
          return deliveryLog;
        }

        await this.delay(500 * attempt);
      }
    }

    if (lastError) {
      throw lastError;
    }

    return deliveryLog;
  }

  private async sendToChannel(
    preference: AlertPreference,
    event: AlertEventPayload,
  ): Promise<void> {
    switch (preference.channel) {
      case AlertChannel.WEBHOOK:
        await this.sendWebhook(preference, event);
        return;
      case AlertChannel.EMAIL:
        await this.sendEmail(preference, event);
        return;
      case AlertChannel.IN_APP:
      default:
        this.logger.log(
          `Recorded in-app alert for user ${event.userId}`,
          event.alert.message,
        );
        return;
    }
  }

  private async sendWebhook(
    preference: AlertPreference,
    event: AlertEventPayload,
  ): Promise<void> {
    const endpointUrl = String(preference.config?.endpointUrl || "");
    if (!endpointUrl) {
      throw new Error("Webhook preference missing endpointUrl");
    }

    await axios.post(
      endpointUrl,
      {
        userId: event.userId,
        source: event.source,
        alert: event.alert,
      },
      {
        timeout: 5000,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  private async sendEmail(
    preference: AlertPreference,
    event: AlertEventPayload,
  ): Promise<void> {
    const recipientEmail = String(preference.config?.recipientEmail || "");
    if (!recipientEmail) {
      throw new Error("Email preference missing recipientEmail");
    }

    this.logger.log(
      `Simulated email alert to ${recipientEmail} for user ${event.userId}: ${event.alert.message}`,
    );
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
