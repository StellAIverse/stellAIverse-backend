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

export enum OptimizationMethod {
  MEAN_VARIANCE = "mean_variance",
  BLACK_LITTERMAN = "black_litterman",
  RISK_PARITY = "risk_parity",
  EQUAL_WEIGHT = "equal_weight",
  MIN_VARIANCE = "min_variance",
  MAX_SHARPE = "max_sharpe",
  CUSTOM_ML = "custom_ml",
}

export enum OptimizationStatus {
  PENDING = "pending",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  FAILED = "failed",
  APPROVED = "approved",
  REJECTED = "rejected",
  IMPLEMENTED = "implemented",
}

@Entity("optimization_history")
@Index(["portfolioId", "createdAt"])
export class OptimizationHistory {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({
    type: "enum",
    enum: OptimizationMethod,
    default: OptimizationMethod.MEAN_VARIANCE,
  })
  method: OptimizationMethod;

  @Column({
    type: "enum",
    enum: OptimizationStatus,
    default: OptimizationStatus.PENDING,
  })
  status: OptimizationStatus;

  // Input parameters
  @Column({ type: "jsonb" })
  parameters: Record<string, any>;

  // Optimized allocation suggestion
  @Column({ type: "jsonb" })
  suggestedAllocation: Record<string, number>;

  // Performance metrics for suggested allocation
  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  expectedReturn: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  expectedVolatility: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  expectedSharpeRatio: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  valueAtRisk: number; // 95% VaR

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  conditionalValueAtRisk: number; // Expected shortfall

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  maxDrawdown: number;

  // Backtested performance
  @Column({ type: "jsonb", nullable: true })
  backtestedMetrics: {
    totalReturn?: number;
    annualizedReturn?: number;
    volatility?: number;
    sharpeRatio?: number;
    maxDrawdown?: number;
  };

  // Comparison to current allocation
  @Column({ type: "jsonb", nullable: true })
  currentAllocation: Record<string, number>;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  improvementScore: number; // Percentage improvement

  // ML insights
  @Column({ type: "jsonb", nullable: true })
  mlPredictions: {
    predictions?: Array<{ asset: string; predictedReturn: number }>;
    confidence?: number;
    timestamps?: string[];
  };

  // Constraints applied
  @Column({ type: "jsonb", nullable: true })
  constraintsApplied: Record<string, any>;

  // Fees and costs
  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  estimatedTransactionCost: number;

  @Column({ type: "integer", nullable: true })
  estimatedTradesRequired: number;

  // Notes and feedback
  @Column({ type: "text", nullable: true })
  notes: string;

  @Column({ type: "text", nullable: true })
  rejectionReason: string;

  // Error handling
  @Column({ type: "text", nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ nullable: true })
  implementedAt: Date;

  // Relations
  @ManyToOne(() => Portfolio, (portfolio) => portfolio.optimizationHistory, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "portfolioId" })
  portfolio: Portfolio;

  @Column("uuid")
  portfolioId: string;
}
