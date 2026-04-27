import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from "typeorm";
import { DeFiPosition } from "./defi-position.entity";

export enum TransactionType {
  DEPOSIT = "deposit",
  WITHDRAW = "withdraw",
  BORROW = "borrow",
  REPAY = "repay",
  CLAIM_REWARD = "claim_reward",
  SWAP = "swap",
  STAKE = "stake",
  UNSTAKE = "unstake",
  MIGRATE = "migrate",
  LIQUIDATE = "liquidate",
}

export enum TransactionStatus {
  PENDING = "pending",
  SUBMITTED = "submitted",
  CONFIRMED = "confirmed",
  FAILED = "failed",
  REVERTED = "reverted",
  SIMULATED = "simulated",
}

@Entity("defi_transactions")
@Index(["position_id", "created_at"])
@Index(["status", "created_at"])
@Index(["transaction_hash"])
export class DeFiTransaction {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => DeFiPosition, (position) => position.transactions, {
    onDelete: "CASCADE",
  })
  position: DeFiPosition;

  @Column("uuid")
  position_id: string;

  @Column("enum", { enum: TransactionType })
  transaction_type: TransactionType;

  @Column("enum", { enum: TransactionStatus })
  status: TransactionStatus;

  @Column("varchar", { length: 255, nullable: true })
  transaction_hash: string;

  @Column("varchar", { length: 255, nullable: true })
  transaction_link: string;

  @Column("decimal", { precision: 36, scale: 18 })
  amount_in: number;

  @Column("varchar", { length: 100 })
  token_in: string;

  @Column("decimal", { precision: 36, scale: 18, nullable: true })
  amount_out: number;

  @Column("varchar", { length: 100, nullable: true })
  token_out: string;

  @Column("decimal", { precision: 36, scale: 18 })
  gas_used: number;

  @Column("decimal", { precision: 18, scale: 9 })
  gas_price_gwei: number;

  @Column("decimal", { precision: 36, scale: 18 })
  gas_cost_usd: number;

  @Column("integer", { nullable: true })
  block_number: number;

  @Column("varchar", { length: 255 })
  network: string; // ethereum, arbitrum, polygon, etc

  @Column("json", { nullable: true })
  simulation_results: Record<string, any>;

  @Column("text", { nullable: true })
  error_message: string;

  @Column("json", { nullable: true })
  encoded_data: Record<string, any>;

  @CreateDateColumn()
  created_at: Date;

  @Column("timestamp", { nullable: true })
  executed_at: Date;
}
