import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from "typeorm";
import { User } from "../../user/entities/user.entity";

export enum KycStatus {
  UNVERIFIED = "unverified",
  PENDING = "pending",
  IN_REVIEW = "in_review",
  VERIFIED = "verified",
  REJECTED = "rejected",
}

export enum DocumentType {
  PASSPORT = "passport",
  DRIVERS_LICENSE = "drivers_license",
  NATIONAL_ID = "national_id",
  UTILITY_BILL = "utility_bill",
  BANK_STATEMENT = "bank_statement",
  SELFIE = "selfie",
}

@Entity("kyc_profiles")
export class KycProfile {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  @Index()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ type: "varchar", default: KycStatus.UNVERIFIED })
  status: KycStatus;

  @Column({ nullable: true })
  fullName: string;

  @Column({ nullable: true })
  dateOfBirth: Date;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  postalCode: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  occupation: string;

  @Column({ nullable: true })
  sourceOfFunds: string;

  @Column({ type: "decimal", precision: 15, scale: 2, nullable: true })
  annualIncome: number;

  @Column({ nullable: true })
  taxId: string;

  @Column({ nullable: true })
  nationality: string;

  @Column({ type: "text", nullable: true })
  notes: string;

  @Column({ nullable: true })
  reviewedBy: string;

  @Column({ type: "timestamp", nullable: true })
  reviewedAt: Date;

  @Column({ type: "timestamp", nullable: true })
  submittedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => KycDocument, (document) => document.kycProfile)
  documents: KycDocument[];
}

@Entity("kyc_documents")
export class KycDocument {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  @Index()
  kycProfileId: string;

  @ManyToOne(() => KycProfile, { onDelete: "CASCADE" })
  @JoinColumn({ name: "kycProfileId" })
  kycProfile: KycProfile;

  @Column({ type: "varchar" })
  documentType: DocumentType;

  @Column()
  fileName: string;

  @Column()
  originalFileName: string;

  @Column()
  mimeType: string;

  @Column({ type: "bigint" })
  fileSize: number;

  @Column({ type: "text" })
  encryptedFilePath: string;

  @Column({ type: "text", nullable: true })
  encryptionKey: string;

  @Column({ type: "text", nullable: true })
  encryptionIv: string;

  @Column({ default: false })
  verified: boolean;

  @Column({ nullable: true })
  verifiedBy: string;

  @Column({ type: "timestamp", nullable: true })
  verifiedAt: Date;

  @Column({ type: "text", nullable: true })
  verificationNotes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity("kyc_status_history")
export class KycStatusHistory {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  @Index()
  kycProfileId: string;

  @ManyToOne(() => KycProfile, { onDelete: "CASCADE" })
  @JoinColumn({ name: "kycProfileId" })
  kycProfile: KycProfile;

  @Column({ type: "varchar" })
  previousStatus: KycStatus;

  @Column({ type: "varchar" })
  newStatus: KycStatus;

  @Column({ nullable: true })
  changedBy: string;

  @Column({ type: "text", nullable: true })
  reason: string;

  @Column({ type: "text", nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;
}</content>
<parameter name="filePath">/workspaces/stellAIverse-backend/src/compliance/entities/kyc.entity.ts