import { AlertType } from "../entities/alert.entity";

export type AlertEventType =
  | AlertType
  | "stop_loss"
  | "take_profit"
  | "drawdown"
  | "concentration"
  | "volatility";

export const ALERT_PRICE_EVENT = "alert.price";
export const ALERT_RISK_EVENT = "alert.risk";

export interface AlertEventPayload {
  userId: string;
  source: string;
  alert: {
    type: AlertEventType;
    severity: "low" | "medium" | "high" | "critical";
    message: string;
    asset?: string;
    threshold: number;
    currentValue: number;
    triggeredAt: Date;
    metadata?: Record<string, unknown>;
  };
}

export interface PriceAlertEventPayload {
  userId: string;
  source: string;
  asset: string;
  currentPrice: number;
}
