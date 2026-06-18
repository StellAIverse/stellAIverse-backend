import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { AlertDispatcherService } from "./alert-dispatcher.service";
import {
  ALERT_PRICE_EVENT,
  ALERT_RISK_EVENT,
  AlertEventPayload,
} from "./events/alert-events";

@Injectable()
export class AlertEventListener {
  private readonly logger = new Logger(AlertEventListener.name);

  constructor(private readonly dispatcher: AlertDispatcherService) {}

  @OnEvent(ALERT_PRICE_EVENT)
  async handlePriceAlert(event: AlertEventPayload) {
    this.logger.log(`Handling price alert event for user ${event.userId}`);
    await this.dispatcher.dispatch(event);
  }

  @OnEvent(ALERT_RISK_EVENT)
  async handleRiskAlert(event: AlertEventPayload) {
    this.logger.log(`Handling risk alert event for user ${event.userId}`);
    await this.dispatcher.dispatch(event);
  }
}
