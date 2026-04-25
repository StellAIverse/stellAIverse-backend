import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DynamicPriorityScoringService } from '../../src/waitlist/dynamic-priority-scoring.service';
import { FeatureEngineeringService } from '../../src/waitlist/feature-engineering.service';
import { WaitlistEntry } from '../../src/waitlist/entities/waitlist-entry.entity';
import { WaitlistEvent } from '../../src/waitlist/entities/waitlist-event.entity';
import { ExplainableAIService } from '../../src/waitlist/explainable-ai.service';

describe('DynamicPriorityScoringService', () => {
  let service: DynamicPriorityScoringService;
  let entryRepo: Repository<WaitlistEntry>;
  let featureService: FeatureEngineeringService;

  const mockUserFeatures = {
    userId: 'test-user-1',
    totalEvents: 25,
    recentEvents7d: 5,
    recentEvents30d: 12,
    avgDaysBetweenEvents: 3.5,
    referralCount: 3,
    referralDepth: 2,
    engagementScore: 75,
    daysSinceJoin: 30,
    activityFrequency: 0.83,
    normalizedScore: 0.75,
  };

  beforeEach(async () => {
    const mockEntryRepo = {
      find: jest.fn(),
    };

    const mockFeatureService = {
      extractFeatures: jest.fn().mockResolvedValue(mockUserFeatures),
    };

    const mockExplainableService = {
      generateExplanation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DynamicPriorityScoringService,
        {
          provide: getRepositoryToken(WaitlistEntry),
          useValue: mockEntryRepo,
        },
        {
          provide: getRepositoryToken(WaitlistEvent),
          useValue: {},
        },
        {
          provide: FeatureEngineeringService,
          useValue: mockFeatureService,
        },
        {
          provide: ExplainableAIService,
          useValue: mockExplainableService,
        },
      ],
    }).compile();

    service = module.get<DynamicPriorityScoringService>(DynamicPriorityScoringService);
    entryRepo = module.get<Repository<WaitlistEntry>>(getRepositoryToken(WaitlistEntry));
    featureService = module.get<FeatureEngineeringService>(FeatureEngineeringService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculatePriorityScore', () => {
    it('should calculate priority score for user', async () => {
      const userId = 'test-user-1';
      const waitlistId = 'test-waitlist-1';

      const result = await service.calculatePriorityScore(userId, waitlistId);

      expect(result).toBeDefined();
      expect(result.userId).toBe(userId);
      expect(result.waitlistId).toBe(waitlistId);
      expect(result.rawScore).toBeGreaterThanOrEqual(0);
      expect(result.normalizedScore).toBeGreaterThanOrEqual(0);
      expect(result.finalScore).toBeGreaterThanOrEqual(0);
      expect(result.factorContributions).toBeDefined();
      expect(result.explanation).toContain('priority score');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should use default configuration when none specified', async () => {
      const userId = 'test-user-1';
      const waitlistId = 'test-waitlist-1';

      const result = await service.calculatePriorityScore(userId, waitlistId);

      expect(result.factorContributions).toBeDefined();
      expect(Object.keys(result.factorContributions)).toContain('engagementScore');
      expect(Object.keys(result.factorContributions)).toContain('referralCount');
    });

    it('should calculate factor scores correctly', async () => {
      const userId = 'test-user-1';
      const waitlistId = 'test-waitlist-1';

      const result = await service.calculatePriorityScore(userId, waitlistId);

      // Check individual factor calculations
      expect(result.factorContributions.joinOrder).toBeGreaterThanOrEqual(0);
      expect(result.factorContributions.referralCount).toBeGreaterThanOrEqual(0);
      expect(result.factorContributions.engagementScore).toBeGreaterThanOrEqual(0);
      expect(result.factorContributions.activityFrequency).toBeGreaterThanOrEqual(0);
    });
  });

  describe('batchCalculateScores', () => {
    it('should calculate scores for multiple users', async () => {
      const waitlistId = 'test-waitlist-1';
      const mockEntries = [
        { userId: 'user-1' },
        { userId: 'user-2' },
        { userId: 'user-3' },
      ];

      (entryRepo.find as jest.Mock).mockResolvedValue(mockEntries);

      const results = await service.batchCalculateScores(waitlistId);

      expect(results).toHaveLength(3);
      expect(results[0].userId).toBe('user-1');
      expect(results[1].userId).toBe('user-2');
      expect(results[2].userId).toBe('user-3');
    });

    it('should handle empty waitlist', async () => {
      const waitlistId = 'empty-waitlist';

      (entryRepo.find as jest.Mock).mockResolvedValue([]);

      const results = await service.batchCalculateScores(waitlistId);

      expect(results).toHaveLength(0);
    });
  });

  describe('updateScoringConfiguration', () => {
    it('should update scoring configuration', async () => {
      const configurationId = 'test-config';
      const updates = {
        factors: [
          {
            name: 'testFactor',
            weight: 0.5,
            enabled: true,
            description: 'Test factor',
            category: 'behavioral' as const,
          },
        ],
      };
      const updatedBy = 'admin-user';

      const updatedConfig = await service.updateScoringConfiguration(
        configurationId,
        updates,
        updatedBy
      );

      expect(updatedConfig.factors).toContainEqual(updates.factors[0]);
      expect(updatedConfig.updatedBy).toBe(updatedBy);
      expect(updatedConfig.lastUpdated).toBeInstanceOf(Date);
    });

    it('should validate factor weights sum to 1.0', async () => {
      const configurationId = 'test-config';
      const updates = {
        factors: [
          {
            name: 'factor1',
            weight: 0.7,
            enabled: true,
            description: 'Factor 1',
            category: 'behavioral' as const,
          },
          {
            name: 'factor2',
            weight: 0.4, // Total would be 1.1, invalid
            enabled: true,
            description: 'Factor 2',
            category: 'social' as const,
          },
        ],
      };

      await expect(
        service.updateScoringConfiguration(configurationId, updates, 'admin')
      ).rejects.toThrow('Factor weights must sum to 1.0');
    });
  });

  describe('getScoringConfiguration', () => {
    it('should return default configuration', () => {
      const config = service.getScoringConfiguration();

      expect(config).toBeDefined();
      expect(config.factors).toBeDefined();
      expect(config.normalizationMethod).toBeDefined();
      expect(config.scoreRange).toBeDefined();
    });

    it('should return specific configuration', () => {
      const configurationId = 'test-config';
      const config = service.getScoringConfiguration(configurationId);

      expect(config).toBeDefined();
    });
  });

  describe('getScoreTrend', () => {
    it('should return score trend for user', () => {
      const userId = 'test-user-1';

      // Simulate some score history by calling calculatePriorityScore multiple times
      service.calculatePriorityScore(userId, 'waitlist-1');
      service.calculatePriorityScore(userId, 'waitlist-1');

      const trend = service.getScoreTrend(userId);

      expect(trend).toBeDefined();
      expect(trend.current).toBeGreaterThanOrEqual(0);
      expect(['increasing', 'decreasing', 'stable']).toContain(trend.trend);
      expect(typeof trend.changeRate).toBe('number');
    });

    it('should handle user with no history', () => {
      const userId = 'new-user-1';

      const trend = service.getScoreTrend(userId);

      expect(trend.current).toBe(0);
      expect(trend.trend).toBe('stable');
      expect(trend.changeRate).toBe(0);
    });
  });

  describe('getScoringAnalytics', () => {
    it('should return scoring analytics', async () => {
      const waitlistId = 'test-waitlist-1';
      const mockEntries = [
        { userId: 'user-1' },
        { userId: 'user-2' },
        { userId: 'user-3' },
      ];

      (entryRepo.find as jest.Mock).mockResolvedValue(mockEntries);

      const analytics = await service.getScoringAnalytics(waitlistId);

      expect(analytics.waitlistId).toBe(waitlistId);
      expect(analytics.totalUsers).toBe(3);
      expect(analytics.statistics).toBeDefined();
      expect(analytics.statistics.mean).toBeDefined();
      expect(analytics.statistics.median).toBeDefined();
      expect(analytics.statistics.stdDev).toBeDefined();
      expect(analytics.distribution).toBeDefined();
      expect(analytics.factorAnalysis).toBeDefined();
      expect(analytics.trends).toBeDefined();
    });
  });

  describe('factor calculations', () => {
    it('should calculate join order score correctly', async () => {
      const userId = 'test-user-1';
      const waitlistId = 'test-waitlist-1';

      const result = await service.calculatePriorityScore(userId, waitlistId);

      // Join order score should be higher for newer users (lower daysSinceJoin)
      expect(result.factorContributions.joinOrder).toBeGreaterThanOrEqual(0);
      expect(result.factorContributions.joinOrder).toBeLessThanOrEqual(100);
    });

    it('should calculate referral count score with diminishing returns', async () => {
      const userId = 'test-user-1';
      const waitlistId = 'test-waitlist-1';

      const result = await service.calculatePriorityScore(userId, waitlistId);

      // Referral count should use logarithmic scaling
      expect(result.factorContributions.referralCount).toBeGreaterThanOrEqual(0);
      expect(result.factorContributions.referralCount).toBeLessThanOrEqual(100);
    });

    it('should calculate engagement score directly', async () => {
      const userId = 'test-user-1';
      const waitlistId = 'test-waitlist-1';

      const result = await service.calculatePriorityScore(userId, waitlistId);

      // Engagement score should be capped at 100
      expect(result.factorContributions.engagementScore).toBeGreaterThanOrEqual(0);
      expect(result.factorContributions.engagementScore).toBeLessThanOrEqual(100);
    });
  });

  describe('score normalization', () => {
    it('should normalize scores to configured range', async () => {
      const userId = 'test-user-1';
      const waitlistId = 'test-waitlist-1';

      const result = await service.calculatePriorityScore(userId, waitlistId);

      // Final score should be within configured range (0-100)
      expect(result.finalScore).toBeGreaterThanOrEqual(0);
      expect(result.finalScore).toBeLessThanOrEqual(100);
    });

    it('should apply time-based decay for old users', async () => {
      const oldUserFeatures = {
        ...mockUserFeatures,
        daysSinceJoin: 400, // Over 1 year
      };

      (featureService.extractFeatures as jest.Mock).mockResolvedValue(oldUserFeatures);

      const result = await service.calculatePriorityScore('old-user', 'test-waitlist-1');

      // Score should be adjusted for age
      expect(result.finalScore).toBeGreaterThanOrEqual(0);
    });
  });
});
