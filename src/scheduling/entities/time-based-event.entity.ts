import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { User } from '../user/entities/user.entity';

export enum EventType {
  LIMITED_TIME_BONUS = 'limited_time_bonus',
  SEASONAL_CAMPAIGN = 'seasonal_campaign',
  ANNIVERSARY_REWARD = 'anniversary_reward',
  TIME_SENSITIVE_CHALLENGE = 'time_sensitive_challenge',
  RECURRING_REWARD = 'recurring_reward',
}

export enum EventStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum RecurrenceType {
  NONE = 'none',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  CUSTOM = 'custom',
}

@Entity('time_based_events')
export class TimeBasedEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'varchar',
    enum: EventType,
    default: EventType.LIMITED_TIME_BONUS,
  })
  type: EventType;

  @Column({
    type: 'varchar',
    enum: EventStatus,
    default: EventStatus.DRAFT,
  })
  status: EventStatus;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp' })
  endDate: Date;

  @Column({
    type: 'varchar',
    enum: RecurrenceType,
    default: RecurrenceType.NONE,
  })
  recurrenceType: RecurrenceType;

  @Column({ type: 'json', nullable: true })
  recurrenceConfig: {
    interval?: number; // For custom recurrence
    daysOfWeek?: number[]; // 0-6, Sunday = 0
    daysOfMonth?: number[]; // 1-31
    months?: number[]; // 0-11
    timeZone?: string;
  };

  @Column({ type: 'json' })
  rewardConfig: {
    type: string;
    amount: number | string;
    currency?: string;
    multiplier?: number;
    featureId?: string;
    duration?: number;
    maxClaims?: number;
    userEligibilityRules?: any[];
  };

  @Column({ type: 'json', nullable: true })
  targetingConfig: {
    userSegments?: string[];
    minUserLevel?: number;
    maxUserLevel?: number;
    countries?: string[];
    excludedUsers?: string[];
    includedUsers?: string[];
  };

  @Column({ type: 'int', default: 0 })
  maxParticipants: number;

  @Column({ type: 'int', default: 0 })
  currentParticipants: number;

  @Column({ type: 'int', default: 0 })
  totalClaims: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  totalRewardsDistributed: number;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @ManyToMany(() => User)
  @JoinTable({
    name: 'event_participants',
    joinColumn: { name: 'eventId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'userId', referencedColumnName: 'id' },
  })
  participants: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}