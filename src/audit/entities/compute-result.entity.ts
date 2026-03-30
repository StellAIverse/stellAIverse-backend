import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "../../user/entities/user.entity";

export enum ComputeResultStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  TIMEOUT = "timeout",
}

/**
 * Entity for tracking compute job results for audit purposes
 * Provides comprehensive audit trail for compute operations
 */
@Entity("compute_results")
@Index(["jobId", "status"])
@Index(["jobId", "createdAt"])
@Index(["status", "createdAt"])
@Index(["userId", "createdAt"])
@Index(["resultHash"], { unique: true })
export class ComputeResult {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /**
   * ID of the compute job this result belongs to
   */
  @Column({ type: "varchar", length: 36 })
  @Index()
  jobId: string;

  /**
   * The actual result data from the computation
   */
  @Column({ type: "jsonb" })
  resultData: Record<string, any>;

  /**
   * Hash of the result for integrity verification
   */
  @Column({ type: "varchar", length: 66 })
  @Index()
  resultHash: string;

  /**
   * Current status of the compute result
   */
  @Column({
    type: "enum",
    enum: ComputeResultStatus,
    default: ComputeResultStatus.PENDING,
  })
  @Index()
  status: ComputeResultStatus;

  /**
   * ID of the user who initiated the compute job
   */
  @Column({ type: "uuid" })
  @Index()
  userId: string;

  /**
   * Reference to the user entity
   */
  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;

  /**
   * Timestamp when the result was created
   */
  @CreateDateColumn()
  @Index()
  createdAt: Date;

  /**
   * Timestamp when the processing started
   */
  @Column({ type: "timestamp", nullable: true })
  @Index()
  startedAt: Date | null;

  /**
   * Timestamp when the processing completed
   */
  @Column({ type: "timestamp", nullable: true })
  @Index()
  completedAt: Date | null;

  /**
   * Processing duration in milliseconds
   */
  @Column({ type: "int", nullable: true })
  processingDurationMs: number | null;

  /**
   * Provider used for computation
   */
  @Column({ type: "varchar", length: 100, nullable: true })
  provider: string | null;

  /**
   * Cost of the computation in wei
   */
  @Column({ type: "bigint", nullable: true })
  costWei: string | null;

  /**
   * Error message if computation failed
   */
  @Column({ type: "text", nullable: true })
  errorMessage: string | null;

  /**
   * Additional metadata for the result
   */
  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any> | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
