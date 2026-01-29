import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PayloadStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

export enum PayloadType {
  ORACLE_UPDATE = 'oracle_update',
  AGENT_RESULT = 'agent_result',
  PRICE_FEED = 'price_feed',
  COMPUTE_PROOF = 'compute_proof',
}

/**
 * Entity for storing signed payloads and their submission status
 * Provides audit trail for all on-chain submissions
 */
@Entity('signed_payloads')
@Index(['signerAddress', 'status'])
@Index(['payloadHash'], { unique: true })
@Index(['transactionHash'])
export class SignedPayload {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Type of payload being submitted
   */
  @Column({
    type: 'enum',
    enum: PayloadType,
  })
  payloadType: PayloadType;

  /**
   * Address that signed this payload
   */
  @Column({ type: 'varchar', length: 42 })
  signerAddress: string;

  /**
   * Nonce used for this submission
   */
  @Column({ type: 'bigint' })
  nonce: string;

  /**
   * The actual payload data (stored as JSON)
   */
  @Column({ type: 'jsonb' })
  payload: Record<string, any>;

  /**
   * Keccak256 hash of the payload
   */
  @Column({ type: 'varchar', length: 66, unique: true })
  payloadHash: string;

  /**
   * EIP-712 structured data hash
   */
  @Column({ type: 'varchar', length: 66 })
  structuredDataHash: string;

  /**
   * ECDSA signature (r, s, v components concatenated)
   */
  @Column({ type: 'varchar', length: 132 })
  signature: string;

  /**
   * Expiration timestamp for this payload
   */
  @Column({ type: 'timestamp' })
  expiresAt: Date;

  /**
   * Current status of the submission
   */
  @Column({
    type: 'enum',
    enum: PayloadStatus,
    default: PayloadStatus.PENDING,
  })
  status: PayloadStatus;

  /**
   * Transaction hash when submitted on-chain
   */
  @Column({ type: 'varchar', length: 66, nullable: true })
  transactionHash: string | null;

  /**
   * Block number when confirmed on-chain
   */
  @Column({ type: 'bigint', nullable: true })
  blockNumber: string | null;

  /**
   * Number of submission attempts
   */
  @Column({ type: 'int', default: 0 })
  submissionAttempts: number;

  /**
   * Error message if submission failed
   */
  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  /**
   * Metadata for additional context
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * When the payload was submitted to the blockchain
   */
  @Column({ type: 'timestamp', nullable: true })
  submittedAt: Date | null;

  /**
   * When the payload was confirmed on-chain
   */
  @Column({ type: 'timestamp', nullable: true })
  confirmedAt: Date | null;
}
