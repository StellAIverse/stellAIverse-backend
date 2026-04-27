import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { WaitlistEntry } from "./waitlist-entry.entity";

export enum WaitlistEventType {
  JOINED = "joined",
  POSITION_CHANGED = "position_changed",
  PROMOTED = "promoted",
  REMOVED = "removed",
  PRIORITY_UPDATED = "priority_updated",
}

@Entity("waitlist_events")
@Index(["entryId"])
@Index(["eventType"])
@Index(["createdAt"])
export class WaitlistEvent {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  @Index()
  entryId: string;

  @ManyToOne(() => WaitlistEntry, { onDelete: "CASCADE" })
  @JoinColumn({ name: "entryId" })
  entry: WaitlistEntry;

  @Column({ type: "enum", enum: WaitlistEventType })
  eventType: WaitlistEventType;

  // JSON blobs storing previous and new values (immutable)
  @Column({ type: "jsonb", nullable: true })
  oldValue?: Record<string, any> | null;

  @Column({ type: "jsonb", nullable: true })
  newValue?: Record<string, any> | null;

  @Column({ type: "jsonb", nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;
}
