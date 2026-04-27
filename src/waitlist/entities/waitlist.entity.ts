import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from "typeorm";
import { WaitlistEntry } from "./waitlist-entry.entity";

export enum WaitlistType {
  GENERAL = "general",
  BETA = "beta",
  PREMIUM = "premium",
}

export enum WaitlistStatus {
  ACTIVE = "active",
  PAUSED = "paused",
  CLOSED = "closed",
}

@Entity("waitlists")
@Index(["type"])
@Index(["status"])
export class Waitlist {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 150 })
  name: string;

  @Column({ type: "enum", enum: WaitlistType })
  type: WaitlistType;

  @Column({ type: "enum", enum: WaitlistStatus, default: WaitlistStatus.ACTIVE })
  status: WaitlistStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => WaitlistEntry, (entry) => entry.waitlist)
  entries: WaitlistEntry[];
}
