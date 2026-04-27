import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

/**
 * Bonus category types
 */
export enum BonusCategory {
  REFERRAL = "referral",
  ENGAGEMENT = "engagement",
  ACHIEVEMENT = "achievement",
  SEASONAL = "seasonal",
  LOYALTY = "loyalty",
  COMPOUND = "compound",
}

/**
 * Time decay types
 */
export enum TimeDecayType {
  NONE = "none",
  LINEAR = "linear",
  EXPONENTIAL = "exponential",
  LOGARITHMIC = "logarithmic",
}

/**
 * Bonus configuration entity
 * Stores configurable bonus rules and weights
 */
@Entity("bonus_configurations")
@Index(["category"])
@Index(["isActive"])
@Index(["startDate", "endDate"])
export class BonusConfiguration {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({
    type: "enum",
    enum: BonusCategory,
  })
  category: BonusCategory;

  @Column({ type: "varchar", unique: true })
  name: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 1.0 })
  baseWeight: number;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 0 })
  bonusMultiplier: number;

  @Column({
    type: "enum",
    enum: TimeDecayType,
    default: TimeDecayType.NONE,
  })
  decayType: TimeDecayType;

  @Column({ type: "int", default: 0 })
  decayRate: number; // Percentage per day or decay constant

  @Column({ type: "decimal", precision: 5, scale: 2, default: 0 })
  minimumThreshold: number;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 100 })
  maximumBonus: number;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "boolean", default: false })
  allowCompounding: boolean;

  @Column({ type: "int", default: 0 })
  compoundMultiplier: number; // How much previous bonuses affect new ones

  @Column({ type: "date", nullable: true })
  startDate: Date | null;

  @Column({ type: "date", nullable: true })
  endDate: Date | null;

  @Column({ type: "json", nullable: true })
  conditions: Record<string, any>;

  @Column({ type: "json", nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
