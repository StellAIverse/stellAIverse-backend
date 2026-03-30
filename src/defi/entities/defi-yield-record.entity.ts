import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from "typeorm";
import { DeFiPosition } from "./defi-position.entity";

@Entity("defi_yield_records")
@Index(["position_id", "created_at"])
@Index(["created_at"])
export class DeFiYieldRecord {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => DeFiPosition, (position) => position.yield_records, {
    onDelete: "CASCADE",
  })
  position: DeFiPosition;

  @Column("uuid")
  position_id: string;

  @Column("decimal", { precision: 36, scale: 18 })
  amount: number;

  @Column("varchar", { length: 100 })
  token_symbol: string;

  @Column("decimal", { precision: 36, scale: 18 })
  token_value: number;

  @Column("decimal", { precision: 5, scale: 2 })
  apy: number;

  @Column("varchar", { length: 50 })
  yield_type: string; // interest, reward, farming, swap_fee

  @Column("json", { nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  created_at: Date;

  @Column("timestamp", { nullable: true })
  claim_date: Date;

  @Column("boolean", { default: false })
  claimed: boolean;
}
