import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { TimeBasedEvent } from './time-based-event.entity';
import { User } from '../../user/entities/user.entity';

export enum ParticipationStatus {
  REGISTERED = 'registered',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

@Entity('event_participations')
@Unique(['eventId', 'userId'])
export class EventParticipation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  eventId: string;

  @ManyToOne(() => TimeBasedEvent)
  @JoinColumn({ name: 'eventId' })
  event: TimeBasedEvent;

  @Column()
  @Index()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'varchar',
    enum: ParticipationStatus,
    default: ParticipationStatus.REGISTERED,
  })
  status: ParticipationStatus;

  @Column({ type: 'timestamp', nullable: true })
  joinedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'int', default: 0 })
  claimsCount: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  totalEarned: number;

  @Column({ type: 'json', nullable: true })
  progress: {
    currentValue: number;
    targetValue: number;
    percentage: number;
    lastUpdated: Date;
  };

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}