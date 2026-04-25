import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WaitlistEntry } from './entities/waitlist-entry.entity';
import { FeatureEngineeringService, UserFeatures } from './feature-engineering.service';

export interface ModelWeights {
  version: string;
  trainedAt: Date;
  weights: Record<string, number>;
  metrics: { accuracy: number; sampleSize: number };
}

/**
 * Lightweight in-process ML model for waitlist user value prediction.
 * Uses a weighted linear model trained via gradient descent on historical priority scores.
 * No external ML framework required — keeps the service self-contained.
 */
@Injectable()
export class ModelTrainingService {
  private readonly logger = new Logger(ModelTrainingService.name);

  // Feature weights — updated on each training run
  private weights: Record<string, number> = {
    normalizedScore: 0.4,
    referralDepth: 0.2,
    recentEvents7d: 0.15,
    recentEvents30d: 0.1,
    activityFrequency: 0.1,
    engagementScore: 0.05,
  };

  private modelVersion = '0.0.0';
  private trainedAt: Date | null = null;

  constructor(
    @InjectRepository(WaitlistEntry)
    private readonly entryRepo: Repository<WaitlistEntry>,
    private readonly featureService: FeatureEngineeringService,
  ) {}

  /**
   * Trains the model on all entries in a waitlist that have a non-zero priorityScore.
   * Uses simple gradient descent to minimize MSE between predicted and actual priority scores.
   */
  async train(waitlistId: string, epochs = 50, lr = 0.01): Promise<ModelWeights> {
    const entries = await this.entryRepo.find({
      where: { waitlistId },
    });

    const labeled = entries.filter(e => e.priorityScore > 0);
    if (labeled.length < 5) {
      this.logger.warn(`Not enough labeled data (${labeled.length}) to train — using defaults`);
      return this.currentWeights();
    }

    const dataset = await Promise.all(
      labeled.map(async e => ({
        features: await this.featureService.extractFeatures(e.userId, waitlistId),
        label: e.priorityScore,
      })),
    );

    // Normalize labels to [0,1]
    const maxLabel = Math.max(...dataset.map(d => d.label));
    const normalized = dataset.map(d => ({ ...d, label: d.label / maxLabel }));

    // Gradient descent
    const keys = Object.keys(this.weights);
    for (let epoch = 0; epoch < epochs; epoch++) {
      const grads: Record<string, number> = Object.fromEntries(keys.map(k => [k, 0]));
      let totalLoss = 0;

      for (const { features, label } of normalized) {
        const pred = this.predict(features);
        const err = pred - label;
        totalLoss += err * err;
        for (const k of keys) {
          grads[k] += err * (features[k as keyof UserFeatures] as number || 0);
        }
      }

      for (const k of keys) {
        this.weights[k] -= (lr * grads[k]) / normalized.length;
        this.weights[k] = Math.max(0, this.weights[k]); // keep non-negative
      }

      if (epoch % 10 === 0) {
        this.logger.debug(`Epoch ${epoch}: MSE=${(totalLoss / normalized.length).toFixed(4)}`);
      }
    }

    // Normalize weights to sum to 1
    const total = Object.values(this.weights).reduce((s, v) => s + v, 0);
    if (total > 0) {
      for (const k of keys) this.weights[k] /= total;
    }

    this.modelVersion = `${Date.now()}`;
    this.trainedAt = new Date();

    const accuracy = this.evaluate(normalized);
    this.logger.log(`Training complete. Accuracy: ${(accuracy * 100).toFixed(1)}%, samples: ${labeled.length}`);

    return this.currentWeights(accuracy, labeled.length);
  }

  /** Predict a priority score [0,1] from features */
  predict(features: UserFeatures): number {
    let score = 0;
    for (const [k, w] of Object.entries(this.weights)) {
      score += w * Math.min(1, (features[k as keyof UserFeatures] as number) || 0);
    }
    return Math.min(1, Math.max(0, score));
  }

  /** Returns current model weights and metadata */
  currentWeights(accuracy = 0, sampleSize = 0): ModelWeights {
    return {
      version: this.modelVersion,
      trainedAt: this.trainedAt ?? new Date(0),
      weights: { ...this.weights },
      metrics: { accuracy, sampleSize },
    };
  }

  /** Simple R² accuracy on a labeled dataset */
  private evaluate(dataset: { features: UserFeatures; label: number }[]): number {
    if (!dataset.length) return 0;
    const mean = dataset.reduce((s, d) => s + d.label, 0) / dataset.length;
    let ssTot = 0, ssRes = 0;
    for (const { features, label } of dataset) {
      ssTot += (label - mean) ** 2;
      ssRes += (label - this.predict(features)) ** 2;
    }
    return ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  }
}
