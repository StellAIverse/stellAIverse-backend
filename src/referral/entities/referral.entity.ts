import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

/**
 * Referral code status enum
 */
export enum ReferralStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  EXPIRED = 'expired',
}

/**
 * Referral relationship type
 */
export enum ReferralRelationship {
  REFERRER = 'referrer',
  REFERRED = 'referred',
}

/**
 * Entity for managing referral codes and tracking referrals
 * Includes security fields for abuse prevention and compliance
 */
@Entity('referrals')
@Index(['referralCode'])
@Index(['referrerId'])
@Index(['referredId'])
@Index(['status'])
@Index(['createdAt'])
@Index(['ipAddress', 'deviceFingerprint'])
export class Referral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Unique referral code generated for the referrer
   */
  @Column({ type: 'varchar', length: 16, unique: true })
  @Index()
  referralCode: string;

  /**
   * User ID of the referrer (person who created the referral)
   */
  @Column({ type: 'uuid' })
  @Index()
  referrerId: string;

  /**
   * Reference to the referrer user entity
   */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referrerId' })
  referrer: User;

  /**
   * User ID of the referred user (person who used the referral)
   */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  referredId: string | null;

  /**
   * Reference to the referred user entity
   */
  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'referredId' })
  referred: User;

  /**
   * Referral status (active, inactive, suspended, expired)
   */
  @Column({
    type: 'enum',
    enum: ReferralStatus,
    default: ReferralStatus.ACTIVE,
  })
  status: ReferralStatus;

  /**
   * IP address of the referrer when creating the referral code
   */
  @Column({ type: 'varchar', length: 45, nullable: true })
  @Index()
  ipAddress: string | null;

  /**
   * Device fingerprint of the referrer when creating the referral
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  @Index()
  deviceFingerprint: string | null;

  /**
   * IP address of the referred user when using the referral
   */
  @Column({ type: 'varchar', length: 45, nullable: true })
  referredIpAddress: string | null;

  /**
   * Device fingerprint of the referred user when using the referral
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  referredDeviceFingerprint: string | null;

  /**
   * User agent string of the referred user
   */
  @Column({ type: 'text', nullable: true })
  referredUserAgent: string | null;

  /**
   * Whether the referral has been claimed (referred user signed up)
   */
  @Column({ default: false })
  claimed: boolean;

  /**
   * Timestamp when the referral was claimed
   */
  @Column({ type: 'timestamp', nullable: true })
  claimedAt: Date | null;

  /**
   * Reward amount earned from this referral
   */
  @Column({ type: 'decimal', precision: 18, scale: 8, default: 0 })
  rewardAmount: number;

  /**
   * Whether the reward has been paid out
   */
  @Column({ default: false })
  rewardPaid: boolean;

  /**
   * Timestamp when the reward was paid out
   */
  @Column({ type: 'timestamp', nullable: true })
  rewardPaidAt: Date | null;

  /**
   * Number of successful referrals made by this referrer
   */
  @Column({ default: 0 })
  successfulReferrals: number;

  /**
   * Reason for suspension (if status is SUSPENDED)
   */
  @Column({ type: 'text', nullable: true })
  suspensionReason: string | null;

  /**
   * Admin user ID who suspended this referral
   */
  @Column({ type: 'uuid', nullable: true })
  suspendedBy: string | null;

  /**
   * Timestamp when the referral was suspended
   */
  @Column({ type: 'timestamp', nullable: true })
  suspendedAt: Date | null;

  /**
   * Abuse flags triggered for this referral
   */
  @Column({ type: 'jsonb', nullable: true })
  abuseFlags: string[] | null;

  /**
   * Additional metadata for security tracking
   */
  @Column({ type: 'jsonb', nullable: true })
  securityMetadata: Record<string, unknown> | null;

  /**
   * Referral expiration date
   */
  @Column({ type: 'timestamp', nullable: true })
  @Index()
  expiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}