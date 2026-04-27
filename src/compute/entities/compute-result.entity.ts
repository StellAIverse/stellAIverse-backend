import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("compute_results")
@Index(["hash"], { unique: true })
export class ComputeResult {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "text" })
  originalResult: string;

  @Column({ type: "text", nullable: true })
  normalizedResult: string | null;

  @Column({ type: "varchar", length: 66 })
  hash: string;

  @Column({ type: "jsonb", nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
