import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { User } from "../../user/entities/user.entity";
import { PortfolioAsset } from "./portfolio-asset.entity";
import { OptimizationHistory } from "./optimization-history.entity";
import { RebalancingEvent } from "./rebalancing-event.entity";
import { PerformanceMetric } from "./performance-metric.entity";

export enum PortfolioStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  ARCHIVED = "archived",
}

@Entity("portfolios")
@Index(["userId", "status"])
export class Portfolio {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({
    type: "enum",
    enum: PortfolioStatus,
    default: PortfolioStatus.ACTIVE,
  })
  status: PortfolioStatus;

  // Total portfolio value
  @Column({ type: "decimal", precision: 18, scale: 2, default: 0 })
  totalValue: number;

  // Current allocation in JSON format
  @Column({ type: "jsonb", default: {} })
  currentAllocation: Record<string, number>;

  // Target allocation (from optimization)
  @Column({ type: "jsonb", nullable: true })
  targetAllocation: Record<string, number>;

  // Portfolio metadata
  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any>;

  // Rebalancing configuration
  @Column({ type: "boolean", default: false })
  autoRebalanceEnabled: boolean;

  @Column({ type: "varchar", nullable: true })
  rebalanceFrequency: "daily" | "weekly" | "monthly" | "quarterly" | null;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 5 })
  rebalanceThreshold: number; // Percentage threshold for rebalancing

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  lastRebalanceDate: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column("uuid")
  userId: string;

  @OneToMany(() => PortfolioAsset, (asset) => asset.portfolio, {
    cascade: true,
  })
  assets: PortfolioAsset[];

  @OneToMany(() => OptimizationHistory, (history) => history.portfolio, {
    cascade: true,
  })
  optimizationHistory: OptimizationHistory[];

  @OneToMany(() => RebalancingEvent, (event) => event.portfolio, {
    cascade: true,
  })
  rebalancingEvents: RebalancingEvent[];

  @OneToMany(() => PerformanceMetric, (metric) => metric.portfolio, {
    cascade: true,
  })
  performanceMetrics: PerformanceMetric[];
}
