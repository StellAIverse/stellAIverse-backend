import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecommendationFeedback, FeedbackType } from './entities/recommendation-feedback.entity';
import { RecommendationInteraction, InteractionType } from './entities/recommendation-interaction.entity';
import { Agent } from '../agent/entities/agent.entity';

/**
 * Feature vector for ML model
 */
interface FeatureVector {
  // User features
  userHasHistory: number;
  userAvgRating: number;
  
  // Agent features
  agentPerformanceScore: number;
  agentUsageCount: number;
  agentHasUserHistory: number;
  agentAvgFeedback: number;
  
  // Interaction features
  recencyScore: number;
  capabilityMatch: number;
  
  // Bias term
  bias: number;
}

/**
 * Model weights (will be learned)
 */
interface ModelWeights {
  userHasHistory: number;
  userAvgRating: number;
  agentPerformanceScore: number;
  agentUsageCount: number;
  agentHasUserHistory: number;
  agentAvgFeedback: number;
  recencyScore: number;
  capabilityMatch: number;
  bias: number;
}

/**
 * Training example for ML model
 */
interface TrainingExample {
  features: FeatureVector;
  label: number; // 1 = positive, 0 = negative
}

/**
 * Machine Learning-based ranking service
 * Uses logistic regression for interpretable, explainable recommendations
 */
@Injectable()
export class MLModelService {
  private readonly logger = new Logger(MLModelService.name);
  
  // Current model weights (initialized to default values)
  private weights: ModelWeights = {
    userHasHistory: 0.1,
    userAvgRating: 0.3,
    agentPerformanceScore: 0.4,
    agentUsageCount: 0.2,
    agentHasUserHistory: 0.5,
    agentAvgFeedback: 0.4,
    recencyScore: 0.15,
    capabilityMatch: 0.25,
    bias: 0.0,
  };

  // Learning rate for gradient descent
  private readonly learningRate = 0.01;
  
  // Regularization parameter
  private readonly regularizationLambda = 0.01;

  constructor(
    @InjectRepository(RecommendationFeedback)
    private readonly feedbackRepository: Repository<RecommendationFeedback>,
    @InjectRepository(RecommendationInteraction)
    private readonly interactionRepository: Repository<RecommendationInteraction>,
  ) {}

  /**
   * Extract features for a user-agent pair
   */
  async extractFeatures(
    userId: string | null,
    agent: Agent,
    requestedCapabilities?: string[],
  ): Promise<FeatureVector> {
    const features: FeatureVector = {
      userHasHistory: 0,
      userAvgRating: 0,
      agentPerformanceScore: agent.performanceScore / 100, // Normalize to 0-1
      agentUsageCount: agent.usageCount,
      agentHasUserHistory: 0,
      agentAvgFeedback: 0,
      recencyScore: 0,
      capabilityMatch: 0,
      bias: 1,
    };

    // Extract user-specific features if user is identified
    if (userId) {
      const userFeedback = await this.feedbackRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: 50,
      });

      features.userHasHistory = userFeedback.length > 0 ? 1 : 0;
      
      if (userFeedback.length > 0) {
        const ratings = userFeedback
          .filter(f => f.feedbackType === FeedbackType.EXPLICIT_RATING && f.rating)
          .map(f => f.rating!);
        
        features.userAvgRating = ratings.length > 0 
          ? (ratings.reduce((a, b) => a + b, 0) / 5) / 5 // Normalize to 0-1
          : 0.5;

        // Check if user has history with this specific agent
        features.agentHasUserHistory = userFeedback.some(f => f.agentId === agent.id) ? 1 : 0;

        // Calculate agent-specific feedback average
        const agentFeedback = userFeedback
          .filter(f => f.agentId === agent.id && f.rating)
          .map(f => f.rating!);
        
        features.agentAvgFeedback = agentFeedback.length > 0
          ? (agentFeedback.reduce((a, b) => a + b, 0) / 5) / 5
          : 0.5;
      }

      // Recency score based on recent interactions
      const oneWeekAgo = this.getLastWeek();
      const recentInteractions = await this.interactionRepository.count({
        where: { 
          userId,
          createdAt: oneWeekAgo,
        } as any,
      });
      
      features.recencyScore = Math.min(recentInteractions / 10, 1); // Cap at 1
    } else {
      // Default values for anonymous users
      features.userHasHistory = 0;
      features.userAvgRating = 0.5;
      features.recencyScore = 0.5;
    }

    // Capability matching
    if (requestedCapabilities && requestedCapabilities.length > 0) {
      const matches = agent.capabilities.filter(c => 
        requestedCapabilities.includes(c)
      ).length;
      
      features.capabilityMatch = matches / requestedCapabilities.length;
    } else {
      features.capabilityMatch = 0.5;
    }

    return features;
  }

  /**
   * Predict score for a user-agent pair using logistic regression
   */
  async predictScore(
    userId: string | null,
    agent: Agent,
    requestedCapabilities?: string[],
  ): Promise<number> {
    const features = await this.extractFeatures(userId, agent, requestedCapabilities);
    const score = this.logisticRegression(features);
    return score;
  }

  /**
   * Logistic regression sigmoid function
   */
  private logisticRegression(features: FeatureVector): number {
    const z = 
      this.weights.userHasHistory * features.userHasHistory +
      this.weights.userAvgRating * features.userAvgRating +
      this.weights.agentPerformanceScore * features.agentPerformanceScore +
      this.weights.agentUsageCount * (features.agentUsageCount / 100) + // Normalize
      this.weights.agentHasUserHistory * features.agentHasUserHistory +
      this.weights.agentAvgFeedback * features.agentAvgFeedback +
      this.weights.recencyScore * features.recencyScore +
      this.weights.capabilityMatch * features.capabilityMatch +
      this.weights.bias * features.bias;

    // Sigmoid function: 1 / (1 + e^(-z))
    const probability = 1 / (1 + Math.exp(-z));
    return probability;
  }

  /**
   * Train model on historical data
   * Uses gradient descent with regularization
   */
  async trainModel(): Promise<void> {
    this.logger.log('Starting model training...');

    // Gather training examples
    const examples = await this.gatherTrainingExamples();
    
    if (examples.length < 10) {
      this.logger.warn('Insufficient training data. Need at least 10 examples.');
      return;
    }

    this.logger.log(`Training on ${examples.length} examples`);

    // Gradient descent
    for (let iteration = 0; iteration < 100; iteration++) {
      const gradients = this.computeGradients(examples);
      this.updateWeights(gradients);
    }

    this.logger.log('Model training completed');
    this.logger.debug(`Updated weights: ${JSON.stringify(this.weights, null, 2)}`);
  }

  /**
   * Gather training examples from historical feedback and interactions
   */
  private async gatherTrainingExamples(): Promise<TrainingExample[]> {
    const examples: TrainingExample[] = [];

    // Get all feedback
    const feedbackList = await this.feedbackRepository.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: 1000,
    });

    for (const feedback of feedbackList) {
      // Create positive example from explicit high ratings or usage
      if (feedback.feedbackType === FeedbackType.EXPLICIT_RATING && feedback.rating! >= 4) {
        examples.push({
          features: await this.createFeaturesFromFeedback(feedback),
          label: 1,
        });
      } else if (feedback.feedbackType === FeedbackType.USAGE) {
        examples.push({
          features: await this.createFeaturesFromFeedback(feedback),
          label: 1,
        });
      } else if (feedback.feedbackType === FeedbackType.DISMISS || 
                 (feedback.feedbackType === FeedbackType.EXPLICIT_RATING && feedback.rating! <= 2)) {
        examples.push({
          features: await this.createFeaturesFromFeedback(feedback),
          label: 0,
        });
      }
    }

    // Get interactions
    const interactions = await this.interactionRepository.find({
      order: { createdAt: 'DESC' },
      take: 1000,
    });

    for (const interaction of interactions) {
      if (interaction.interactionType === InteractionType.CONVERSION) {
        examples.push({
          features: await this.createFeaturesFromInteraction(interaction),
          label: 1,
        });
      } else if (interaction.interactionType === InteractionType.CLICK) {
        examples.push({
          features: await this.createFeaturesFromInteraction(interaction),
          label: 0.7, // Weak positive
        });
      } else if (interaction.interactionType === InteractionType.DISMISS) {
        examples.push({
          features: await this.createFeaturesFromInteraction(interaction),
          label: 0,
        });
      }
    }

    return examples;
  }

  /**
   * Create feature vector from feedback
   */
  private async createFeaturesFromFeedback(
    feedback: RecommendationFeedback,
  ): Promise<FeatureVector> {
    // This is simplified - in production, you'd fetch agent data
    return {
      userHasHistory: 1,
      userAvgRating: feedback.rating ? feedback.rating / 5 : 0.5,
      agentPerformanceScore: 0.5, // Would fetch from agent
      agentUsageCount: 50, // Would fetch from agent
      agentHasUserHistory: 0,
      agentAvgFeedback: feedback.rating ? feedback.rating / 5 : 0.5,
      recencyScore: 0.5,
      capabilityMatch: 0.5,
      bias: 1,
    };
  }

  /**
   * Create feature vector from interaction
   */
  private async createFeaturesFromInteraction(
    interaction: RecommendationInteraction,
  ): Promise<FeatureVector> {
    return {
      userHasHistory: interaction.userId ? 1 : 0,
      userAvgRating: 0.5,
      agentPerformanceScore: 0.5,
      agentUsageCount: 50,
      agentHasUserHistory: 0,
      agentAvgFeedback: 0.5,
      recencyScore: 0.5,
      capabilityMatch: 0.5,
      bias: 1,
    };
  }

  /**
   * Compute gradients for all weights
   */
  private computeGradients(examples: TrainingExample[]): ModelWeights {
    const gradients: ModelWeights = {
      userHasHistory: 0,
      userAvgRating: 0,
      agentPerformanceScore: 0,
      agentUsageCount: 0,
      agentHasUserHistory: 0,
      agentAvgFeedback: 0,
      recencyScore: 0,
      capabilityMatch: 0,
      bias: 0,
    };

    const m = examples.length;

    for (const example of examples) {
      const prediction = this.logisticRegression(example.features);
      const error = prediction - example.label;

      gradients.userHasHistory += error * example.features.userHasHistory;
      gradients.userAvgRating += error * example.features.userAvgRating;
      gradients.agentPerformanceScore += error * example.features.agentPerformanceScore;
      gradients.agentUsageCount += error * example.features.agentUsageCount;
      gradients.agentHasUserHistory += error * example.features.agentHasUserHistory;
      gradients.agentAvgFeedback += error * example.features.agentAvgFeedback;
      gradients.recencyScore += error * example.features.recencyScore;
      gradients.capabilityMatch += error * example.features.capabilityMatch;
      gradients.bias += error * example.features.bias;
    }

    // Average gradients and add regularization
    for (const key of Object.keys(gradients)) {
      gradients[key as keyof ModelWeights] /= m;
      
      // Add L2 regularization (except for bias)
      if (key !== 'bias') {
        gradients[key as keyof ModelWeights] += 
          this.regularizationLambda * this.weights[key as keyof ModelWeights];
      }
    }

    return gradients;
  }

  /**
   * Update weights using gradients
   */
  private updateWeights(gradients: ModelWeights): void {
    for (const key of Object.keys(this.weights)) {
      this.weights[key as keyof ModelWeights] -= 
        this.learningRate * gradients[key as keyof ModelWeights];
    }
  }

  /**
   * Get feature importance for explainability
   */
  getFeatureImportance(): Record<string, number> {
    const totalWeight = Object.values(this.weights).reduce((sum, w) => sum + Math.abs(w), 0);
    
    const importance: Record<string, number> = {};
    for (const [key, weight] of Object.entries(this.weights)) {
      importance[key] = Math.abs(weight) / totalWeight;
    }
    
    return importance;
  }

  /**
   * Get current model weights
   */
  getModelWeights(): ModelWeights {
    return { ...this.weights };
  }

  /**
   * Helper to get date one week ago
   */
  private getLastWeek(): Date {
    const now = new Date();
    now.setDate(now.getDate() - 7);
    return now;
  }
}
