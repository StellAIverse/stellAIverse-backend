import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { ModelTrainingService } from './model-training.service';
import { FeatureEngineeringService } from './feature-engineering.service';
import { InferencePipelineService } from './inference-pipeline.service';
import { ExplainableAIService } from './explainable-ai.service';
import { WaitlistEntry } from './entities/waitlist-entry.entity';
import { WaitlistEvent, WaitlistEventType } from './entities/waitlist-event.entity';
import { WaitlistExplanation } from './entities/explanation.entity';
import { AiAuditTrail, AuditEventType, AuditSeverity } from './entities/audit-trail.entity';

export interface LearningConfig {
  enableOnlineLearning: boolean;
  learningRate: number;
  batchSize: number;
  maxEpochs: number;
  driftThreshold: number;
  performanceThreshold: number;
  retrainingInterval: string; // cron expression
}

export interface PerformanceMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  mse: number;
  mae: number;
  timestamp: Date;
}

export interface DriftDetectionResult {
  isDriftDetected: boolean;
  driftType: 'data_drift' | 'concept_drift' | 'performance_drift';
  driftScore: number;
  affectedFeatures: string[];
  recommendations: string[];
}

export interface ExperimentResult {
  experimentId: string;
  modelVersion: string;
  metrics: PerformanceMetrics;
  trafficAllocation: number;
  statisticalSignificance: number;
  winner: boolean;
}

@Injectable()
export class ContinuousLearningService {
  private readonly logger = new Logger(ContinuousLearningService.name);
  
  private readonly config: LearningConfig = {
    enableOnlineLearning: true,
    learningRate: 0.01,
    batchSize: 32,
    maxEpochs: 50,
    driftThreshold: 0.15,
    performanceThreshold: 0.8,
    retrainingInterval: '0 2 * * *', // Daily at 2 AM
  };

  private performanceHistory: PerformanceMetrics[] = [];
  private activeExperiments: Map<string, ExperimentResult> = new Map();
  private lastDriftCheck: Date = new Date();

  constructor(
    @InjectRepository(WaitlistEntry)
    private readonly entryRepo: Repository<WaitlistEntry>,
    @InjectRepository(WaitlistEvent)
    private readonly eventRepo: Repository<WaitlistEvent>,
    @InjectRepository(WaitlistExplanation)
    private readonly explanationRepo: Repository<WaitlistExplanation>,
    @InjectRepository(AiAuditTrail)
    private readonly auditRepo: Repository<AiAuditTrail>,
    private readonly modelService: ModelTrainingService,
    private readonly featureService: FeatureEngineeringService,
    private readonly inferenceService: InferencePipelineService,
    private readonly explainableService: ExplainableAIService,
  ) {}

  /**
   * Main scheduled retraining job
   */
  @Cron(this.config.retrainingInterval)
  async scheduledRetraining(): Promise<void> {
    if (!this.config.enableOnlineLearning) {
      this.logger.log('Online learning is disabled');
      return;
    }

    this.logger.log('Starting scheduled model retraining');
    
    try {
      // Check for drift before retraining
      const driftResult = await this.detectDrift();
      
      if (driftResult.isDriftDetected) {
        this.logger.warn(`Drift detected: ${driftResult.driftType}, score: ${driftResult.driftScore}`);
        await this.handleDrift(driftResult);
      }

      // Collect feedback and retrain
      const feedbackData = await this.collectFeedbackData();
      if (feedbackData.length >= this.config.batchSize) {
        await this.performIncrementalLearning(feedbackData);
      }

      // Evaluate model performance
      const metrics = await this.evaluateModelPerformance();
      await this.logPerformanceMetrics(metrics);

      // Check if model meets performance threshold
      if (metrics.accuracy < this.config.performanceThreshold) {
        await this.triggerFullRetraining();
      }

      this.logger.log('Scheduled retraining completed successfully');
    } catch (error) {
      this.logger.error(`Scheduled retraining failed: ${error.message}`);
      await this.logAuditEvent(
        'system',
        'all',
        AuditEventType.MODEL_UPDATED,
        AuditSeverity.HIGH,
        `Scheduled retraining failed: ${error.message}`,
        { error: error.message }
      );
    }
  }

  /**
   * Perform online/incremental learning from new data
   */
  async performIncrementalLearning(feedbackData: any[]): Promise<void> {
    this.logger.log(`Performing incremental learning with ${feedbackData.length} samples`);
    
    try {
      // Group feedback by waitlist for targeted learning
      const waitlistGroups = this.groupFeedbackByWaitlist(feedbackData);
      
      for (const [waitlistId, groupData] of Object.entries(waitlistGroups)) {
        if (groupData.length < 5) continue; // Skip small groups
        
        // Extract features and labels from feedback
        const trainingData = await this.prepareTrainingData(groupData, waitlistId);
        
        // Perform incremental update with smaller learning rate
        const incrementalLearningRate = this.config.learningRate * 0.1;
        await this.modelService.train(waitlistId, 10, incrementalLearningRate);
        
        // Validate the update
        const validationMetrics = await this.validateModelUpdate(waitlistId, trainingData);
        
        if (validationMetrics.accuracy > this.config.performanceThreshold) {
          this.logger.log(`Incremental learning successful for waitlist ${waitlistId}`);
          await this.logAuditEvent(
            'system',
            waitlistId,
            AuditEventType.MODEL_UPDATED,
            AuditSeverity.LOW,
            `Incremental learning completed for waitlist ${waitlistId}`,
            { accuracy: validationMetrics.accuracy, sampleCount: groupData.length }
          );
        } else {
          this.logger.warn(`Incremental learning failed validation for waitlist ${waitlistId}`);
          // Rollback would be implemented here
        }
      }
    } catch (error) {
      this.logger.error(`Incremental learning failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Detect data and concept drift
   */
  async detectDrift(): Promise<DriftDetectionResult> {
    const now = new Date();
    const timeWindow = 30 * 24 * 60 * 60 * 1000; // 30 days
    
    // Get recent explanations for drift analysis
    const recentExplanations = await this.explanationRepo.find({
      where: {
        createdAt: { $gte: new Date(now.getTime() - timeWindow) }
      },
      order: { createdAt: 'DESC' },
      take: 1000,
    });

    if (recentExplanations.length < 100) {
      return {
        isDriftDetected: false,
        driftType: 'data_drift',
        driftScore: 0,
        affectedFeatures: [],
        recommendations: [],
      };
    }

    // Analyze feature distribution drift
    const featureDrift = await this.analyzeFeatureDrift(recentExplanations);
    
    // Analyze performance drift
    const performanceDrift = this.analyzePerformanceDrift();
    
    // Analyze concept drift (prediction pattern changes)
    const conceptDrift = await this.analyzeConceptDrift(recentExplanations);

    // Combine drift signals
    const overallDriftScore = Math.max(featureDrift, performanceDrift, conceptDrift);
    const isDriftDetected = overallDriftScore > this.config.driftThreshold;

    let driftType: 'data_drift' | 'concept_drift' | 'performance_drift' = 'data_drift';
    if (performanceDrift >= featureDrift && performanceDrift >= conceptDrift) {
      driftType = 'performance_drift';
    } else if (conceptDrift >= featureDrift && conceptDrift >= performanceDrift) {
      driftType = 'concept_drift';
    }

    const affectedFeatures = await this.identifyAffectedFeatures(recentExplanations);
    const recommendations = this.generateDriftRecommendations(driftType, overallDriftScore);

    return {
      isDriftDetected,
      driftType,
      driftScore: overallDriftScore,
      affectedFeatures,
      recommendations,
    };
  }

  /**
   * Create and manage A/B testing experiments
   */
  async createExperiment(
    waitlistId: string,
    modelVersion: string,
    trafficAllocation: number = 0.1
  ): Promise<string> {
    const experimentId = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const experiment: ExperimentResult = {
      experimentId,
      modelVersion,
      trafficAllocation,
      metrics: {
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        mse: 0,
        mae: 0,
        timestamp: new Date(),
      },
      statisticalSignificance: 0,
      winner: false,
    };

    this.activeExperiments.set(experimentId, experiment);
    
    this.logger.log(`Created experiment ${experimentId} for waitlist ${waitlistId}`);
    
    await this.logAuditEvent(
      'system',
      waitlistId,
      AuditEventType.MODEL_UPDATED,
      AuditSeverity.LOW,
      `A/B test experiment created: ${experimentId}`,
      { experimentId, modelVersion, trafficAllocation }
    );

    return experimentId;
  }

  /**
   * Update experiment metrics
   */
  async updateExperimentMetrics(
    experimentId: string,
    metrics: Partial<PerformanceMetrics>
  ): Promise<void> {
    const experiment = this.activeExperiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    // Update metrics
    Object.assign(experiment.metrics, metrics);
    
    // Calculate statistical significance
    experiment.statisticalSignificance = this.calculateStatisticalSignificance(experiment);
    
    // Determine winner if sufficient data
    if (experiment.statisticalSignificance > 0.95) {
      experiment.winner = this.determineExperimentWinner(experiment);
    }

    this.activeExperiments.set(experimentId, experiment);
  }

  /**
   * Collect feedback data for learning
   */
  private async collectFeedbackData(): Promise<any[]> {
    const feedbackData = [];
    
    // Collect from appeals
    const appealedExplanations = await this.explanationRepo.find({
      where: { isAppealed: true },
      order: { createdAt: 'DESC' },
      take: 1000,
    });

    for (const explanation of appealedExplanations) {
      feedbackData.push({
        userId: explanation.userId,
        waitlistId: explanation.waitlistId,
        features: explanation.explanationData.features,
        prediction: explanation.predictionScore,
        feedback: 'appeal',
        appealReason: explanation.appealReason,
        timestamp: explanation.createdAt,
      });
    }

    // Collect from user interactions (viewed explanations, etc.)
    const recentEvents = await this.eventRepo.find({
      where: {
        eventType: In([WaitlistEventType.PRIORITY_UPDATED, WaitlistEventType.POSITION_CHANGED]),
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      },
      order: { createdAt: 'DESC' },
      take: 2000,
    });

    for (const event of recentEvents) {
      feedbackData.push({
        userId: event.entryId,
        waitlistId: event.waitlistId,
        feedback: 'interaction',
        eventData: event,
        timestamp: event.createdAt,
      });
    }

    return feedbackData;
  }

  /**
   * Trigger full model retraining
   */
  private async triggerFullRetraining(): Promise<void> {
    this.logger.log('Triggering full model retraining due to performance degradation');
    
    const waitlists = await this.getActiveWaitlists();
    
    for (const waitlistId of waitlists) {
      try {
        const modelWeights = await this.modelService.train(
          waitlistId,
          this.config.maxEpochs,
          this.config.learningRate
        );
        
        // Invalidate cache to force new predictions
        this.inferenceService.clearCache();
        
        await this.logAuditEvent(
          'system',
          waitlistId,
          AuditEventType.MODEL_UPDATED,
          AuditSeverity.MEDIUM,
          `Full model retraining completed for waitlist ${waitlistId}`,
          { modelVersion: modelWeights.version, accuracy: modelWeights.metrics.accuracy }
        );
        
      } catch (error) {
        this.logger.error(`Full retraining failed for waitlist ${waitlistId}: ${error.message}`);
      }
    }
  }

  /**
   * Handle detected drift
   */
  private async handleDrift(driftResult: DriftDetectionResult): Promise<void> {
    this.logger.warn(`Handling drift: ${driftResult.driftType}, score: ${driftResult.driftScore}`);
    
    await this.logAuditEvent(
      'system',
      'all',
      AuditEventType.DRIFT_DETECTED,
      AuditSeverity.HIGH,
      `Drift detected: ${driftResult.driftType}`,
      driftResult
    );

    // Implement drift mitigation strategies
    switch (driftResult.driftType) {
      case 'data_drift':
        await this.handleDataDrift(driftResult);
        break;
      case 'concept_drift':
        await this.handleConceptDrift(driftResult);
        break;
      case 'performance_drift':
        await this.handlePerformanceDrift(driftResult);
        break;
    }
  }

  /**
   * Analyze feature distribution drift
   */
  private async analyzeFeatureDrift(explanations: WaitlistExplanation[]): Promise<number> {
    // Simple implementation: compare recent vs older feature distributions
    const midPoint = Math.floor(explanations.length / 2);
    const recent = explanations.slice(0, midPoint);
    const older = explanations.slice(midPoint);

    let totalDrift = 0;
    const featureNames = Object.keys(recent[0]?.featureImportance || {});

    for (const feature of featureNames) {
      const recentValues = recent.map(e => e.featureImportance[feature] || 0);
      const olderValues = older.map(e => e.featureImportance[feature] || 0);
      
      const recentMean = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
      const olderMean = olderValues.reduce((sum, val) => sum + val, 0) / olderValues.length;
      
      // Calculate relative change
      const drift = Math.abs(recentMean - olderMean) / (olderMean || 0.01);
      totalDrift += drift;
    }

    return totalDrift / featureNames.length;
  }

  /**
   * Analyze performance drift
   */
  private analyzePerformanceDrift(): number {
    if (this.performanceHistory.length < 2) return 0;

    const recent = this.performanceHistory.slice(0, 5);
    const older = this.performanceHistory.slice(5, 10);

    if (older.length === 0) return 0;

    const recentAccuracy = recent.reduce((sum, m) => sum + m.accuracy, 0) / recent.length;
    const olderAccuracy = older.reduce((sum, m) => sum + m.accuracy, 0) / older.length;

    return Math.abs(recentAccuracy - olderAccuracy) / olderAccuracy;
  }

  /**
   * Analyze concept drift
   */
  private async analyzeConceptDrift(explanations: WaitlistExplanation[]): Promise<number> {
    // Analyze prediction pattern changes
    const scores = explanations.map(e => e.predictionScore);
    const recentScores = scores.slice(0, Math.floor(scores.length / 2));
    const olderScores = scores.slice(Math.floor(scores.length / 2));

    if (olderScores.length === 0) return 0;

    const recentMean = recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;
    const olderMean = olderScores.reduce((sum, score) => sum + score, 0) / olderScores.length;
    const recentStd = Math.sqrt(recentScores.reduce((sum, score) => sum + Math.pow(score - recentMean, 2), 0) / recentScores.length);
    const olderStd = Math.sqrt(olderScores.reduce((sum, score) => sum + Math.pow(score - olderMean, 2), 0) / olderScores.length);

    // Combine mean and standard deviation changes
    const meanDrift = Math.abs(recentMean - olderMean) / (olderMean || 0.01);
    const stdDrift = Math.abs(recentStd - olderStd) / (olderStd || 0.01);

    return (meanDrift + stdDrift) / 2;
  }

  /**
   * Helper methods
   */
  private groupFeedbackByWaitlist(feedbackData: any[]): Record<string, any[]> {
    return feedbackData.reduce((groups, item) => {
      const waitlistId = item.waitlistId || 'default';
      if (!groups[waitlistId]) groups[waitlistId] = [];
      groups[waitlistId].push(item);
      return groups;
    }, {});
  }

  private async prepareTrainingData(feedbackData: any[], waitlistId: string): Promise<any[]> {
    // Transform feedback data into training format
    return feedbackData.map(item => ({
      features: item.features || await this.featureService.extractFeatures(item.userId, waitlistId),
      label: item.expectedScore || item.prediction, // Use expected score if available
      weight: this.calculateFeedbackWeight(item),
    }));
  }

  private calculateFeedbackWeight(feedbackItem: any): number {
    // Assign weights based on feedback type
    switch (feedbackItem.feedback) {
      case 'appeal': return 2.0; // Higher weight for appeals
      case 'interaction': return 1.0;
      default: return 0.5;
    }
  }

  private async validateModelUpdate(waitlistId: string, trainingData: any[]): Promise<PerformanceMetrics> {
    // Simple validation - in production, use proper validation set
    const predictions = trainingData.map(item => this.modelService.predict(item.features));
    const actuals = trainingData.map(item => item.label);
    
    return this.calculateMetrics(predictions, actuals);
  }

  private calculateMetrics(predictions: number[], actuals: number[]): PerformanceMetrics {
    const n = predictions.length;
    const mse = predictions.reduce((sum, pred, i) => sum + Math.pow(pred - actuals[i], 2), 0) / n;
    const mae = predictions.reduce((sum, pred, i) => sum + Math.abs(pred - actuals[i]), 0) / n;
    
    // Simple accuracy calculation (within 10% threshold)
    const accuracy = predictions.reduce((sum, pred, i) => 
      sum + (Math.abs(pred - actuals[i]) < 0.1 ? 1 : 0), 0) / n;

    return {
      accuracy,
      precision: accuracy, // Simplified
      recall: accuracy, // Simplified
      f1Score: accuracy, // Simplified
      mse,
      mae,
      timestamp: new Date(),
    };
  }

  private async getActiveWaitlists(): Promise<string[]> {
    // Get all active waitlists - simplified implementation
    const waitlists = await this.entryRepo.find({
      select: ['waitlistId'],
      where: { isDeleted: false },
    });
    return [...new Set(waitlists.map(w => w.waitlistId))];
  }

  private async identifyAffectedFeatures(explanations: WaitlistExplanation[]): Promise<string[]> {
    const featureImportance: Record<string, number[]> = {};
    
    explanations.forEach(explanation => {
      Object.entries(explanation.featureImportance).forEach(([feature, importance]) => {
        if (!featureImportance[feature]) featureImportance[feature] = [];
        featureImportance[feature].push(importance as number);
      });
    });

    // Identify features with high variance
    const affectedFeatures: string[] = [];
    Object.entries(featureImportance).forEach(([feature, values]) => {
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      
      if (variance > 0.01) { // Threshold for high variance
        affectedFeatures.push(feature);
      }
    });

    return affectedFeatures;
  }

  private generateDriftRecommendations(driftType: string, driftScore: number): string[] {
    const recommendations: string[] = [];
    
    if (driftScore > 0.2) {
      recommendations.push('High drift detected - immediate retraining recommended');
    }
    
    switch (driftType) {
      case 'data_drift':
        recommendations.push('Review data collection processes');
        recommendations.push('Consider feature engineering updates');
        break;
      case 'concept_drift':
        recommendations.push('Update model architecture');
        recommendations.push('Review business logic changes');
        break;
      case 'performance_drift':
        recommendations.push('Increase monitoring frequency');
        recommendations.push('Consider model rollback');
        break;
    }
    
    return recommendations;
  }

  private calculateStatisticalSignificance(experiment: ExperimentResult): number {
    // Simplified statistical significance calculation
    // In production, use proper statistical tests
    const sampleSize = 100; // Placeholder
    const effectSize = Math.abs(experiment.metrics.accuracy - 0.5); // vs baseline
    
    // Simplified p-value approximation
    return Math.min(1.0, effectSize * Math.sqrt(sampleSize) / 2);
  }

  private determineExperimentWinner(experiment: ExperimentResult): boolean {
    return experiment.metrics.accuracy > this.config.performanceThreshold;
  }

  private async handleDataDrift(driftResult: DriftDetectionResult): Promise<void> {
    this.logger.log('Handling data drift');
    // Implementation for data drift handling
  }

  private async handleConceptDrift(driftResult: DriftDetectionResult): Promise<void> {
    this.logger.log('Handling concept drift');
    // Implementation for concept drift handling
  }

  private async handlePerformanceDrift(driftResult: DriftDetectionResult): Promise<void> {
    this.logger.log('Handling performance drift');
    // Implementation for performance drift handling
  }

  private async logPerformanceMetrics(metrics: PerformanceMetrics): Promise<void> {
    this.performanceHistory.push(metrics);
    
    // Keep only last 100 metrics
    if (this.performanceHistory.length > 100) {
      this.performanceHistory = this.performanceHistory.slice(-100);
    }
  }

  private async logAuditEvent(
    userId: string,
    waitlistId: string,
    eventType: AuditEventType,
    severity: AuditSeverity,
    description: string,
    eventData: Record<string, any>
  ): Promise<void> {
    const auditEvent = this.auditRepo.create({
      userId,
      waitlistId,
      eventType,
      severity,
      description,
      eventData,
      modelSnapshot: this.modelService.currentWeights(),
      featureSnapshot: {},
      systemState: {
        timestamp: new Date(),
        performance: this.performanceHistory.slice(-1)[0] || {},
        configuration: this.config,
      },
    });
    
    await this.auditRepo.save(auditEvent);
  }

  /**
   * Get current learning configuration
   */
  getConfig(): LearningConfig {
    return { ...this.config };
  }

  /**
   * Update learning configuration
   */
  async updateConfig(newConfig: Partial<LearningConfig>): Promise<void> {
    Object.assign(this.config, newConfig);
    
    await this.logAuditEvent(
      'admin',
      'all',
      AuditEventType.CONFIGURATION_CHANGED,
      AuditSeverity.LOW,
      'Continuous learning configuration updated',
      { oldConfig: this.config, newConfig }
    );
  }

  /**
   * Get performance metrics history
   */
  getPerformanceHistory(): PerformanceMetrics[] {
    return [...this.performanceHistory];
  }

  /**
   * Get active experiments
   */
  getActiveExperiments(): ExperimentResult[] {
    return Array.from(this.activeExperiments.values());
  }

  /**
   * Evaluate current model performance
   */
  private async evaluateModelPerformance(): Promise<PerformanceMetrics> {
    // Get recent predictions and actual outcomes
    const recentExplanations = await this.explanationRepo.find({
      order: { createdAt: 'DESC' },
      take: 1000,
    });

    if (recentExplanations.length === 0) {
      return {
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        mse: 0,
        mae: 0,
        timestamp: new Date(),
      };
    }

    // Use predicted scores vs actual priority scores for evaluation
    const predictions = recentExplanations.map(e => e.predictionScore);
    const actuals = recentExplanations.map(e => e.explanationData?.actualScore || e.predictionScore);

    return this.calculateMetrics(predictions, actuals);
  }
}
