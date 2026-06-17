import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { AlertChannel } from "./alert.enums";
import { AlertType } from "./alert.entity";

@Entity("alert_preferences")
export class AlertPreference {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({ type: "enum", enum: AlertChannel, default: AlertChannel.IN_APP })
  channel: AlertChannel;

  @Column({ type: "simple-array", nullable: true })
  alertTypes: AlertType[];

  @Column({ type: "jsonb", default: {} })
  config: Record<string, unknown>;

  @Column({ default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
