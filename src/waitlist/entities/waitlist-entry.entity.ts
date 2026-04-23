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
import { IsEnum, IsNumber, IsOptional, IsUUID, IsBoolean, IsDate, IsInt } from "class-validator";
import { Waitlist } from "./waitlist.entity";
import { User } from "../../user/entities/user.entity";
import { Referral } from "../../referral/entities/referral.entity";

export enum WaitlistEntryStatus {
  ACTIVE = "active",
  REMOVED = "removed",
  PROMOTED = "promoted",
  EXPIRED = "expired",
}

/**
 * Represents a user's position on a waitlist
 */
@Entity("waitlist_entries")
@Index(["waitlistId", "position"])
@Index(["userId"])
@Index(["status"])
export class WaitlistEntry {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  @Index()
  waitlistId: string;

  @ManyToOne(() => Waitlist, (w) => w.entries, { onDelete: "CASCADE" })
  @JoinColumn({ name: "waitlistId" })
  waitlist: Waitlist;

  @Column({ type: "uuid" })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ type: "uuid", nullable: true })
  @Index()
  @IsOptional()
  @IsUUID()
  referralId?: string | null;

  @ManyToOne(() => Referral, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "referralId" })
  referral?: Referral | null;

  @Column({ type: "bigint", nullable: false })
  @IsInt()
  position: string; // bigints are returned as string to avoid precision loss

  @Column({ type: "double precision", default: 0 })
  @IsNumber()
  priorityScore: number;

  @Column({ type: "timestamp", default: "NOW()" })
  @IsDate()
  joinedAt: Date;

  @Column({ type: "enum", enum: WaitlistEntryStatus, default: WaitlistEntryStatus.ACTIVE })
  @IsEnum(WaitlistEntryStatus)
  status: WaitlistEntryStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Soft-delete flag to allow historical analysis without removing audit trails
  @Column({ type: "boolean", default: false })
  @IsBoolean()
  isDeleted: boolean;

  // Events for this entry will be stored in waitlist_events table
}
