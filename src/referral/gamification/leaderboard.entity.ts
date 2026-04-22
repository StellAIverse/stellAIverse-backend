import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

/**
 * Leaderboard time period
 */
export enum LeaderboardPeriod {
  DAILY = "daily",
  WEEKLY = "weekly",
  MONTHLY = "monthly",
  ALL_TIME = "all_time",
  SEASONAL = "seasonal",
}

/**
 * Leaderboard category
 */
export enum LeaderboardCategory {
  POINTS = "points",
  BADGES = "badges",
  REFERRALS = "referrals",
  ENGAGEMENT = "engagement",
  TRADING = "trading",
  CUSTOM = "custom",
}

/**
 * Leaderboard entry entity
 */
@Entity("leaderboard_entries")
@Index(["userId"])
@Index(["category"])
@Index(["period"])
@Index(["rank"])
@Index(["periodStart", "periodEnd"])
export class LeaderboardEntry {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  @Index()
  userId: string;

  @Column({ type: "varchar" })
  username: string;

  @Column({ type: "varchar", nullable: true })
  avatar: string;

  @Column({
    type: "enum",
    enum: LeaderboardCategory,
  })
  category: LeaderboardCategory;

  @Column({
    type: "enum",
    enum: LeaderboardPeriod,
    default: LeaderboardPeriod.ALL_TIME,
  })
  period: LeaderboardPeriod;

  @Column({ type: "int" })
  rank: number;

  @Column({ type: "decimal", precision: 20, scale: 8, default: 0 })
  score: number;

  @Column({ type: "timestamp" })
  periodStart: Date;

  @Column({ type: "timestamp", nullable: true })
  periodEnd: Date | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "json", nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
