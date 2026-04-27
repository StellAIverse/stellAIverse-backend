import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Portfolio } from "./portfolio.entity";

export enum RebalanceTrigger {
  MANUAL = "manual",
  TIME_BASED = "time_based",
  THRESHOLD_BASED = "threshold_based",
  ML_TRIGGERED = "ml_triggered",
  MARKET_EVENT = "market_event",
  RISK_BASED = "risk_based",
}

export enum RebalanceStatus {
  PENDING = "pending",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

@Entity("rebalancing_events")
@Index(["portfolioId", "createdAt"])
@Index(["status", "createdAt"])
export class RebalancingEvent {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({
    type: "enum",
    enum: RebalanceTrigger,
    default: RebalanceTrigger.MANUAL,
  })
  trigger: RebalanceTrigger;

  @Column({
    type: "enum",
    enum: RebalanceStatus,
    default: RebalanceStatus.PENDING,
  })
  status: RebalanceStatus;

  // Trigger details
  @Column({ type: "text", nullable: true })
  triggerReason: string;

  // Current allocation before rebalancing
  @Column({ type: "jsonb" })
  allocationBefore: Record<string, number>;

  // Target allocation for rebalancing
  @Column({ type: "jsonb" })
  allocationAfter: Record<string, number>;

  // Trades required
  @Column({ type: "jsonb" })
  trades: Array<{
    ticker: string;
    action: "buy" | "sell";
    quantity: number;
    price: number;
    value: number;
  }>;

  // Cost analysis
  @Column({ type: "decimal", precision: 18, scale: 2, nullable: true })
  estimatedCost: number;

  @Column({ type: "decimal", precision: 18, scale: 2, nullable: true })
  actualCost: number;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  taxImpact: number;

  // Drift analysis
  @Column({ type: "jsonb", nullable: true })
  allocationDrift: Record<string, number>; // Percentage drift from target

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  maxAllocationDrift: number;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  avgAllocationDrift: number;

  // Performance impact
  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  expectedReturnImprovement: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  volatilityChange: number;

  // Execution details
  @Column({ type: "text", nullable: true })
  executionNotes: string;

  @Column({ nullable: true })
  executedAt: Date;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  executionSlippage: number;

  @Column({ type: "text", nullable: true })
  failureReason: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  // Relations
  @ManyToOne(() => Portfolio, (portfolio) => portfolio.rebalancingEvents, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "portfolioId" })
  portfolio: Portfolio;

  @Column("uuid")
  portfolioId: string;
}
