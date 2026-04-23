import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

export enum PolicyScope {
  GLOBAL = "GLOBAL",
  GROUP = "GROUP",
  USER = "USER",
  AGENT = "AGENT",
  ENDPOINT = "ENDPOINT",
}

export enum PolicyStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  DRAFT = "DRAFT",
}

export enum RateLimitAlgorithmType {
  TOKEN_BUCKET = "TOKEN_BUCKET",
  LEAKY_BUCKET = "LEAKY_BUCKET",
  SLIDING_WINDOW = "SLIDING_WINDOW",
  FIXED_WINDOW = "FIXED_WINDOW",
}

@Entity("quota_policies")
@Index(["scope", "targetId"])
@Index(["priority"])
export class QuotaPolicy {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 100 })
  name: string;

  @Column({ type: "enum", enum: PolicyScope })
  scope: PolicyScope;

  @Column({ type: "varchar", nullable: true })
  targetId?: string; // e.g. userId, groupId, agentId, endpoint path

  @Column({ type: "integer" })
  limit: number;

  @Column({ type: "integer" })
  windowMs: number;

  @Column({ type: "integer", default: 0 })
  burst: number;

  @Column({ type: "integer", default: 100 })
  priority: number; // Higher number = higher priority

  @Column({
    type: "enum",
    enum: RateLimitAlgorithmType,
    default: RateLimitAlgorithmType.TOKEN_BUCKET,
  })
  algorithm: RateLimitAlgorithmType;

  @Column({ type: "enum", enum: PolicyStatus, default: PolicyStatus.ACTIVE })
  status: PolicyStatus;

  // Time-based variations: peak hours, days of week, etc.
  @Column({ type: "jsonb", nullable: true })
  timeWindow?: {
    startHour?: number; // 0-23
    endHour?: number;   // 0-23
    daysOfWeek?: number[]; // 0-6 (Sunday-Saturday)
    timezone?: string;
  };

  // User segmentation: attributes like 'tier', 'region', etc.
  @Column({ type: "jsonb", nullable: true })
  targeting?: {
    userSegments?: string[];
    userTiers?: string[];
    regions?: string[];
  };

  @Column({ type: "jsonb", nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: "integer", default: 1 })
  version: number;
}
