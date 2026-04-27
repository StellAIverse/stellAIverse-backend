import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeatureEngineeringService, UserFeatures } from './feature-engineering.service';
import { WaitlistEntry } from './entities/waitlist-entry.entity';
import { WaitlistEvent, WaitlistEventType } from './entities/waitlist-event.entity';
import { ExplainableAIService } from './explainable-ai.service';

export interface ScoringFactor {
  name: string;
  weight: number;
  enabled: boolean;
  description: string;
  category: 'behavioral' | 'social' | 'engagement' | 'temporal' | 'manual';
}

export interface ScoringConfiguration {
  factors: ScoringFactor[];
  normalizationMethod: 'min_max' | 'z_score' | 'robust';
  outlierHandling: 'clip' | 'remove' | 'transform';
  scoreRange: { min: number; max: number };
  lastUpdated: Date;
  updatedBy: string;
}

export interface PriorityScoreResult {
  userId: string;
  waitlistId: string;
  rawScore: number;
  normalizedScore: number;
  finalScore: number;
  factorContributions: Record<string, number>;
  explanation: string;
  confidence: number;
  metadata: {
    scoringTime: number;
    factorsUsed: string[];
    dataQuality: number;
  };
}

export interface ScoreChange {
  userId: string;
  waitlistId: string;
  oldScore: number;
  newScore: number;
  changeReason: string;
  affectedFactors: string[];
  timestamp: Date;
}

@Injectable()
export class DynamicPriorityScoringService {
  private readonly logger = new Logger(DynamicPriorityScoringService.name);

  private readonly defaultConfiguration: ScoringConfiguration = {
    factors: [
      {
        name: 'joinOrder',
        weight: 0.15,
        enabled: true,
        description: 'Priority based on join order (earlier = higher priority)',
        category: 'temporal',
      },
      {
        name: 'referralCount',
        weight: 0.25,
        enabled: true,
        description: 'Number of successful referrals',
        category: 'social',
      },
      {
        name: 'referralQuality',
        weight: 0.10,
        enabled: true,
        description: 'Quality score of referred users',
        category: 'social',
      },
      {
        name: 'engagementScore',
        weight: 0.20,
        enabled: true,
        description: 'Overall user engagement level',
        category: 'engagement',
      },
      {
        name: 'activityFrequency',
        weight: 0.15,
        enabled: true,
        description: 'Frequency of user activities',
        category: 'behavioral',
      },
      {
        name: 'socialInfluence',
        weight: 0.10,
        enabled: true,
        description: 'Social network influence score',
        category: 'social',
      },
      {
        name: 'manualBoost',
        weight: 0.05,
        enabled: true,
        description: 'Manual admin boosts',
        category: 'manual',
      },
    ],
    normalizationMethod: 'min_max',
    outlierHandling: 'clip',
    scoreRange: { min: 0, max: 100 },
    lastUpdated: new Date(),
    updatedBy: 'system',
  };

  private configurations: Map<string, ScoringConfiguration> = new Map();
  private scoreHistory: Map<string, number[]> = new Map();

  constructor(
    @InjectRepository(WaitlistEntry)
    private readonly entryRepo: Repository<WaitlistEntry>,
    @InjectRepository(WaitlistEvent)
    private readonly eventRepo: Repository<WaitlistEvent>,
    private readonly featureService: FeatureEngineeringService,
    private readonly explainableService: ExplainableAIService,
  ) {
    // Initialize with default configuration
    this.configurations.set('default', { ...this.defaultConfiguration });
  }

  /**
   * Calculate dynamic priority score for a user
   */
  async calculatePriorityScore(
    userId: string,
    waitlistId: string,
    configurationId = 'default'
  ): Promise<PriorityScoreResult> {
    const startTime = Date.now();
    
    try {
      const config = this.configurations.get(configurationId) || this.defaultConfiguration;
      const features = await this.featureService.extractFeatures(userId, waitlistId);
      
      // Calculate raw score using configured factors
      const factorScores = await this.calculateFactorScores(features, config);
      const rawScore = this.combineFactorScores(factorScores, config);
      
      // Normalize score
      const normalizedScore = this.normalizeScore(rawScore, config);
      
      // Apply final adjustments
      const finalScore = this.applyFinalAdjustments(normalizedScore, features, config);
      
      // Generate explanation
      const explanation = this.generateScoreExplanation(factorScores, finalScore, config);
      
      // Calculate confidence based on data quality
      const confidence = this.calculateScoreConfidence(features, factorScores);
      
      const result: PriorityScoreResult = {
        userId,
        waitlistId,
        rawScore,
        normalizedScore,
        finalScore,
        factorContributions: factorScores,
        explanation,
        confidence,
        metadata: {
          scoringTime: Date.now() - startTime,
          factorsUsed: Object.keys(factorScores),
          dataQuality: this.assessDataQuality(features),
        },
      };

      // Update score history
      this.updateScoreHistory(userId, finalScore);
      
      this.logger.log(`Calculated priority score for user ${userId}: ${finalScore.toFixed(2)} (${Date.now() - startTime}ms)`);
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to calculate priority score for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Batch calculate scores for all users in a waitlist
   */
  async batchCalculateScores(
    waitlistId: string,
    configurationId = 'default'
  ): Promise<PriorityScoreResult[]> {
    const entries = await this.entryRepo.find({
      where: { waitlistId, isDeleted: false },
      select: ['userId'],
    });

    const userIds = entries.map(entry => entry.userId);
    
    this.logger.log(`Batch calculating scores for ${userIds.length} users in waitlist ${waitlistId}`);
    
    const results = await Promise.allSettled(
      userIds.map(userId => this.calculatePriorityScore(userId, waitlistId, configurationId))
    );

    const successfulResults = results
      .filter((result): result is PromiseFulfilledResult<PriorityScoreResult> => result.status === 'fulfilled')
      .map(result => result.value);

    const failedCount = results.length - successfulResults.length;
    if (failedCount > 0) {
      this.logger.warn(`Failed to calculate scores for ${failedCount} users in waitlist ${waitlistId}`);
    }

    return successfulResults;
  }

  /**
   * Update scoring configuration
   */
  async updateScoringConfiguration(
    configurationId: string,
    updates: Partial<ScoringConfiguration>,
    updatedBy: string
  ): Promise<ScoringConfiguration> {
    const currentConfig = this.configurations.get(configurationId) || this.defaultConfiguration;
    const newConfig: ScoringConfiguration = {
      ...currentConfig,
      ...updates,
      factors: updates.factors || currentConfig.factors,
      lastUpdated: new Date(),
      updatedBy,
    };

    // Validate configuration
    this.validateConfiguration(newConfig);

    this.configurations.set(configurationId, newConfig);
    
    this.logger.log(`Updated scoring configuration ${configurationId} by ${updatedBy}`);
    
    return newConfig;
  }

  /**
   * Get scoring configuration
   */
  getScoringConfiguration(configurationId = 'default'): ScoringConfiguration {
    return this.configurations.get(configurationId) || this.defaultConfiguration;
  }

  /**
   * Calculate individual factor scores
   */
  private async calculateFactorScores(
    features: UserFeatures,
    config: ScoringConfiguration
  ): Promise<Record<string, number>> {
    const factorScores: Record<string, number> = {};

    for (const factor of config.factors) {
      if (!factor.enabled) continue;

      factorScores[factor.name] = await this.calculateSingleFactorScore(factor.name, features);
    }

    return factorScores;
  }

  /**
   * Calculate score for a single factor
   */
  private async calculateSingleFactorScore(factorName: string, features: UserFeatures): Promise<number> {
    switch (factorName) {
      case 'joinOrder':
        return this.calculateJoinOrderScore(features);
      case 'referralCount':
        return this.calculateReferralCountScore(features);
      case 'referralQuality':
        return this.calculateReferralQualityScore(features);
      case 'engagementScore':
        return this.calculateEngagementScore(features);
      case 'activityFrequency':
        return this.calculateActivityFrequencyScore(features);
      case 'socialInfluence':
        return this.calculateSocialInfluenceScore(features);
      case 'manualBoost':
        return this.calculateManualBoostScore(features);
      default:
        this.logger.warn(`Unknown factor: ${factorName}`);
        return 0;
    }
  }

  /**
   * Individual factor calculation methods
   */
  private calculateJoinOrderScore(features: UserFeatures): number {
    // Earlier join = higher score, inverted and normalized
    const joinOrderScore = Math.max(0, 100 - (features.daysSinceJoin / 365) * 100);
    return Math.min(100, Math.max(0, joinOrderScore));
  }

  private calculateReferralCountScore(features: UserFeatures): number {
    // Exponential scaling for referrals (diminishing returns)
    const baseScore = Math.log10(features.referralCount + 1) * 25;
    return Math.min(100, Math.max(0, baseScore));
  }

  private calculateReferralQualityScore(features: UserFeatures): number {
    // Quality based on referral depth and engagement
    const qualityScore = features.referralDepth * 20 + features.normalizedScore * 30;
    return Math.min(100, Math.max(0, qualityScore));
  }

  private calculateEngagementScore(features: UserFeatures): number {
    // Direct use of engagement score, capped at 100
    return Math.min(100, Math.max(0, features.engagementScore));
  }

  private calculateActivityFrequencyScore(features: UserFeatures): number {
    // Normalize activity frequency to 0-100 scale
    const frequencyScore = Math.min(100, features.activityFrequency * 100);
    return Math.max(0, frequencyScore);
  }

  private calculateSocialInfluenceScore(features: UserFeatures): number {
    // Combine referral metrics for influence score
    const influenceScore = (features.referralCount * 10) + (features.referralDepth * 15);
    return Math.min(100, Math.max(0, influenceScore));
  }

  private calculateManualBoostScore(features: UserFeatures): number {
    // This would be calculated from manual boost records
    // For now, return 0 as default
    return 0;
  }

  /**
   * Combine factor scores using weights
   */
  private combineFactorScores(
    factorScores: Record<string, number>,
    config: ScoringConfiguration
  ): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const factor of config.factors) {
      if (!factor.enabled) continue;
      
      const factorScore = factorScores[factor.name] || 0;
      totalScore += factorScore * factor.weight;
      totalWeight += factor.weight;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Normalize score to configured range
   */
  private normalizeScore(rawScore: number, config: ScoringConfiguration): number {
    switch (config.normalizationMethod) {
      case 'min_max':
        return this.minMaxNormalization(rawScore, config.scoreRange);
      case 'z_score':
        return this.zScoreNormalization(rawScore);
      case 'robust':
        return this.robustNormalization(rawScore);
      default:
        return rawScore;
    }
  }

  private minMaxNormalization(score: number, range: { min: number; max: number }): number {
    // Assuming input score is 0-100, normalize to target range
    const normalized = (score / 100) * (range.max - range.min) + range.min;
    return Math.max(range.min, Math.min(range.max, normalized));
  }

  private zScoreNormalization(score: number): number {
    // Simple z-score approximation (would need historical data for proper implementation)
    const mean = 50; // Assumed mean
    const stdDev = 25; // Assumed standard deviation
    const zScore = (score - mean) / stdDev;
    return Math.max(0, Math.min(100, (zScore + 2) * 25)); // Convert back to 0-100
  }

  private robustNormalization(score: number): number {
    // Robust scaling using median and IQR
    const median = 50; // Assumed median
    const iqr = 40; // Assumed interquartile range
    const robustScore = (score - median) / iqr;
    return Math.max(0, Math.min(100, (robustScore + 1.5) * 40));
  }

  /**
   * Apply final adjustments to score
   */
  private applyFinalAdjustments(
    normalizedScore: number,
    features: UserFeatures,
    config: ScoringConfiguration
  ): number {
    let adjustedScore = normalizedScore;

    // Apply time-based decay if configured
    if (features.daysSinceJoin > 365) {
      const decayFactor = Math.max(0.7, 1 - (features.daysSinceJoin - 365) / 730);
      adjustedScore *= decayFactor;
    }

    // Apply outlier handling
    switch (config.outlierHandling) {
      case 'clip':
        adjustedScore = Math.max(config.scoreRange.min * 0.1, 
                               Math.min(config.scoreRange.max * 1.1, adjustedScore));
        break;
      case 'transform':
        // Apply log transformation for extreme values
        if (adjustedScore > 90) {
          adjustedScore = 90 + Math.log10(adjustedScore - 89) * 10;
        }
        break;
    }

    return Math.max(config.scoreRange.min, Math.min(config.scoreRange.max, adjustedScore));
  }

  /**
   * Generate human-readable score explanation
   */
  private generateScoreExplanation(
    factorScores: Record<string, number>,
    finalScore: number,
    config: ScoringConfiguration
  ): string {
    const topFactors = Object.entries(factorScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    let explanation = `Your priority score of ${finalScore.toFixed(1)} is calculated from several factors: `;

    if (topFactors.length > 0) {
      const factorDescriptions = topFactors.map(([name, score]) => {
        const factor = config.factors.find(f => f.name === name);
        const weight = factor?.weight || 0;
        return `${factor?.description || name} (${score.toFixed(1)} points, ${(weight * 100).toFixed(0)}% weight)`;
      });

      explanation += factorDescriptions.join(', ');
    }

    explanation += '. ';

    // Add contextual insights
    if (finalScore > 80) {
      explanation += 'You are in the top priority tier with excellent engagement and referral activity.';
    } else if (finalScore > 60) {
      explanation += 'You have a good priority score with room for improvement through increased engagement.';
    } else if (finalScore > 40) {
      explanation += 'Your priority score can be improved by increasing referrals and platform engagement.';
    } else {
      explanation += 'Consider increasing your activity and referrals to improve your priority score.';
    }

    return explanation;
  }

  /**
   * Calculate confidence in the score
   */
  private calculateScoreConfidence(
    features: UserFeatures,
    factorScores: Record<string, number>
  ): number {
    let confidence = 0.8; // Base confidence

    // Adjust based on data completeness
    const dataCompleteness = this.assessDataQuality(features);
    confidence += (dataCompleteness - 0.5) * 0.2;

    // Adjust based on score consistency
    const scoreVariance = this.calculateScoreVariance(factorScores);
    confidence -= Math.min(0.3, scoreVariance * 0.1);

    // Adjust based on recency of data
    if (features.recentEvents7d > 0) {
      confidence += 0.1;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Assess data quality
   */
  private assessDataQuality(features: UserFeatures): number {
    let qualityScore = 0;
    let totalChecks = 0;

    // Check for missing or zero values
    const numericFeatures = Object.keys(features).filter(key => 
      typeof features[key as keyof UserFeatures] === 'number'
    ) as (keyof UserFeatures)[];

    for (const feature of numericFeatures) {
      totalChecks++;
      const value = features[feature] as number;
      if (value !== undefined && value !== null && !isNaN(value) && value >= 0) {
        qualityScore += 1;
      }
    }

    // Bonus for recent activity
    if (features.recentEvents7d > 0) qualityScore += 0.5;
    if (features.totalEvents > 10) qualityScore += 0.5;

    return Math.min(1.0, qualityScore / (totalChecks + 1));
  }

  /**
   * Calculate score variance for confidence assessment
   */
  private calculateScoreVariance(factorScores: Record<string, number>): number {
    const scores = Object.values(factorScores);
    if (scores.length === 0) return 0;

    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    
    return variance;
  }

  /**
   * Update score history for trend analysis
   */
  private updateScoreHistory(userId: string, score: number): void {
    if (!this.scoreHistory.has(userId)) {
      this.scoreHistory.set(userId, []);
    }

    const history = this.scoreHistory.get(userId)!;
    history.push(score);

    // Keep only last 50 scores
    if (history.length > 50) {
      history.shift();
    }
  }

  /**
   * Get score trend for a user
   */
  getScoreTrend(userId: string): {
    current: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    changeRate: number;
  } {
    const history = this.scoreHistory.get(userId) || [];
    
    if (history.length < 2) {
      return {
        current: history[0] || 0,
        trend: 'stable',
        changeRate: 0,
      };
    }

    const current = history[history.length - 1];
    const previous = history[history.length - 2];
    const changeRate = (current - previous) / previous;

    let trend: 'increasing' | 'decreasing' | 'stable';
    if (Math.abs(changeRate) < 0.05) {
      trend = 'stable';
    } else if (changeRate > 0) {
      trend = 'increasing';
    } else {
      trend = 'decreasing';
    }

    return { current, trend, changeRate };
  }

  /**
   * Validate scoring configuration
   */
  private validateConfiguration(config: ScoringConfiguration): void {
    if (!config.factors || config.factors.length === 0) {
      throw new Error('Scoring configuration must have at least one factor');
    }

    const totalWeight = config.factors
      .filter(f => f.enabled)
      .reduce((sum, f) => sum + f.weight, 0);

    if (Math.abs(totalWeight - 1.0) > 0.01) {
      throw new Error(`Factor weights must sum to 1.0, got ${totalWeight}`);
    }

    for (const factor of config.factors) {
      if (factor.weight < 0 || factor.weight > 1) {
        throw new Error(`Factor weight must be between 0 and 1, got ${factor.weight} for ${factor.name}`);
      }
    }
  }

  /**
   * Get scoring analytics
   */
  async getScoringAnalytics(waitlistId: string): Promise<any> {
    const results = await this.batchCalculateScores(waitlistId);
    
    const scores = results.map(r => r.finalScore);
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    return {
      waitlistId,
      totalUsers: results.length,
      statistics: {
        mean,
        median: this.calculateMedian(scores),
        stdDev,
        min: Math.min(...scores),
        max: Math.max(...scores),
      },
      distribution: this.calculateScoreDistribution(scores),
      factorAnalysis: this.analyzeFactorContributions(results),
      trends: this.analyzeScoreTrends(results),
      timestamp: new Date(),
    };
  }

  private calculateMedian(scores: number[]): number {
    const sorted = [...scores].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  private calculateScoreDistribution(scores: number[]): Record<string, number> {
    const distribution = {
      '0-20': 0,
      '21-40': 0,
      '41-60': 0,
      '61-80': 0,
      '81-100': 0,
    };

    for (const score of scores) {
      if (score <= 20) distribution['0-20']++;
      else if (score <= 40) distribution['21-40']++;
      else if (score <= 60) distribution['41-60']++;
      else if (score <= 80) distribution['61-80']++;
      else distribution['81-100']++;
    }

    return distribution;
  }

  private analyzeFactorContributions(results: PriorityScoreResult[]): Record<string, any> {
    const factorAnalysis: Record<string, any> = {};

    // Aggregate factor contributions across all users
    results.forEach(result => {
      Object.entries(result.factorContributions).forEach(([factor, contribution]) => {
        if (!factorAnalysis[factor]) {
          factorAnalysis[factor] = { values: [], sum: 0, count: 0 };
        }
        factorAnalysis[factor].values.push(contribution);
        factorAnalysis[factor].sum += contribution;
        factorAnalysis[factor].count++;
      });
    });

    // Calculate statistics for each factor
    Object.keys(factorAnalysis).forEach(factor => {
      const analysis = factorAnalysis[factor];
      analysis.mean = analysis.sum / analysis.count;
      analysis.variance = analysis.values.reduce((sum: number, val: number) => 
        sum + Math.pow(val - analysis.mean, 2), 0) / analysis.count;
    });

    return factorAnalysis;
  }

  private analyzeScoreTrends(results: PriorityScoreResult[]): Record<string, any> {
    const trends = {
      improving: 0,
      declining: 0,
      stable: 0,
    };

    results.forEach(result => {
      const trend = this.getScoreTrend(result.userId);
      trends[trend.trend]++;
    });

    return trends;
  }
}
