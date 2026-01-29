import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Entity for tracking nonces per address to prevent replay attacks
 * Each address has a monotonically increasing nonce
 */
@Entity('submission_nonces')
@Index(['address'], { unique: true })
export class SubmissionNonce {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Ethereum address (checksummed)
   */
  @Column({ type: 'varchar', length: 42, unique: true })
  address: string;

  /**
   * Current nonce value for this address
   * Increments with each successful submission
   */
  @Column({ type: 'bigint', default: 0 })
  nonce: string;

  /**
   * Last time this nonce was used
   */
  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
