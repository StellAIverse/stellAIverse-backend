import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from "typeorm";
import { User } from "../../user/entities/user.entity";

/**
 * Badge rarity levels
 */
export enum BadgeRarity {
  COMMON = "common",
  UNCOMMON = "uncommon",
  RARE = "rare",
  EPIC = "epic",
  LEGENDARY = "legendary",
}

/**
 * Badge category
 */
export enum BadgeCategory {
  ACHIEVEMENT = "achievement",
  MILESTONE = "milestone",
  SKILL = "skill",
  SOCIAL = "social",
  SEASONAL = "seasonal",
  SPECIAL = "special",
}

/**
 * Badge entity representing achievable awards
 */
@Entity("badges")
@Index(["category"])
@Index(["rarity"])
@Index(["isActive"])
export class Badge {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", unique: true })
  name: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ type: "varchar", nullable: true })
  icon: string; // URL or icon identifier

  @Column({
    type: "enum",
    enum: BadgeCategory,
    default: BadgeCategory.ACHIEVEMENT,
  })
  category: BadgeCategory;

  @Column({
    type: "enum",
    enum: BadgeRarity,
    default: BadgeRarity.COMMON,
  })
  rarity: BadgeRarity;

  @Column({ type: "json" })
  unlockConditions: Record<string, any>; // Conditions to unlock this badge

  @Column({ type: "int", default: 0 })
  points: number; // Points awarded for earning this badge

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "int", default: 0 })
  unlockCount: number; // How many users have unlocked this badge

  @Column({ type: "json", nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => UserBadge, (userBadge) => userBadge.badge)
  userBadges: UserBadge[];
}

/**
 * UserBadge entity tracking which users have earned which badges
 */
@Entity("user_badges")
@Index(["userId"])
@Index(["badgeId"])
@Index(["unlockedAt"])
export class UserBadge {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ type: "uuid" })
  @Index()
  badgeId: string;

  @ManyToOne(() => Badge, { onDelete: "CASCADE" })
  @JoinColumn({ name: "badgeId" })
  badge: Badge;

  @Column({ type: "boolean", default: false })
  isUnlocked: boolean;

  @Column({ type: "timestamp", nullable: true })
  unlockedAt: Date | null;

  @Column({ type: "json", nullable: true })
  unlockData: Record<string, any>; // Data about how the badge was unlocked

  @CreateDateColumn()
  createdAt: Date;
}
