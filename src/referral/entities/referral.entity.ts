import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from "typeorm";
import { User } from "../user/entities/user.entity";

/**
 * Status of a referral
 */
export enum ReferralStatus {
  PENDING = "pending", // Invite sent but not yet registered
  REGISTERED = "registered", // Referee has registered
  ACTIVE = "active", // Referee is actively using the platform
  REWARDED = "rewarded", // Reward has been distributed
}

/**
 * Referral relationship between users
 */
@Entity("referrals")
@Index(["referrerId", "refereeId"], { unique: true })
@Index(["refereeEmail"])
@Index(["status"])
@Index(["createdAt"])
export class Referral {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /**
   * User who sent the referral invite
   */
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

  /**
   * Reference to the referrer user entity
   */
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "referrerId" })
  referrer: User;

  /**
   * User who was referred (nullable until registration)
   */
  @Column({ type: "uuid", nullable: true })
  @Index()
  refereeId: string | null;

  /**
   * Reference to the referee user entity
   */
  @ManyToOne(() => User, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "refereeId" })
  referee?: User | null;

  /**
   * Email of the referee (used before registration)
   */
  @Column({ type: "varchar" })
  @Index()
  refereeEmail: string;

  /**
   * Unique referral code/token
   */
  @Column({ type: "varchar", unique: true })
  @Index()
  referralCode: string;

  /**
   * Status of the referral
   */
  @Column({
    type: "enum",
    enum: ReferralStatus,
    default: ReferralStatus.PENDING,
  })
  status: ReferralStatus;

  /**
   * Custom message from referrer (optional)
   */
  @Column({ type: "text", nullable: true })
  message?: string;

  /**
   * Metadata about the referral (source, campaign, etc.)
   */
  @Column({ type: "jsonb", nullable: true })
  metadata?: Record<string, any>;

  /**
   * When the referral was registered (null until registration)
   */
  @Column({ type: "timestamp", nullable: true })
  registeredAt?: Date;

  /**
   * When the referral was rewarded (null until reward)
   */
  @Column({ type: "timestamp", nullable: true })
  rewardedAt?: Date;

  /**
   * Creation timestamp
   */
  @CreateDateColumn()
  createdAt: Date;

  /**
   * Last update timestamp
   */
  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Events related to this referral
   */
  @OneToMany(() => ReferralEvent, (event) => event.referral)
  events: ReferralEvent[];
}
