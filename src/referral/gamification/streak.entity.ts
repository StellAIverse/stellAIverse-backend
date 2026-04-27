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

/**
 * Streak type
 */
export enum StreakType {
  DAILY_LOGIN = "daily_login",
  DAILY_TASK = "daily_task",
  WEEKLY_ACTIVE = "weekly_active",
  CUSTOM = "custom",
}

/**
 * User streak tracking entity
 */
@Entity("user_streaks")
@Index(["userId"])
@Index(["streakType"])
@Index(["currentStreak"])
export class UserStreak {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({
    type: "enum",
    enum: StreakType,
  })
  streakType: StreakType;

  @Column({ type: "int", default: 0 })
  currentStreak: number;

  @Column({ type: "int", default: 0 })
  longestStreak: number;

  @Column({ type: "timestamp", nullable: true })
  lastActionDate: Date | null;

  @Column({ type: "timestamp", nullable: true })
  streakStartDate: Date | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "json", nullable: true })
  streakBonuses: Record<string, any>; // Bonuses earned at streak milestones

  @Column({ type: "json", nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
