import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { RewardRule } from './reward-rule.entity';
import { RuleEvaluationContext, RuleAction } from '../interfaces/rule.interface';

@Entity('reward_calculations')
export class RewardCalculation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  ruleId: string;

  @ManyToOne(() => RewardRule)
  @JoinColumn({ name: 'ruleId' })
  rule: RewardRule;

  @Column()
  @Index()
  userId: string;

  @Column()
  eventType: string;

  @Column({ type: 'json' })
  context: RuleEvaluationContext;

  @Column({ type: 'json' })
  action: RuleAction;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  calculatedAmount: number;

  @Column({ default: false })
  processed: boolean;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date;

  @Column({ type: 'json', nullable: true })
  processingResult: any;

  @CreateDateColumn()
  calculatedAt: Date;
}