import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

export enum ProvenanceStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
}

export enum ProvenanceAction {
  REQUEST_RECEIVED = 'request_received',
  PROVIDER_CALL = 'provider_call',
  RESULT_NORMALIZATION = 'result_normalization',
  SUBMISSION = 'submission',
  ERROR = 'error',
}

/**
 * Entity for tracking comprehensive provenance of agent activities
 * Records every step of agent execution with cryptographic signatures
 * Provides immutable audit trail for all agent operations
 */
@Entity('provenance_records')
@Index(['agentId', 'createdAt'])
@Index(['userId', 'createdAt'])
@Index(['status', 'createdAt'])
@Index(['action', 'createdAt'])
@Index(['onChainTxHash'])
export class ProvenanceRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * ID of the agent that performed the action
   */
  @Column({ type: 'varchar', length: 36 })
  @Index()
  agentId: string;

  /**
   * ID of the user who initiated the action
   */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  userId: string | null;

  /**
   * Reference to the user entity
   */
  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  /**
   * Type of action being recorded
   */
  @Column({
    type: 'enum',
    enum: ProvenanceAction,
  })
  @Index()
  action: ProvenanceAction;

  /**
   * Input data for the action (stored as JSON)
   */
  @Column({ type: 'jsonb' })
  input: Record<string, any>;

  /**
   * Output data from the action (stored as JSON)
   */
  @Column({ type: 'jsonb', nullable: true })
  output: Record<string, any> | null;

  /**
   * Provider used for the action (e.g., 'openai', 'anthropic')
   */
  @Column({ type: 'varchar', length: 100, nullable: true })
  provider: string | null;

  /**
   * Specific model used (e.g., 'gpt-4', 'claude-3')
   */
  @Column({ type: 'varchar', length: 100, nullable: true })
  providerModel: string | null;

  /**
   * Current status of the action
   */
  @Column({
    type: 'enum',
    enum: ProvenanceStatus,
    default: ProvenanceStatus.PENDING,
  })
  @Index()
  status: ProvenanceStatus;

  /**
   * Error message if action failed
   */
  @Column({ type: 'text', nullable: true })
  error: string | null;

  /**
   * On-chain transaction hash for submissions
   */
  @Column({ type: 'varchar', length: 66, nullable: true })
  @Index()
  onChainTxHash: string | null;

  /**
   * Cryptographic signature of the record for tamper-evidence
   */
  @Column({ type: 'varchar', length: 132 })
  signature: string;

  /**
   * Hash of the record data for integrity verification
   */
  @Column({ type: 'varchar', length: 66 })
  recordHash: string;

  /**
   * Processing duration in milliseconds
   */
  @Column({ type: 'int', nullable: true })
  processingDurationMs: number | null;

  /**
   * Additional metadata for extensibility
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  /**
   * Timestamp when the record was created (immutable)
   */
  @CreateDateColumn()
  @Index()
  createdAt: Date;

  /**
   * IP address of the client that triggered the action
   */
  @Column({ type: 'varchar', length: 45, nullable: true })
  clientIp: string | null;

  /**
   * User agent string of the client
   */
  @Column({ type: 'text', nullable: true })
  userAgent: string | null;
}
