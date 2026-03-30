import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "../../user/entities/user.entity";

/**
 * Types of feedback that can be provided
 */
export enum FeedbackType {
  EXPLICIT_RATING = "explicit_rating",
  CLICK = "click",
  DISMISS = "dismiss",
  USAGE = "usage",
}

/**
 * User feedback on agent recommendations
 * Supports both explicit (ratings) and implicit (clicks, usage) feedback
 */
@Entity("recommendation_feedback")
@Index(["userId", "agentId"])
@Index(["createdAt"])
export class RecommendationFeedback {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /**
   * User who provided the feedback
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
   * Agent ID that was recommended
   */
  @Column({ type: "varchar" })
  @Index()
  agentId: string;

  /**
   * Type of feedback (explicit rating, click, dismiss, usage)
   */
  @Column({
    type: "enum",
    enum: FeedbackType,
  })
  feedbackType: FeedbackType;

  /**
   * Rating value (1-5 for explicit ratings, 1 for clicks/usage, 0 for dismiss)
   */
  @Column({ type: "int", nullable: true })
  rating?: number;

  /**
   * Additional context or metadata about the feedback
   */
  @Column({ type: "jsonb", nullable: true })
  metadata?: Record<string, any>;

  /**
   * Session ID for tracking anonymous interactions
   */
  @Column({ type: "varchar", nullable: true })
  sessionId?: string;

  /**
   * When the feedback was created
   */
  @CreateDateColumn()
  createdAt: Date;
}
