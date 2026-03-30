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

export enum OracleSubmissionStatus {
  PENDING = "pending",
  SUBMITTED = "submitted",
  CONFIRMED = "confirmed",
  FAILED = "failed",
  EXPIRED = "expired",
}

/**
 * Entity for tracking oracle data submissions for audit purposes
 * Provides comprehensive audit trail for oracle operations
 */
@Entity("oracle_submissions")
@Index(["oracleId", "status"])
@Index(["oracleId", "submittedAt"])
@Index(["status", "createdAt"])
@Index(["userId", "createdAt"])
@Index(["dataHash"], { unique: true })
export class OracleSubmission {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /**
   * ID of the oracle this submission is related to
   */
  @Column({ type: "varchar", length: 36 })
  @Index()
  oracleId: string;

  /**
   * The actual data being submitted
   */
  @Column({ type: "jsonb" })
  data: Record<string, any>;

  /**
   * Hash of the data for integrity verification
   */
  @Column({ type: "varchar", length: 66 })
  @Index()
  dataHash: string;

  /**
   * Digital signature of the data
   */
  @Column({ type: "varchar", length: 132 })
  signature: string;

  /**
   * Current status of the submission
   */
  @Column({
    type: "enum",
    enum: OracleSubmissionStatus,
    default: OracleSubmissionStatus.PENDING,
  })
  @Index()
  status: OracleSubmissionStatus;

  /**
   * ID of the user who initiated the submission
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
   * Timestamp when the submission was initiated
   */
  @CreateDateColumn()
  @Index()
  createdAt: Date;

  /**
   * Timestamp when the submission was sent to the blockchain
   */
  @Column({ type: "timestamp", nullable: true })
  @Index()
  submittedAt: Date | null;

  /**
   * Timestamp when the submission was confirmed on-chain
   */
  @Column({ type: "timestamp", nullable: true })
  @Index()
  confirmedAt: Date | null;

  /**
   * Transaction hash of the on-chain submission
   */
  @Column({ type: "varchar", length: 66, nullable: true })
  @Index()
  transactionHash: string | null;

  /**
   * Block number when confirmed
   */
  @Column({ type: "bigint", nullable: true })
  blockNumber: string | null;

  /**
   * Number of retry attempts
   */
  @Column({ type: "int", default: 0 })
  retryAttempts: number;

  /**
   * Error message if submission failed
   */
  @Column({ type: "text", nullable: true })
  errorMessage: string | null;

  /**
   * Additional metadata for the submission
   */
  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any> | null;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Expiration timestamp for this submission
   */
  @Column({ type: "timestamp", nullable: true })
  @Index()
  expiresAt: Date | null;
}
