import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

export enum WalletStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  REVOKED = 'revoked',
  UNLINKED = 'unlinked',
}

export enum WalletType {
  PRIMARY = 'primary',
  SECONDARY = 'secondary',
  DELEGATED = 'delegated',
  HARDWARE = 'hardware',
}

/**
 * Entity for managing multiple wallets per user account
 * Supports multi-wallet linking, delegation, and recovery
 */
@Entity('wallets')
@Index(['address'])
@Index(['userId', 'status'])
@Index(['userId', 'type'])
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Wallet address (Ethereum format)
   */
  @Column({ type: 'varchar', length: 42, unique: true })
  @Index()
  address: string;

  /**
   * User ID who owns this wallet
   */
  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  /**
   * Reference to the user entity
   */
  @ManyToOne(() => User, (user) => user.wallets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /**
   * Wallet type (primary, secondary, delegated, hardware)
   */
  @Column({
    type: 'enum',
    enum: WalletType,
    default: WalletType.SECONDARY,
  })
  type: WalletType;

  /**
   * Wallet status
   */
  @Column({
    type: 'enum',
    enum: WalletStatus,
    default: WalletStatus.PENDING,
  })
  status: WalletStatus;

  /**
   * Whether this wallet is the primary wallet for the account
   */
  @Column({ default: false })
  isPrimary: boolean;

  /**
   * Wallet name/label (user-defined)
   */
  @Column({ type: 'varchar', length: 100, nullable: true })
  name: string | null;

  /**
   * Signature used to verify wallet ownership during linking
   */
  @Column({ type: 'text', nullable: true })
  verificationSignature: string | null;

  /**
   * Challenge message used for verification
   */
  @Column({ type: 'text', nullable: true })
  verificationChallenge: string | null;

  /**
   * When the wallet was verified/linked
   */
  @Column({ type: 'timestamp', nullable: true })
  verifiedAt: Date | null;

  /**
   * IP address when wallet was linked
   */
  @Column({ type: 'varchar', length: 45, nullable: true })
  linkedIp: string | null;

  /**
   * User agent when wallet was linked
   */
  @Column({ type: 'text', nullable: true })
  linkedUserAgent: string | null;

  /**
   * For delegated wallets: the delegator wallet ID
   */
  @Column({ type: 'uuid', nullable: true })
  delegatedById: string | null;

  /**
   * For delegated wallets: expiration timestamp
   */
  @Column({ type: 'timestamp', nullable: true })
  delegationExpiresAt: Date | null;

  /**
   * For delegated wallets: permissions granted
   */
  @Column({ type: 'jsonb', nullable: true })
  delegationPermissions: string[] | null;

  /**
   * Last used timestamp
   */
  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  /**
   * Recovery code hash (for session recovery)
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  recoveryCodeHash: string | null;

  /**
   * Whether recovery is enabled for this wallet
   */
  @Column({ default: false })
  recoveryEnabled: boolean;

  /**
   * Nonce for replay attack prevention
   */
  @Column({ type: 'bigint', default: 0 })
  nonce: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
