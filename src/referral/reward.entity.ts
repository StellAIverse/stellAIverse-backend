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
import { User } from "../user/entities/user.entity";

export enum RewardType {
  CREDITS = "credits",
  TOKENS = "tokens",
  FEATURE_UNLOCK = "feature_unlock",
}

export enum RewardStatus {
  PENDING = "pending",
  AWARDED = "awarded",
  FAILED = "failed",
}

export enum RewardTrigger {
  REGISTRATION = "registration",
  FIRST_TRANSACTION = "first_transaction",
}

@Entity("referral_rewards")
export class ReferralReward {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  @Index()
  referrerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "referrerId" })
  referrer: User;

  @Column()
  @Index()
  refereeId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "refereeId" })
  referee: User;

  @Column({
    type: "varchar",
    default: RewardType.CREDITS,
  })
  rewardType: RewardType;

  @Column({ type: "decimal", precision: 20, scale: 8, default: 0 })
  amount: number;

  @Column({
    type: "varchar",
    default: RewardStatus.PENDING,
  })
  status: RewardStatus;

  @Column({
    type: "varchar",
  })
  triggerEvent: RewardTrigger;

  @Column({ type: "json", nullable: true })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
