import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Referral } from "./referral.entity";

/**
 * Types of referral events
 */
export enum ReferralEventType {
  INVITE_SENT = "invite_sent",
  INVITE_OPENED = "invite_opened",
  REGISTRATION_COMPLETED = "registration_completed",
  FIRST_LOGIN = "first_login",
  MILESTONE_REACHED = "milestone_reached",
  REWARD_EARNED = "reward_earned",
  REWARD_DISTRIBUTED = "reward_distributed",
  NOTIFICATION_SENT = "notification_sent",
}

/**
 * Events tracking the lifecycle of a referral
 */
@Entity("referral_events")
@Index(["referralId"])
@Index(["eventType"])
@Index(["createdAt"])
export class ReferralEvent {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /**
   * Reference to the referral
   */
  @Column({ type: "uuid" })
  @Index()
  referralId: string;

  /**
   * The referral this event belongs to
   */
  @ManyToOne(() => Referral, (referral) => referral.events, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "referralId" })
  referral: Referral;

  /**
   * Type of event
   */
  @Column({
    type: "enum",
    enum: ReferralEventType,
  })
  eventType: ReferralEventType;

  /**
   * Additional data about the event
   */
  @Column({ type: "jsonb", nullable: true })
  data?: Record<string, any>;

  /**
   * When the event occurred
   */
  @CreateDateColumn()
  createdAt: Date;
}
