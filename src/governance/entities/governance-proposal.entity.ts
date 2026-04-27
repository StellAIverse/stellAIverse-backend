import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ProposalStatus {
  PENDING = 'PENDING',
  READY = 'READY',
  EXECUTED = 'EXECUTED',
  CANCELLED = 'CANCELLED',
}

@Entity('governance_proposals')
@Index(['status', 'executeAfter'])
export class GovernanceProposal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Human-readable title for the parameter change */
  @Column()
  title: string;

  /** The config key being updated */
  @Column({ name: 'target_key' })
  targetKey: string;

  /** New value to set after the timelock elapses */
  @Column({ name: 'proposed_value', type: 'text' })
  proposedValue: string;

  /** Who queued this proposal */
  @Column({ name: 'proposed_by' })
  proposedBy: string;

  /** Earliest timestamp at which this proposal may be executed */
  @Column({ name: 'execute_after', type: 'bigint' })
  executeAfter: number;  // Unix ms

  /** Minimum timelock delay in ms (default 24 h) */
  @Column({ name: 'delay_ms', type: 'bigint', default: 86_400_000 })
  delayMs: number;

  @Column({ type: 'enum', enum: ProposalStatus, default: ProposalStatus.PENDING })
  status: ProposalStatus;

  @Column({ name: 'executed_at', type: 'bigint', nullable: true })
  executedAt: number | null;

  @Column({ name: 'cancelled_reason', type: 'text', nullable: true })
  cancelledReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
