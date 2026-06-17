import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";
import { AlertChannel, AlertDeliveryStatus } from "./alert.enums";

@Entity("alert_delivery_logs")
export class AlertDeliveryLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  preferenceId?: string;

  @Column({ type: "enum", enum: AlertChannel })
  channel: AlertChannel;

  @Column({ type: "varchar" })
  alertType: string;

  @Column({ type: "jsonb" })
  payload: Record<string, unknown>;

  @Column({ type: "enum", enum: AlertDeliveryStatus, default: AlertDeliveryStatus.PENDING })
  status: AlertDeliveryStatus;

  @Column({ type: "int", default: 0 })
  retryCount: number;

  @Column({ type: "timestamp", nullable: true })
  lastAttemptAt?: Date;

  @Column({ type: "timestamp", nullable: true })
  sentAt?: Date;

  @Column({ nullable: true })
  deduplicationKey?: string;

  @Column({ nullable: true, type: "text" })
  errorMessage?: string;

  @CreateDateColumn()
  createdAt: Date;
}
