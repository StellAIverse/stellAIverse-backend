import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "../../user/entities/user.entity";

export enum ReferralStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  REJECTED = "rejected",
}

@Entity("referrals")
export class Referral {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  @Index()
  referrerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "referrerId" })
  referrer: User;

  @Column({ type: "uuid", unique: true })
  @Index()
  referredUserId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "referredUserId" })
  referredUser: User;

  @Column({
    type: "enum",
    enum: ReferralStatus,
    default: ReferralStatus.PENDING,
  })
  status: ReferralStatus;

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  rewardAmount: number;

  @CreateDateColumn()
  @Index()
  createdAt: Date;
}
