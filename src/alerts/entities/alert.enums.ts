import { AlertType } from "./alert.entity";

export enum AlertChannel {
  IN_APP = "in_app",
  WEBHOOK = "webhook",
  EMAIL = "email",
}

export enum AlertDeliveryStatus {
  PENDING = "pending",
  SENT = "sent",
  FAILED = "failed",
  DEDUPED = "deduped",
}
