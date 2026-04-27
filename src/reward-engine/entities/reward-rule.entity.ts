import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { RuleCondition, RuleAction } from '../interfaces/rule.interface';

export enum RuleType {
  TRANSACTION_BONUS = 'transaction_bonus',
  REFERRAL_REWARD = 'referral_reward',
  LOYALTY_MULTIPLIER = 'loyalty_multiplier',
  CAMPAIGN_BONUS = 'campaign_bonus',
  TIME_BASED_EVENT = 'time_based_event',
  ACHIEVEMENT_UNLOCK = 'achievement_unlock',
}

@Entity('reward_rules')
export class RewardRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'varchar',
    enum: RuleType,
    default: RuleType.TRANSACTION_BONUS,
  })
  type: RuleType;

  @Column({ type: 'json' })
  conditions: RuleCondition[];

  @Column({ type: 'json' })
  action: RuleAction;

  @Column({ type: 'int', default: 0 })
  priority: number; // Lower numbers = higher priority

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  startDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  endDate: Date;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'int', default: 0 })
  usageCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastUsed: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}