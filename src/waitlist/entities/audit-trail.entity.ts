import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum AuditEventType {
  PREDICTION_MADE = 'prediction_made',
  EXPLANATION_GENERATED = 'explanation_generated',
  MODEL_UPDATED = 'model_updated',
  APPEAL_FILED = 'appeal_filed',
  APPEAL_REVIEWED = 'appeal_reviewed',
  BIAS_DETECTED = 'bias_detected',
  CONFIGURATION_CHANGED = 'configuration_changed',
  DRIFT_DETECTED = 'drift_detected',
}

export enum AuditSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

@Entity('ai_audit_trail')
@Index(['userId', 'waitlistId'])
@Index(['eventType'])
@Index(['severity'])
export class AiAuditTrail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'waitlist_id' })
  waitlistId: string;

  @Column({
    type: 'enum',
    enum: AuditEventType,
    name: 'event_type'
  })
  eventType: AuditEventType;

  @Column({
    type: 'enum',
    enum: AuditSeverity,
    name: 'severity'
  })
  severity: AuditSeverity;

  @Column({ type: 'text', name: 'description' })
  description: string;

  @Column({ type: 'jsonb', name: 'event_data' })
  eventData: Record<string, any>;

  @Column({ type: 'jsonb', name: 'model_snapshot' })
  modelSnapshot: {
    version: string;
    weights: Record<string, number>;
    metrics: Record<string, number>;
  };

  @Column({ type: 'jsonb', name: 'feature_snapshot' })
  featureSnapshot: Record<string, any>;

  @Column({ type: 'jsonb', name: 'system_state' })
  systemState: {
    timestamp: Date;
    performance: Record<string, number>;
    configuration: Record<string, any>;
  };

  @Column({ name: 'ip_address', type: 'varchar', nullable: true })
  ipAddress: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string;

  @Column({ name: 'performed_by', type: 'varchar', nullable: true })
  performedBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
