import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

export enum AlertType {
  PRICE = "price",
  PORTFOLIO = "portfolio",
  LIQUIDATION = "liquidation",
}

export enum AlertCondition {
  ABOVE = "above",
  BELOW = "below",
}

@Entity("alerts")
export class Alert {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({ type: "enum", enum: AlertType })
  type: AlertType;

  @Column({ nullable: true })
  asset?: string;

  @Column({ type: "enum", enum: AlertCondition, nullable: true })
  condition?: AlertCondition;

  @Column({ type: "decimal", precision: 36, scale: 18, nullable: true })
  threshold?: number;

  /** Cooldown in seconds to prevent spam */
  @Column({ type: "int", default: 300 })
  cooldownSeconds: number;

  @Column({ type: "timestamp", nullable: true })
  lastTriggeredAt?: Date;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
