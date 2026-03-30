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

export enum AgentEventType {
  CREATED = "created",
  UPDATED = "updated",
  DELETED = "deleted",
  EXECUTED = "executed",
  FAILED = "failed",
  PAUSED = "paused",
  RESUMED = "resumed",
}

/**
 * Entity for tracking all agent-related events for audit purposes
 * Provides comprehensive audit trail for agent operations
 */
@Entity("agent_events")
@Index(["agentId", "eventType"])
@Index(["agentId", "createdAt"])
@Index(["eventType", "createdAt"])
@Index(["userId", "createdAt"])
export class AgentEvent {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /**
   * ID of the agent this event is related to
   */
  @Column({ type: "varchar", length: 36 })
  @Index()
  agentId: string;

  /**
   * Type of event that occurred
   */
  @Column({
    type: "enum",
    enum: AgentEventType,
  })
  @Index()
  eventType: AgentEventType;

  /**
   * Detailed data about the event
   */
  @Column({ type: "jsonb" })
  eventData: Record<string, any>;

  /**
   * Additional metadata for the event
   */
  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any> | null;

  /**
   * ID of the user who triggered the event (if applicable)
   */
  @Column({ type: "uuid", nullable: true })
  @Index()
  userId: string | null;

  /**
   * Reference to the user entity
   */
  @ManyToOne(() => User, { onDelete: "SET NULL" })
  @JoinColumn({ name: "userId" })
  user: User | null;

  /**
   * IP address of the client that triggered the event
   */
  @Column({ type: "varchar", length: 45, nullable: true })
  clientIp: string | null;

  /**
   * User agent string of the client
   */
  @Column({ type: "text", nullable: true })
  userAgent: string | null;

  @CreateDateColumn()
  @Index()
  createdAt: Date;
}
