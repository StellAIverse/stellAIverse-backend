import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne } from 'typeorm';
import { WaitlistEntry } from './waitlist-entry.entity';

export enum ExplanationType {
  FEATURE_IMPORTANCE = 'feature_importance',
  DECISION_EXPLANATION = 'decision_explanation',
  COUNTERFACTUAL = 'counterfactual',
  SCENARIO_ANALYSIS = 'scenario_analysis',
}

export enum ExplanationMethod {
  SHAP = 'shap',
  LIME = 'lime',
  PERMUTATION = 'permutation',
  GRADIENT = 'gradient',
}

@Entity('waitlist_explanations')
@Index(['userId', 'waitlistId'])
@Index(['explanationType'])
export class WaitlistExplanation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'waitlist_id' })
  waitlistId: string;

  @Column({
    type: 'enum',
    enum: ExplanationType,
    name: 'explanation_type'
  })
  explanationType: ExplanationType;

  @Column({
    type: 'enum',
    enum: ExplanationMethod,
    name: 'explanation_method'
  })
  explanationMethod: ExplanationMethod;

  @Column({ type: 'jsonb', name: 'feature_importance' })
  featureImportance: Record<string, number>;

  @Column({ type: 'jsonb', name: 'explanation_data' })
  explanationData: Record<string, any>;

  @Column({ type: 'text', name: 'natural_language_explanation' })
  naturalLanguageExplanation: string;

  @Column({ type: 'decimal', precision: 5, scale: 4, name: 'confidence_score' })
  confidenceScore: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, name: 'uncertainty_quantification' })
  uncertaintyQuantification: number;

  @Column({ type: 'jsonb', name: 'alternative_scenarios' })
  alternativeScenarios: Record<string, any>;

  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'prediction_score' })
  predictionScore: number;

  @Column({ type: 'jsonb', name: 'model_metadata' })
  modelMetadata: {
    version: string;
    trainedAt: Date;
    weights: Record<string, number>;
  };

  @Column({ name: 'is_appealed', default: false })
  isAppealed: boolean;

  @Column({ name: 'appeal_reason', type: 'text', nullable: true })
  appealReason: string;

  @Column({ name: 'appeal_status', type: 'varchar', nullable: true })
  appealStatus: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => WaitlistEntry, entry => entry.id)
  entry: WaitlistEntry;
}
