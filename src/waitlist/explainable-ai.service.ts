import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WaitlistExplanation, ExplanationType, ExplanationMethod } from './entities/explanation.entity';
import { AiAuditTrail, AuditEventType, AuditSeverity } from './entities/audit-trail.entity';
import { FeatureEngineeringService, UserFeatures } from './feature-engineering.service';
import { ModelTrainingService } from './model-training.service';
import { WaitlistEntry } from './entities/waitlist-entry.entity';

export interface ExplanationResult {
  explanation: WaitlistExplanation;
  featureImportance: Record<string, number>;
  confidenceScore: number;
  uncertaintyQuantification: number;
  naturalLanguageExplanation: string;
  alternativeScenarios: Record<string, any>;
}

export interface AppealRequest {
  userId: string;
  waitlistId: string;
  explanationId: string;
  reason: string;
  expectedOutcome?: string;
}

export interface AppealResponse {
  appealId: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewNotes?: string;
  newScore?: number;
}

@Injectable()
export class ExplainableAIService {
  private readonly logger = new Logger(ExplainableAIService.name);

  constructor(
    @InjectRepository(WaitlistExplanation)
    private readonly explanationRepo: Repository<WaitlistExplanation>,
    @InjectRepository(AiAuditTrail)
    private readonly auditRepo: Repository<AiAuditTrail>,
    @InjectRepository(WaitlistEntry)
    private readonly entryRepo: Repository<WaitlistEntry>,
    private readonly featureService: FeatureEngineeringService,
    private readonly modelService: ModelTrainingService,
  ) {}

  /**
   * Generate comprehensive explanation for a user's priority score
   */
  async generateExplanation(
    userId: string,
    waitlistId: string,
    explanationType: ExplanationType = ExplanationType.DECISION_EXPLANATION
  ): Promise<ExplanationResult> {
    const startTime = Date.now();
    
    try {
      // Get user features and prediction
      const features = await this.featureService.extractFeatures(userId, waitlistId);
      const predictionScore = this.modelService.predict(features);
      const modelWeights = this.modelService.currentWeights();
      
      // Generate feature importance using multiple methods
      const featureImportance = await this.calculateFeatureImportance(features, modelWeights);
      
      // Calculate confidence and uncertainty
      const confidenceScore = this.calculateConfidenceScore(features, featureImportance);
      const uncertaintyQuantification = this.calculateUncertainty(features, featureImportance);
      
      // Generate natural language explanation
      const naturalLanguageExplanation = this.generateNaturalLanguageExplanation(
        features,
        featureImportance,
        predictionScore,
        confidenceScore
      );
      
      // Generate alternative scenarios
      const alternativeScenarios = await this.generateAlternativeScenarios(features, modelWeights);
      
      // Create explanation record
      const explanation = this.explanationRepo.create({
        userId,
        waitlistId,
        explanationType,
        explanationMethod: ExplanationMethod.GRADIENT,
        featureImportance,
        explanationData: {
          features,
          predictionScore,
          modelWeights,
          timestamp: new Date(),
        },
        naturalLanguageExplanation,
        confidenceScore,
        uncertaintyQuantification,
        alternativeScenarios,
        predictionScore,
        modelMetadata: modelWeights,
      });
      
      const savedExplanation = await this.explanationRepo.save(explanation);
      
      // Log to audit trail
      await this.logAuditEvent(
        userId,
        waitlistId,
        AuditEventType.EXPLANATION_GENERATED,
        AuditSeverity.LOW,
        `Generated ${explanationType} explanation for user ${userId}`,
        {
          explanationId: savedExplanation.id,
          explanationType,
          predictionScore,
          confidenceScore,
          latencyMs: Date.now() - startTime,
        }
      );
      
      this.logger.log(`Generated explanation for user ${userId} in ${Date.now() - startTime}ms`);
      
      return {
        explanation: savedExplanation,
        featureImportance,
        confidenceScore,
        uncertaintyQuantification,
        naturalLanguageExplanation,
        alternativeScenarios,
      };
    } catch (error) {
      this.logger.error(`Failed to generate explanation for user ${userId}: ${error.message}`);
      await this.logAuditEvent(
        userId,
        waitlistId,
        AuditEventType.EXPLANATION_GENERATED,
        AuditSeverity.HIGH,
        `Failed to generate explanation: ${error.message}`,
        { error: error.message, stack: error.stack }
      );
      throw error;
    }
  }

  /**
   * Calculate feature importance using multiple methods
   */
  private async calculateFeatureImportance(
    features: UserFeatures,
    modelWeights: any
  ): Promise<Record<string, number>> {
    const importance: Record<string, number> = {};
    
    // Method 1: Weight-based importance (gradient method)
    const weightBased = { ...modelWeights.weights };
    
    // Method 2: Permutation importance simulation
    const permutationBased = await this.calculatePermutationImportance(features);
    
    // Method 3: SHAP-like approximation
    const shapApproximation = this.calculateShapApproximation(features, modelWeights);
    
    // Combine methods with weighted average
    const featureNames = Object.keys(features).filter(key => typeof features[key as keyof UserFeatures] === 'number');
    
    for (const feature of featureNames) {
      importance[feature] = (
        ((weightBased[feature] as number) || 0) * 0.4 +
        ((permutationBased[feature] as number) || 0) * 0.3 +
        ((shapApproximation[feature] as number) || 0) * 0.3
      );
    }
    
    // Normalize to sum to 1
    const total = Object.values(importance).reduce((sum, val) => sum + val, 0);
    if (total > 0) {
      Object.keys(importance).forEach(key => {
        importance[key] /= total;
      });
    }
    
    return importance;
  }

  /**
   * Simulate permutation importance
   */
  private async calculatePermutationImportance(features: UserFeatures): Promise<Record<string, number>> {
    const baselineScore = this.modelService.predict(features);
    const importance: Record<string, number> = {};
    
    const numericFeatures = Object.keys(features).filter(key => 
      typeof features[key as keyof UserFeatures] === 'number'
    ) as (keyof UserFeatures)[];
    
    for (const feature of numericFeatures) {
      const perturbedFeatures = { ...features };
      // Perturb feature by ±20%
      const originalValue = features[feature];
      const perturbation = originalValue * 0.2;
      perturbedFeatures[feature] = Math.max(0, originalValue + (Math.random() - 0.5) * 2 * perturbation);
      
      const perturbedScore = this.modelService.predict(perturbedFeatures);
      importance[feature] = Math.abs(baselineScore - perturbedScore);
    }
    
    return importance;
  }

  /**
   * Calculate SHAP-like approximation
   */
  private calculateShapApproximation(features: UserFeatures, modelWeights: any): Record<string, number> {
    const shapValues: Record<string, number> = {};
    const weights = modelWeights.weights;
    
    // Create baseline (average features)
    const baseline: Partial<UserFeatures> = {
      totalEvents: 10,
      recentEvents7d: 2,
      recentEvents30d: 5,
      avgDaysBetweenEvents: 7,
      referralCount: 1,
      referralDepth: 0,
      engagementScore: 50,
      daysSinceJoin: 30,
      activityFrequency: 0.3,
      normalizedScore: 0.5,
    };
    
    const baselineScore = this.modelService.predict(baseline as UserFeatures);
    const actualScore = this.modelService.predict(features);
    
    // Calculate contribution of each feature
    const numericFeatures = Object.keys(features).filter(key => 
      typeof features[key as keyof UserFeatures] === 'number'
    ) as (keyof UserFeatures)[];
    
    for (const feature of numericFeatures) {
      const featureContribution = (features[feature] - (baseline[feature] || 0)) * (weights[feature] || 0);
      shapValues[feature] = featureContribution;
    }
    
    return shapValues;
  }

  /**
   * Calculate confidence score based on feature stability and model certainty
   */
  private calculateConfidenceScore(
    features: UserFeatures,
    featureImportance: Record<string, number>
  ): number {
    // Base confidence on data quality
    let confidence = 0.8; // Start with 80% base confidence
    
    // Adjust based on feature completeness
    const featureCount = Object.keys(features).length;
    const expectedFeatureCount = 10; // Expected number of features
    confidence += Math.min(0.1, (featureCount / expectedFeatureCount) * 0.1);
    
    // Adjust based on feature stability (lower variance = higher confidence)
    const totalEvents = features.totalEvents;
    if (totalEvents < 5) confidence -= 0.2; // Low data points
    else if (totalEvents > 50) confidence += 0.1; // High data points
    
    // Adjust based on feature importance distribution
    const importanceEntropy = this.calculateEntropy(Object.values(featureImportance));
    confidence += Math.min(0.1, (1 - importanceEntropy) * 0.1);
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Calculate uncertainty quantification
   */
  private calculateUncertainty(
    features: UserFeatures,
    featureImportance: Record<string, number>
  ): number {
    // Higher uncertainty for:
    // 1. Low data volume
    // 2. High feature variance
    // 3. Unbalanced feature importance
    
    let uncertainty = 0.2; // Base uncertainty
    
    // Data volume uncertainty
    if (features.totalEvents < 5) uncertainty += 0.3;
    else if (features.totalEvents < 20) uncertainty += 0.1;
    
    // Feature importance uncertainty
    const maxImportance = Math.max(...Object.values(featureImportance));
    if (maxImportance > 0.7) uncertainty += 0.2; // Too reliant on single feature
    
    // Recency uncertainty
    if (features.recentEvents7d === 0) uncertainty += 0.1;
    
    return Math.max(0.05, Math.min(0.5, uncertainty));
  }

  /**
   * Generate natural language explanation
   */
  private generateNaturalLanguageExplanation(
    features: UserFeatures,
    featureImportance: Record<string, number>,
    predictionScore: number,
    confidenceScore: number
  ): string {
    const topFeatures = Object.entries(featureImportance)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);
    
    let explanation = `Your priority score of ${(predictionScore * 100).toFixed(1)} is primarily influenced by `;
    
    if (topFeatures.length > 0) {
      const [first, second, third] = topFeatures;
      
      if (first) {
        explanation += `${this.formatFeatureName(first[0])} (${(first[1] * 100).toFixed(1)}% impact)`;
      }
      
      if (second) {
        explanation += `, ${this.formatFeatureName(second[0])} (${(second[1] * 100).toFixed(1)}% impact)`;
      }
      
      if (third) {
        explanation += `, and ${this.formatFeatureName(third[0])} (${(third[1] * 100).toFixed(1)}% impact)`;
      }
    }
    
    explanation += `. `;
    
    // Add contextual details
    if (features.referralCount > 0) {
      explanation += `Your referral activity (${features.referralCount} referrals) significantly boosts your priority. `;
    }
    
    if (features.recentEvents7d > 2) {
      explanation += `Recent engagement (${features.recentEvents7d} activities in the last 7 days) shows strong interest. `;
    }
    
    if (features.daysSinceJoin < 7) {
      explanation += `As a new member, your priority will increase as you engage more with the platform. `;
    }
    
    // Add confidence information
    explanation += `This prediction has ${(confidenceScore * 100).toFixed(1)}% confidence based on your activity data.`;
    
    return explanation;
  }

  /**
   * Generate alternative scenarios (what-if analysis)
   */
  private async generateAlternativeScenarios(
    features: UserFeatures,
    modelWeights: any
  ): Promise<Record<string, any>> {
    const scenarios: Record<string, any> = {};
    
    // Scenario 1: Increase referrals
    const moreReferrals = { ...features, referralCount: features.referralCount + 3 };
    scenarios['more_referrals'] = {
      description: 'If you refer 3 more people',
      newScore: this.modelService.predict(moreReferrals),
      scoreChange: this.modelService.predict(moreReferrals) - this.modelService.predict(features),
    };
    
    // Scenario 2: Increase recent activity
    const moreActivity = { ...features, recentEvents7d: features.recentEvents7d + 5 };
    scenarios['more_activity'] = {
      description: 'If you complete 5 more activities this week',
      newScore: this.modelService.predict(moreActivity),
      scoreChange: this.modelService.predict(moreActivity) - this.modelService.predict(features),
    };
    
    // Scenario 3: Optimal engagement
    const optimalEngagement = { ...features, engagementScore: 90 };
    scenarios['optimal_engagement'] = {
      description: 'With optimal engagement score',
      newScore: this.modelService.predict(optimalEngagement),
      scoreChange: this.modelService.predict(optimalEngagement) - this.modelService.predict(features),
    };
    
    return scenarios;
  }

  /**
   * File an appeal for a prioritization decision
   */
  async fileAppeal(request: AppealRequest): Promise<AppealResponse> {
    const explanation = await this.explanationRepo.findOne({
      where: { id: request.explanationId, userId: request.userId }
    });
    
    if (!explanation) {
      throw new Error('Explanation not found or access denied');
    }
    
    // Update explanation with appeal information
    explanation.isAppealed = true;
    explanation.appealReason = request.reason;
    explanation.appealStatus = 'pending';
    await this.explanationRepo.save(explanation);
    
    // Log appeal to audit trail
    await this.logAuditEvent(
      request.userId,
      request.waitlistId,
      AuditEventType.APPEAL_FILED,
      AuditSeverity.MEDIUM,
      `User appealed priority decision`,
      {
        explanationId: request.explanationId,
        reason: request.reason,
        expectedOutcome: request.expectedOutcome,
      }
    );
    
    this.logger.log(`Appeal filed by user ${request.userId} for explanation ${request.explanationId}`);
    
    return {
      appealId: explanation.id,
      status: 'pending',
    };
  }

  /**
   * Get user's explanation history
   */
  async getUserExplanationHistory(
    userId: string,
    waitlistId: string,
    limit = 10
  ): Promise<WaitlistExplanation[]> {
    return this.explanationRepo.find({
      where: { userId, waitlistId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get bias detection metrics
   */
  async getBiasDetectionMetrics(waitlistId: string): Promise<any> {
    // This is a simplified implementation
    // In production, you'd implement sophisticated bias detection algorithms
    
    const explanations = await this.explanationRepo.find({
      where: { waitlistId },
      order: { createdAt: 'DESC' },
      take: 1000,
    });
    
    // Calculate basic fairness metrics
    const scores = explanations.map(e => e.predictionScore);
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const scoreVariance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
    
    // Feature distribution analysis
    const featureDistributions: Record<string, { values: number[]; sum: number; count: number; mean?: number; variance?: number }> = {};
    explanations.forEach(explanation => {
      Object.entries(explanation.featureImportance).forEach(([feature, importance]) => {
        if (!featureDistributions[feature]) {
          featureDistributions[feature] = { values: [], sum: 0, count: 0 };
        }
        featureDistributions[feature].values.push(importance as number);
        featureDistributions[feature].sum += importance as number;
        featureDistributions[feature].count++;
      });
    });
    
    // Calculate statistics for each feature
    Object.keys(featureDistributions).forEach(feature => {
      const dist = featureDistributions[feature];
      dist.mean = dist.sum / dist.count;
      dist.variance = dist.values.reduce((sum: number, val: number) => 
        sum + Math.pow(val - (dist.mean as number), 2), 0) / dist.count;
    });
    
    return {
      waitlistId,
      totalExplanations: explanations.length,
      averageScore: avgScore,
      scoreVariance,
      featureDistributions,
      biasIndicators: {
        scoreVariance: scoreVariance > 0.1 ? 'high' : 'normal',
        featureBalance: 'balanced', // Simplified
      },
      timestamp: new Date(),
    };
  }

  /**
   * Log audit events
   */
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
        performance: {},
        configuration: {},
      },
    });
    
    await this.auditRepo.save(auditEvent);
  }

  /**
   * Calculate entropy for uncertainty calculation
   */
  private calculateEntropy(values: number[]): number {
    const sum = values.reduce((a, b) => a + b, 0);
    if (sum === 0) return 0;
    
    const probabilities = values.map(v => v / sum);
    return -probabilities.reduce((entropy, p) => {
      return p > 0 ? entropy + p * Math.log2(p) : entropy;
    }, 0);
  }

  /**
   * Format feature names for natural language
   */
  private formatFeatureName(featureName: string): string {
    const nameMap: Record<string, string> = {
      totalEvents: 'total activity',
      recentEvents7d: 'recent activity',
      recentEvents30d: 'monthly activity',
      avgDaysBetweenEvents: 'activity consistency',
      referralCount: 'referral count',
      referralDepth: 'referral network depth',
      engagementScore: 'engagement level',
      daysSinceJoin: 'membership duration',
      activityFrequency: 'activity frequency',
      normalizedScore: 'overall score',
    };
    
    return nameMap[featureName] || featureName;
  }
}
