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
 * Unlock type
 */
export enum UnlockType {
  FEATURE = "feature",
  CONTENT = "content",
  REWARD = "reward",
  ACCESS = "access",
}

/**
 * Progressive unlock entity
 * Tracks feature unlocks based on achievement milestones
 */
@Entity("progressive_unlocks")
@Index(["userId"])
@Index(["unlockType"])
@Index(["isUnlocked"])
export class ProgressiveUnlock {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ type: "varchar" })
  unlockKey: string; // Unique identifier for what is being unlocked

  @Column({ type: "varchar" })
  unlockName: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({
    type: "enum",
    enum: UnlockType,
  })
  unlockType: UnlockType;

  @Column({ type: "json" })
  unlockConditions: Record<string, any>; // Conditions required to unlock

  @Column({ type: "boolean", default: false })
  isUnlocked: boolean;

  @Column({ type: "timestamp", nullable: true })
  unlockedAt: Date | null;

  @Column({ type: "int", default: 0 })
  progress: number; // Current progress towards unlock (0-100)

  @Column({ type: "json", nullable: true })
  unlockRewards: Record<string, any>; // Rewards granted upon unlock

  @Column({ type: "json", nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
