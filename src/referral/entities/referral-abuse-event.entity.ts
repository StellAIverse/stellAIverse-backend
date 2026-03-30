import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "../../user/entities/user.entity";

@Entity("referral_abuse_events")
export class ReferralAbuseEvent {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid", nullable: true })
  @Index()
  referrerId: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: "referrerId" })
  referrer: User | null;

  @Column({ type: "varchar", length: 45 })
  @Index()
  attemptedIp: string;

  @Column({ type: "varchar", length: 100 })
  @Index()
  attemptedEmail: string;

  @Column({ type: "varchar", length: 255 })
  reason: string;

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  @Index()
  createdAt: Date;
}
