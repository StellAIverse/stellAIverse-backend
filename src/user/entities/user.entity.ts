import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from "typeorm";
import { ProvenanceRecord } from "../../audit/entities/provenance-record.entity";

export enum UserRole {
  USER = "user",
  OPERATOR = "operator",
  ADMIN = "admin",
}

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true, nullable: true })
  @Index()
  username: string | null;

  @Column({ unique: true, nullable: false })
  @Index()
  walletAddress: string;

  @Column({ unique: true, nullable: true })
  @Index()
  email: string | null;

  @Column({ nullable: true })
  password: string | null;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({
    type: "varchar",
    default: UserRole.USER,
  })
  role: UserRole;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Provenance records associated with this user
   */
  @OneToMany(() => ProvenanceRecord, (provenance) => provenance.user)
  provenanceRecords: ProvenanceRecord[];
}
