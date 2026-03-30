import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Portfolio } from "./portfolio.entity";

@Entity("performance_metrics")
@Index(["portfolioId", "dateTime"])
export class PerformanceMetric {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "timestamp" })
  dateTime: Date;

  // Portfolio value
  @Column({ type: "decimal", precision: 18, scale: 2 })
  portfolioValue: number;

  @Column({ type: "decimal", precision: 18, scale: 2, nullable: true })
  previousValue: number;

  // Returns
  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  dailyReturn: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  cumulativeReturn: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  yearToDateReturn: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  oneYearReturn: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  threeYearReturn: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  fiveYearReturn: number;

  // Risk metrics
  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  volatility: number; // Annualized standard deviation

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  sharpeRatio: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  sortinoRatio: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  calmarRatio: number;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  maxDrawdown: number;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  currentDrawdown: number;

  // Value at Risk metrics
  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  valueAtRisk95: number; // 95% VaR

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  conditionalValueAtRisk95: number; // 95% Expected Shortfall

  // Benchmark comparison (if benchmark provided)
  @Column({ type: "varchar", nullable: true })
  benchmarkTicker: string;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  benchmarkReturn: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  alpha: number; // Excess return vs benchmark

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  beta: number; // Market sensitivity

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  correlation: number; // Correlation with benchmark

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  trackingError: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  informationRatio: number;

  // Asset allocation at this snapshot
  @Column({ type: "jsonb", nullable: true })
  allocation: Record<string, number>;

  // Contribution to return
  @Column({ type: "jsonb", nullable: true })
  assetContribution: Record<string, number>;

  // Risk contribution
  @Column({ type: "jsonb", nullable: true })
  riskContribution: Record<string, number>;

  // Dividend and income metrics
  @Column({ type: "decimal", precision: 18, scale: 2, nullable: true })
  dividendYield: number;

  @Column({ type: "decimal", precision: 18, scale: 2, nullable: true })
  dividendIncome: number;

  // Cost metrics
  @Column({ type: "decimal", precision: 18, scale: 2, nullable: true })
  totalTransactionCosts: number;

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  expenseRatio: number;

  // Metadata
  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any>;

  // Relations
  @ManyToOne(() => Portfolio, (portfolio) => portfolio.performanceMetrics, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "portfolioId" })
  portfolio: Portfolio;

  @Column("uuid")
  portfolioId: string;
}
