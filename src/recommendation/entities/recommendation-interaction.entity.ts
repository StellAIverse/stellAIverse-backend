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
 * Types of recommendation interactions
 */
export enum InteractionType {
  IMPRESSION = "impression", // Recommendation was shown
  CLICK = "click", // User clicked on recommendation
  DISMISS = "dismiss", // User dismissed recommendation
  CONVERSION = "conversion", // User used the recommended agent
}

/**
 * Tracks user interactions with recommendations for ML training
 */
@Entity("recommendation_interactions")
@Index(["userId", "agentId"])
@Index(["sessionId"])
@Index(["createdAt"])
export class RecommendationInteraction {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /**
   * User who interacted (nullable for anonymous sessions)
   */
  @Column({ type: "uuid", nullable: true })
  @Index()
  userId: string | null;

  /**
   * Reference to the user entity
   */
  @ManyToOne(() => User, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "userId" })
  user?: User;

  /**
   * Agent ID that was recommended
   */
  @Column({ type: "varchar" })
  @Index()
  agentId: string;

  /**
   * Type of interaction
   */
  @Column({
    type: "enum",
    enum: InteractionType,
  })
  interactionType: InteractionType;

  /**
   * Position in the recommendation list (1-based)
   */
  @Column({ type: "int", nullable: true })
  position?: number;

  /**
   * Session ID for tracking anonymous interactions
   */
  @Column({ type: "varchar", nullable: true })
  sessionId?: string;

  /**
   * Context about the recommendation request (capabilities filtered, etc.)
   */
  @Column({ type: "jsonb", nullable: true })
  context?: Record<string, any>;

  /**
   * Time spent viewing (in milliseconds)
   */
  @Column({ type: "bigint", nullable: true })
  viewDurationMs?: number;

  /**
   * When the interaction occurred
   */
  @CreateDateColumn()
  createdAt: Date;
}
