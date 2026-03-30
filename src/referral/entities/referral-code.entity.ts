import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "../../user/entities/user.entity";

@Entity("referral_codes")
export class ReferralCode {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  @Index()
  code: string;

  @Column({ type: "uuid" })
  @Index()
  userId: string;

  @OneToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
