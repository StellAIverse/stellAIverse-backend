import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("agent_events")
@Index(["agentId"])
export class AgentEvent {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 42 })
  agentId: string;

  @Column({ type: "varchar", length: 128 })
  eventType: string;

  @Column({ type: "jsonb", nullable: true })
  payload: any;

  @Column({ type: "varchar", length: 66, nullable: true })
  txHash: string | null;

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;
}
