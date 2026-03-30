import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "../../user/entities/user.entity";

export enum RiskTolerance {
  VERY_CONSERVATIVE = "very_conservative",
  CONSERVATIVE = "conservative",
  MODERATE = "moderate",
  AGGRESSIVE = "aggressive",
  VERY_AGGRESSIVE = "very_aggressive",
}

export enum InvestmentGoal {
  CAPITAL_PRESERVATION = "capital_preservation",
  INCOME_GENERATION = "income_generation",
  BALANCED_GROWTH = "balanced_growth",
  GROWTH = "growth",
  AGGRESSIVE_GROWTH = "aggressive_growth",
}

@Entity("risk_profiles")
export class RiskProfile {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: "text", nullable: true })
  description: string;

  // Risk parameters
  @Column({
    type: "enum",
    enum: RiskTolerance,
    default: RiskTolerance.MODERATE,
  })
  riskTolerance: RiskTolerance;

  @Column({
    type: "enum",
    enum: InvestmentGoal,
    default: InvestmentGoal.BALANCED_GROWTH,
  })
  investmentGoal: InvestmentGoal;

  // Target metrics
  @Column({ type: "decimal", precision: 5, scale: 2, default: 7 })
  targetReturn: number; // Expected annual return

  @Column({ type: "decimal", precision: 5, scale: 2, default: 15 })
  maxVolatility: number; // Maximum volatility tolerance

  @Column({ type: "decimal", precision: 5, scale: 2, default: 10 })
  maxDrawdown: number; // Maximum acceptable drawdown

  @Column({ type: "decimal", precision: 5, scale: 2, default: 0.7 })
  sharpeRatioTarget: number; // Target Sharpe ratio

  // Asset allocation ranges
  @Column({ type: "decimal", precision: 5, scale: 2, default: 60 })
  equityAllocationMin: number;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 80 })
  equityAllocationMax: number;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 10 })
  bondAllocationMin: number;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 30 })
  bondAllocationMax: number;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 5 })
  alternativeAllocationMin: number;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 20 })
  alternativeAllocationMax: number;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 0 })
  cashAllocationMin: number;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 10 })
  cashAllocationMax: number;

  // Constraints
  @Column({ type: "jsonb", nullable: true })
  excludedAssets: string[]; // Tickers to exclude

  @Column({ type: "jsonb", nullable: true })
  requiredAssets: string[]; // Tickers that must be included

  @Column({ type: "jsonb", nullable: true })
  assetConstraints: Record<string, { min: number; max: number }>;

  // Time horizon
  @Column({ type: "integer", default: 10 })
  investmentHorizonYears: number;

  @Column({ type: "integer", nullable: true })
  rebalanceFrequencyMonths: number; // Months between rebalancing

  // ML preferences
  @Column({ type: "boolean", default: true })
  useMachineLearning: boolean;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 0.3 })
  mlConfidenceThreshold: number;

  // ESG and sustainability
  @Column({ type: "boolean", default: false })
  enableESGFiltering: boolean;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  minESGScore: number;

  // Metadata
  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column("uuid")
  userId: string;
}
