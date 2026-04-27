import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "../user/entities/user.entity";
import { BonusCategory, TimeDecayType } from "./bonus-configuration.entity";

/**
 * Bonus calculation result entity
 * Stores calculated bonuses for users
 */
@Entity("bonus_calculations")
@Index(["userId"])
@Index(["category"])
@Index(["status"])
@Index(["calculatedAt"])
export class BonusCalculation {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({
    type: "enum",
    enum: BonusCategory,
  })
  category: BonusCategory;

  @Column({ type: "uuid", nullable: true })
  configurationId: string | null;

  @Column({ type: "decimal", precision: 20, scale: 8, default: 0 })
  baseAmount: number;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 1.0 })
  appliedWeight: number;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 1.0 })
  decayFactor: number;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 0 })
  compoundBonus: number;

  @Column({ type: "decimal", precision: 20, scale: 8, default: 0 })
  finalAmount: number;

  @Column({
    type: "enum",
    enum: TimeDecayType,
    default: TimeDecayType.NONE,
  })
  decayType: TimeDecayType;

  @Column({
    type: "varchar",
    default: "pending",
  })
  status: string;

  @Column({ type: "int", default: 0 })
  daysSinceEligible: number;

  @Column({ type: "json", nullable: true })
  calculationDetails: Record<string, any>;

  @Column({ type: "json", nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  calculatedAt: Date;
}
