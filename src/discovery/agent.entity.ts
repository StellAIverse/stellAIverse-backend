import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum AgentCapability {
  TEXT_GENERATION = 'text_generation',
  IMAGE_ANALYSIS = 'image_analysis',
  CODE_EXECUTION = 'code_execution',
  DATA_ANALYSIS = 'data_analysis',
  WEB_SEARCH = 'web_search',
  FILE_PROCESSING = 'file_processing',
  TRANSLATION = 'translation',
  SENTIMENT_ANALYSIS = 'sentiment_analysis',
}

export enum AgentStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  MAINTENANCE = 'maintenance',
}

@Entity('agents')
@Index(['status', 'popularityScore'])
@Index(['capabilities'])
export class Agent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  name: string;

  @Column('text')
  description: string;

  @Column({
    type: 'simple-array',
  })
  capabilities: AgentCapability[];

  @Column({
    type: 'enum',
    enum: AgentStatus,
    default: AgentStatus.ACTIVE,
  })
  @Index()
  status: AgentStatus;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  averageRating: number;

  @Column({ type: 'int', default: 0 })
  totalRatings: number;

  @Column({ type: 'int', default: 0 })
  usageCount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  popularityScore: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    author?: string;
    version?: string;
    tags?: string[];
    language?: string;
    [key: string]: any;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date;
}