import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "../../user/entities/user.entity";

@Entity("refresh_tokens")
export class RefreshToken {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  @Index()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ unique: true })
  token: string;

  @Column({ type: "timestamp" })
  expiresAt: Date;

  @Column({ default: false })
  revoked: boolean;

  @Column({ nullable: true })
  revokedAt: Date;

  @Column({ nullable: true })
  replacedByToken: string;

  @Column()
  ipAddress: string;

  @Column({ nullable: true })
  userAgent: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export enum TwoFactorType {
  TOTP = "totp",
  SMS = "sms",
  EMAIL = "email",
}

export enum TwoFactorStatus {
  PENDING = "pending",
  VERIFIED = "verified",
  DISABLED = "disabled",
}

@Entity("two_factor_auth")
export class TwoFactorAuth {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  @Index()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ type: "varchar", default: TwoFactorType.TOTP })
  type: TwoFactorType;

  @Column({ type: "varchar", default: TwoFactorStatus.PENDING })
  status: TwoFactorStatus;

  @Column({ nullable: true })
  secret: string;

  @Column({ nullable: true })
  backupCodes: string; // JSON array of backup codes

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ default: false })
  isEnabled: boolean;

  @Column({ type: "timestamp", nullable: true })
  verifiedAt: Date;

  @Column({ type: "timestamp", nullable: true })
  lastUsedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}</content>
<parameter name="filePath">/workspaces/stellAIverse-backend/src/auth/entities/auth.entity.ts