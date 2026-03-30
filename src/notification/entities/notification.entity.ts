import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "../user/entities/user.entity";

/**
 * Priority levels for notifications
 */
export enum NotificationPriority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  URGENT = "urgent",
}

/**
 * Notification channel types
 */
export enum NotificationChannel {
  IN_APP = "in_app",
  EMAIL = "email",
  BOTH = "both",
}

/**
 * In-app notification entity
 */
@Entity("notifications")
@Index(["userId"])
@Index(["type"])
@Index(["isRead"])
@Index(["createdAt"])
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /**
   * User who receives the notification
   */
  @Column({ type: "uuid" })
  @Index()
  userId: string;

  /**
   * Reference to the user entity
   */
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  /**
   * Type/category of notification
   */
  @Column({ type: "varchar" })
  @Index()
  type: string;

  /**
   * Notification title
   */
  @Column({ type: "varchar" })
  title: string;

  /**
   * Notification message body
   */
  @Column({ type: "text" })
  message: string;

  /**
   * Optional data/context for the notification
   */
  @Column({ type: "jsonb", nullable: true })
  data?: Record<string, any>;

  /**
   * Whether the notification has been read
   */
  @Column({ default: false })
  @Index()
  isRead: boolean;

  /**
   * When the notification was read (null if not read)
   */
  @Column({ type: "timestamp", nullable: true })
  readAt?: Date;

  /**
   * Priority level
   */
  @Column({
    type: "enum",
    enum: NotificationPriority,
    default: NotificationPriority.MEDIUM,
  })
  priority: NotificationPriority;

  /**
   * Channel through which notification was sent
   */
  @Column({
    type: "enum",
    enum: NotificationChannel,
    default: NotificationChannel.IN_APP,
  })
  channel: NotificationChannel;

  /**
   * Optional action URL/link
   */
  @Column({ type: "varchar", nullable: true })
  actionUrl?: string;

  /**
   * Creation timestamp
   */
  @CreateDateColumn()
  createdAt: Date;
}
