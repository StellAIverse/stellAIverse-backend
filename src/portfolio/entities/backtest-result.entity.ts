import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "../../user/entities/user.entity";

export enum BacktestStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
}

@Entity("backtest_results")
@Index(["userId", "createdAt"])
export class BacktestResult {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({
    type: "enum",
    enum: BacktestStatus,
    default: BacktestStatus.PENDING,
  })
  status: BacktestStatus;

  // Backtest parameters
  @Column({ type: "date" })
  startDate: Date;

  @Column({ type: "date" })
  endDate: Date;

  @Column({ type: "decimal", precision: 18, scale: 2 })
  initialCapital: number;

  @Column({ type: "varchar" })
  strategy: string; // Strategy name or description

  @Column({ type: "jsonb" })
  strategyParameters: Record<string, any>;

  @Column({ type: "jsonb", nullable: true })
  assets: Array<{ ticker: string; weight: number }>;

  // Backtest results - Returns
  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  totalReturn: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  annualizedReturn: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  cumulativeReturn: number;

  // Backtest results - Risk metrics
  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  volatility: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  sharpeRatio: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  sortinoRatio: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  calmarRatio: number;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  maxDrawdown: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  valueAtRisk95: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  conditionalValueAtRisk95: number;

  // Benchmark comparison
  @Column({ type: "varchar", nullable: true })
  benchmarkTicker: string;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  benchmarkReturn: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  alpha: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  beta: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  correlation: number;

  // Trade analysis
  @Column({ type: "integer", nullable: true })
  totalTrades: number;

  @Column({ type: "integer", nullable: true })
  winningTrades: number;

  @Column({ type: "integer", nullable: true })
  losingTrades: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  winRate: number;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  avgWinSize: number;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  avgLossSize: number;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  profitFactor: number;

  // Final metrics
  @Column({ type: "decimal", precision: 18, scale: 2, nullable: true })
  finalValue: number;

  @Column({ type: "decimal", precision: 18, scale: 2, nullable: true })
  totalProfit: number;

  // Monthly returns
  @Column({ type: "jsonb", nullable: true })
  monthlyReturns: Record<string, number>;

  // Yearly returns
  @Column({ type: "jsonb", nullable: true })
  yearlyReturns: Record<string, number>;

  // Daily returns data (for visualization)
  @Column({ type: "jsonb", nullable: true })
  dailyReturns: Array<{ date: string; return: number; value: number }>;

  // Rebalancing events during backtest
  @Column({ type: "integer", nullable: true })
  rebalancingEvents: number;

  @Column({ type: "decimal", precision: 18, scale: 2, nullable: true })
  totalTransactionCosts: number;

  // Errors and warnings
  @Column({ type: "text", nullable: true })
  errorMessage: string;

  @Column({ type: "jsonb", nullable: true })
  warnings: string[];

  // Performance per asset
  @Column({ type: "jsonb", nullable: true })
  assetPerformance: Record<
    string,
    {
      totalReturn: number;
      volatility: number;
      sharpeRatio: number;
      maxDrawdown: number;
    }
  >;

  // Metadata
  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column("uuid")
  userId: string;
}
