import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("liquidity_pools")
export class LiquidityPool {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  tokenA: string;

  @Column()
  tokenB: string;

  /** Fee tier in basis points: 10 = 0.1%, 50 = 0.5%, 100 = 1% */
  @Column({ type: "int", default: 30 })
  feeBps: number;

  /** Reserve of tokenA (stored as string to avoid precision loss) */
  @Column({ type: "decimal", precision: 36, scale: 18, default: "0" })
  reserveA: string;

  /** Reserve of tokenB */
  @Column({ type: "decimal", precision: 36, scale: 18, default: "0" })
  reserveB: string;

  /** Total LP tokens issued */
  @Column({ type: "decimal", precision: 36, scale: 18, default: "0" })
  totalLpTokens: string;

  /** Cumulative fees collected (tokenA equivalent) */
  @Column({ type: "decimal", precision: 36, scale: 18, default: "0" })
  totalFeesCollected: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
