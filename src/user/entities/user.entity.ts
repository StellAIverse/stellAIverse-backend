import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { ProvenanceRecord } from "../../audit/entities/provenance-record.entity";
import { Wallet } from "../../auth/entities/wallet.entity";

export enum UserRole {
  USER = "user",
  OPERATOR = "operator",
  ADMIN = "admin",
  GOVERNANCE_OPERATOR = "governance_operator",
  KYC_OPERATOR = "kyc_operator",
}

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true, nullable: true })
  @Index()
  username: string | null;

  @Column({ unique: true, nullable: false })
  @Index()
  walletAddress: string;

  @Column({ unique: true, nullable: true })
  @Index()
  email: string | null;

  @Column({ nullable: true })
  password: string | null;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({
    type: "varchar",
    default: UserRole.USER,
  })
  role: UserRole;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Provenance records associated with this user
   */
  @OneToMany(() => ProvenanceRecord, (provenance) => provenance.user)
  provenanceRecords: ProvenanceRecord[];

  /**
   * Wallets linked to this user account
   */
  @OneToMany(() => Wallet, (wallet) => wallet.user)
  wallets: Wallet[];

  @Column({ unique: true, nullable: true })
  @Index()
  referralCode: string | null;

  @Column({ nullable: true })
  referredById: string | null;

  @ManyToOne(() => User, (user) => user.referrals)
  @JoinColumn({ name: "referredById" })
  referredBy: User | null;

  @OneToMany(() => User, (user) => user.referredBy)
  referrals: User[];
}
