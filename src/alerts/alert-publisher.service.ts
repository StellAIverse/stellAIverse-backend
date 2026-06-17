import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  ALERT_PRICE_EVENT,
  ALERT_RISK_EVENT,
  AlertEventPayload,
} from "./events/alert-events";

@Injectable()
export class AlertPublisherService {
  constructor(private readonly emitter: EventEmitter2) {}

  publishPriceAlert(event: AlertEventPayload): void {
    this.emitter.emit(ALERT_PRICE_EVENT, event);
  }

  publishRiskAlert(event: AlertEventPayload): void {
    this.emitter.emit(ALERT_RISK_EVENT, event);
  }
}
