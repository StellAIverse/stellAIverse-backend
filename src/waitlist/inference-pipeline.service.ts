import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WaitlistEntry } from './entities/waitlist-entry.entity';
import { FeatureEngineeringService } from './feature-engineering.service';
import { ModelTrainingService } from './model-training.service';

export interface PredictionResult {
  userId: string;
  score: number;
  cached: boolean;
  fallback: boolean;
  latencyMs: number;
}

/**
 * Real-time inference pipeline for waitlist prioritization.
 * - In-memory LRU cache (TTL 5 min) for sub-millisecond repeat lookups
 * - Falls back to raw priorityScore when model is unavailable
 * - Batch scoring updates DB priority scores in one pass
 */
@Injectable()
export class InferencePipelineService {
  private readonly logger = new Logger(InferencePipelineService.name);

  private readonly cache = new Map<string, { score: number; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 5 * 60_000;
  private readonly MAX_CACHE_SIZE = 10_000;

  constructor(
    @InjectRepository(WaitlistEntry)
    private readonly entryRepo: Repository<WaitlistEntry>,
    private readonly featureService: FeatureEngineeringService,
    private readonly modelService: ModelTrainingService,
  ) {}

  /**
   * Predict priority score for a single user. Uses cache, then model, then fallback.
   */
  async predict(userId: string, waitlistId: string): Promise<PredictionResult> {
    const start = Date.now();
    const cacheKey = `${waitlistId}:${userId}`;

    // Cache hit
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { userId, score: cached.score, cached: true, fallback: false, latencyMs: Date.now() - start };
    }

    try {
      const features = await this.featureService.extractFeatures(userId, waitlistId);
      const score = this.modelService.predict(features);
      this.setCache(cacheKey, score);
      return { userId, score, cached: false, fallback: false, latencyMs: Date.now() - start };
    } catch (err) {
      this.logger.warn(`Model inference failed for ${userId}, using fallback: ${err.message}`);
      const score = await this.fallbackScore(userId, waitlistId);
      return { userId, score, cached: false, fallback: true, latencyMs: Date.now() - start };
    }
  }

  /**
   * Batch predict and update priorityScore for all active entries in a waitlist.
   */
  async scoreWaitlist(waitlistId: string): Promise<number> {
    const entries = await this.entryRepo.find({ where: { waitlistId } });
    let updated = 0;

    await Promise.all(
      entries.map(async entry => {
        try {
          const { score } = await this.predict(entry.userId, waitlistId);
          entry.priorityScore = score * 100; // store as 0-100
          await this.entryRepo.save(entry);
          updated++;
        } catch (err) {
          this.logger.error(`Failed to score entry ${entry.id}: ${err.message}`);
        }
      }),
    );

    this.logger.log(`Scored ${updated}/${entries.length} entries for waitlist ${waitlistId}`);
    return updated;
  }

  /** Invalidate cache for a specific user */
  invalidate(userId: string, waitlistId: string): void {
    this.cache.delete(`${waitlistId}:${userId}`);
  }

  /** Clear entire cache */
  clearCache(): void {
    this.cache.clear();
  }

  private setCache(key: string, score: number): void {
    // Evict oldest entry if at capacity
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { score, expiresAt: Date.now() + this.CACHE_TTL_MS });
  }

  private async fallbackScore(userId: string, waitlistId: string): Promise<number> {
    const entry = await this.entryRepo.findOne({ where: { userId, waitlistId } });
    return entry ? Math.min(1, entry.priorityScore / 100) : 0;
  }
}
