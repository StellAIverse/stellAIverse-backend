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
import { User } from "../user/entities/user.entity";

/**
 * User notification preferences
 * Controls which notifications users receive and through which channels
 */
@Entity("notification_preferences")
@Index(["userId"], { unique: true })
export class NotificationPreferences {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /**
   * User who owns these preferences
   */
  @Column({ type: "uuid", unique: true })
  @Index()
  userId: string;

  /**
   * Reference to the user entity
   */
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  /**
   * Enable/disable email notifications globally
   */
  @Column({ default: true })
  emailEnabled: boolean;

  /**
   * Enable/disable in-app notifications globally
   */
  @Column({ default: true })
  inAppEnabled: boolean;

  /**
   * Specific notification types the user wants to receive via email
   * If empty, all enabled notification types are allowed
   */
  @Column({ type: "varchar", array: true, default: () => "'{}'" })
  emailNotificationTypes: string[];

  /**
   * Specific notification types the user wants to receive in-app
   * If empty, all enabled notification types are allowed
   */
  @Column({ type: "varchar", array: true, default: () => "'{}'" })
  inAppNotificationTypes: string[];

  /**
   * Referral-specific preferences
   */
  @Column({ default: true })
  referralNotificationsEnabled: boolean;

  /**
   * Marketing/promotional notifications
   */
  @Column({ default: false })
  marketingNotificationsEnabled: boolean;

  /**
   * System maintenance notifications
   */
  @Column({ default: true })
  systemNotificationsEnabled: boolean;

  /**
   * Creation timestamp
   */
  @CreateDateColumn()
  createdAt: Date;

  /**
   * Last update timestamp
   */
  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Check if a specific notification type is allowed for email
   */
  isEmailAllowed(notificationType: string): boolean {
    if (!this.emailEnabled) return false;

    // If no specific types configured, allow all
    if (this.emailNotificationTypes.length === 0) {
      return (
        this.referralNotificationsEnabled ||
        notificationType.startsWith("system")
      );
    }

    return this.emailNotificationTypes.includes(notificationType);
  }

  /**
   * Check if a specific notification type is allowed for in-app
   */
  isInAppAllowed(notificationType: string): boolean {
    if (!this.inAppEnabled) return false;

    // If no specific types configured, allow all
    if (this.inAppNotificationTypes.length === 0) {
      return true;
    }

    return this.inAppNotificationTypes.includes(notificationType);
  }
}
