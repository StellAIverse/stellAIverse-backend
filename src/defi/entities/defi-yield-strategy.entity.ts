import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";
import { User } from "../../user/entities/user.entity";

export enum StrategyType {
  HIGHEST_YIELD = "highest_yield",
  STABLE_YIELD = "stable_yield",
  RISK_ADJUSTED = "risk_adjusted",
  DIVERSIFIED = "diversified",
  FARMING = "farming",
  DELEGATED = "delegated",
  CUSTOM = "custom",
}

export enum StrategyStatus {
  ACTIVE = "active",
  PAUSED = "paused",
  COMPLETED = "completed",
  FAILED = "failed",
  RETIRED = "retired",
}

@Entity("defi_yield_strategies")
@Index(["user_id", "status"])
@Index(["created_at"])
export class DeFiYieldStrategy {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User)
  user: User;

  @Column("uuid")
  user_id: string;

  @Column("varchar", { length: 255 })
  name: string;

  @Column("text", { nullable: true })
  description: string;

  @Column("enum", { enum: StrategyType })
  strategy_type: StrategyType;

  @Column("enum", { enum: StrategyStatus })
  status: StrategyStatus;

  @Column("json")
  protocols: string[]; // array of DeFiProtocol

  @Column("json")
  tokens: string[]; // array of token symbols

  @Column("decimal", { precision: 36, scale: 18 })
  total_allocation: number;

  @Column("decimal", { precision: 5, scale: 2 })
  target_min_apy: number;

  @Column("decimal", { precision: 5, scale: 2, nullable: true })
  target_max_slippage: number;

  @Column("decimal", { precision: 5, scale: 2, nullable: true })
  max_risk_score: number;

  @Column("json")
  allocation_weights: Record<string, number>; // protocol => weight

  @Column("json", { nullable: true })
  constraints: {
    maxLTVRatio?: number;
    minHealthFactor?: number;
    preferredNetwork?: string[];
    excludeProtocols?: string[];
    minLiquidity?: number;
  };

  @Column("boolean", { default: false })
  auto_rebalance_enabled: boolean;

  @Column("integer", { default: 7 })
  rebalance_frequency_days: number;

  @Column("boolean", { default: false })
  auto_compound_enabled: boolean;

  @Column("decimal", { precision: 5, scale: 2, nullable: true })
  current_apy: number;

  @Column("decimal", { precision: 36, scale: 18, default: 0 })
  accumulated_yield: number;

  @Column("decimal", { precision: 36, scale: 18 })
  current_value: number;

  @Column("json", { nullable: true })
  performance_metrics: {
    totalReturn?: number;
    annualizedReturn?: number;
    maxDrawdown?: number;
    volatility?: number;
    sharpeRatio?: number;
  };

  @Column("integer", { default: 0 })
  rebalance_count: number;

  @Column("timestamp", { nullable: true })
  last_rebalanced_at: Date;

  @Column("timestamp", { nullable: true })
  last_compounded_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
