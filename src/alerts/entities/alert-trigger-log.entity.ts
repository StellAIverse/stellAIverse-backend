import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity("alert_trigger_logs")
export class AlertTriggerLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  alertId: string;

  @Column()
  userId: string;

  @Column({ type: "jsonb", nullable: true })
  payload?: Record<string, unknown>;

  @CreateDateColumn()
  triggeredAt: Date;
}
