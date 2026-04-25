import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExplainableAIService } from '../../src/waitlist/explainable-ai.service';
import { FeatureEngineeringService } from '../../src/waitlist/feature-engineering.service';
import { ModelTrainingService } from '../../src/waitlist/model-training.service';
import { WaitlistExplanation } from '../../src/waitlist/entities/explanation.entity';
import { AiAuditTrail } from '../../src/waitlist/entities/audit-trail.entity';
import { WaitlistEntry } from '../../src/waitlist/entities/waitlist-entry.entity';
import { ExplanationType } from '../../src/waitlist/entities/explanation.entity';

describe('ExplainableAIService', () => {
  let service: ExplainableAIService;
  let explanationRepo: Repository<WaitlistExplanation>;
  let auditRepo: Repository<AiAuditTrail>;
  let featureService: FeatureEngineeringService;
  let modelService: ModelTrainingService;

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

  const mockModelWeights = {
    version: '1.0.0',
    trainedAt: new Date(),
    weights: {
      normalizedScore: 0.4,
      referralDepth: 0.2,
      recentEvents7d: 0.15,
      recentEvents30d: 0.1,
      activityFrequency: 0.1,
      engagementScore: 0.05,
    },
    metrics: { accuracy: 0.85, sampleSize: 1000 },
  };

  beforeEach(async () => {
    const mockExplanationRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const mockAuditRepo = {
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockFeatureService = {
      extractFeatures: jest.fn().mockResolvedValue(mockUserFeatures),
    };

    const mockModelService = {
      predict: jest.fn().mockReturnValue(0.75),
      currentWeights: jest.fn().mockReturnValue(mockModelWeights),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExplainableAIService,
        {
          provide: getRepositoryToken(WaitlistExplanation),
          useValue: mockExplanationRepo,
        },
        {
          provide: getRepositoryToken(AiAuditTrail),
          useValue: mockAuditRepo,
        },
        {
          provide: getRepositoryToken(WaitlistEntry),
          useValue: {},
        },
        {
          provide: FeatureEngineeringService,
          useValue: mockFeatureService,
        },
        {
          provide: ModelTrainingService,
          useValue: mockModelService,
        },
      ],
    }).compile();

    service = module.get<ExplainableAIService>(ExplainableAIService);
    explanationRepo = module.get<Repository<WaitlistExplanation>>(getRepositoryToken(WaitlistExplanation));
    auditRepo = module.get<Repository<AiAuditTrail>>(getRepositoryToken(AiAuditTrail));
    featureService = module.get<FeatureEngineeringService>(FeatureEngineeringService);
    modelService = module.get<ModelTrainingService>(ModelTrainingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateExplanation', () => {
    it('should generate explanation for user priority score', async () => {
      const userId = 'test-user-1';
      const waitlistId = 'test-waitlist-1';
      const explanationType = ExplanationType.DECISION_EXPLANATION;

      const mockExplanation = {
        id: 'explanation-1',
        userId,
        waitlistId,
        explanationType,
        featureImportance: { normalizedScore: 0.4, referralDepth: 0.2 },
        naturalLanguageExplanation: 'Your priority score is influenced by...',
        confidenceScore: 0.85,
        uncertaintyQuantification: 0.15,
      };

      (explanationRepo.create as jest.Mock).mockReturnValue(mockExplanation);
      (explanationRepo.save as jest.Mock).mockResolvedValue(mockExplanation);

      const result = await service.generateExplanation(userId, waitlistId, explanationType);

      expect(result).toBeDefined();
      expect(result.explanation).toEqual(mockExplanation);
      expect(result.featureImportance).toBeDefined();
      expect(result.confidenceScore).toBeGreaterThan(0);
      expect(result.naturalLanguageExplanation).toContain('priority score');
      expect(result.alternativeScenarios).toBeDefined();

      expect(featureService.extractFeatures).toHaveBeenCalledWith(userId, waitlistId);
      expect(modelService.predict).toHaveBeenCalledWith(mockUserFeatures);
      expect(explanationRepo.save).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const userId = 'test-user-1';
      const waitlistId = 'test-waitlist-1';

      (featureService.extractFeatures as jest.Mock).mockRejectedValue(new Error('Feature extraction failed'));

      await expect(service.generateExplanation(userId, waitlistId)).rejects.toThrow('Feature extraction failed');
      expect(auditRepo.save).toHaveBeenCalled();
    });

    it('should calculate feature importance correctly', async () => {
      const userId = 'test-user-1';
      const waitlistId = 'test-waitlist-1';

      await service.generateExplanation(userId, waitlistId);

      // Verify that feature importance is calculated
      expect(modelService.predict).toHaveBeenCalled();
      
      // The result should contain feature importance
      const explanation = (explanationRepo.create as jest.Mock).mock.calls[0][0];
      expect(explanation.featureImportance).toBeDefined();
      expect(Object.keys(explanation.featureImportance)).toContain('normalizedScore');
    });
  });

  describe('fileAppeal', () => {
    it('should file an appeal successfully', async () => {
      const appealRequest = {
        userId: 'test-user-1',
        waitlistId: 'test-waitlist-1',
        explanationId: 'explanation-1',
        reason: 'Score seems too low',
        expectedOutcome: 'Higher priority',
      };

      const mockExplanation = {
        id: 'explanation-1',
        userId: 'test-user-1',
        isAppealed: false,
        appealStatus: null,
      };

      (explanationRepo.findOne as jest.Mock).mockResolvedValue(mockExplanation);
      (explanationRepo.save as jest.Mock).mockResolvedValue({
        ...mockExplanation,
        isAppealed: true,
        appealStatus: 'pending',
      });

      const result = await service.fileAppeal(appealRequest);

      expect(result.appealId).toBe('explanation-1');
      expect(result.status).toBe('pending');
      expect(explanationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isAppealed: true,
          appealReason: appealRequest.reason,
          appealStatus: 'pending',
        })
      );
    });

    it('should throw error if explanation not found', async () => {
      const appealRequest = {
        userId: 'test-user-1',
        waitlistId: 'test-waitlist-1',
        explanationId: 'non-existent',
        reason: 'Score seems too low',
      };

      (explanationRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.fileAppeal(appealRequest)).rejects.toThrow('Explanation not found or access denied');
    });
  });

  describe('getBiasDetectionMetrics', () => {
    it('should return bias detection metrics', async () => {
      const waitlistId = 'test-waitlist-1';
      const mockExplanations = [
        {
          predictionScore: 0.75,
          featureImportance: { normalizedScore: 0.4, referralDepth: 0.2 },
        },
        {
          predictionScore: 0.80,
          featureImportance: { normalizedScore: 0.35, referralDepth: 0.25 },
        },
      ];

      (explanationRepo.find as jest.Mock).mockResolvedValue(mockExplanations);

      const metrics = await service.getBiasDetectionMetrics(waitlistId);

      expect(metrics.waitlistId).toBe(waitlistId);
      expect(metrics.totalExplanations).toBe(2);
      expect(metrics.averageScore).toBeCloseTo(0.775, 2);
      expect(metrics.featureDistributions).toBeDefined();
      expect(metrics.biasIndicators).toBeDefined();
    });

    it('should handle empty explanations gracefully', async () => {
      const waitlistId = 'test-waitlist-1';

      (explanationRepo.find as jest.Mock).mockResolvedValue([]);

      const metrics = await service.getBiasDetectionMetrics(waitlistId);

      expect(metrics.waitlistId).toBe(waitlistId);
      expect(metrics.totalExplanations).toBe(0);
      expect(metrics.averageScore).toBe(0);
    });
  });

  describe('getUserExplanationHistory', () => {
    it('should return user explanation history', async () => {
      const userId = 'test-user-1';
      const waitlistId = 'test-waitlist-1';
      const limit = 5;

      const mockHistory = [
        { id: 'exp-1', userId, waitlistId, createdAt: new Date('2023-01-01') },
        { id: 'exp-2', userId, waitlistId, createdAt: new Date('2023-01-02') },
      ];

      (explanationRepo.find as jest.Mock).mockResolvedValue(mockHistory);

      const history = await service.getUserExplanationHistory(userId, waitlistId, limit);

      expect(history).toEqual(mockHistory);
      expect(explanationRepo.find).toHaveBeenCalledWith({
        where: { userId, waitlistId },
        order: { createdAt: 'DESC' },
        take: limit,
      });
    });
  });

  describe('calculateConfidenceScore', () => {
    it('should calculate confidence based on feature stability', async () => {
      const userId = 'test-user-1';
      const waitlistId = 'test-waitlist-1';

      const result = await service.generateExplanation(userId, waitlistId);

      expect(result.confidenceScore).toBeGreaterThan(0);
      expect(result.confidenceScore).toBeLessThanOrEqual(1);
    });

    it('should adjust confidence for low data volume', async () => {
      const lowDataFeatures = {
        ...mockUserFeatures,
        totalEvents: 2, // Low data points
      };

      (featureService.extractFeatures as jest.Mock).mockResolvedValue(lowDataFeatures);

      const result = await service.generateExplanation('test-user-1', 'test-waitlist-1');

      // Confidence should be lower for low data volume
      expect(result.confidenceScore).toBeLessThan(0.8);
    });
  });

  describe('generateAlternativeScenarios', () => {
    it('should generate what-if scenarios', async () => {
      const userId = 'test-user-1';
      const waitlistId = 'test-waitlist-1';

      const result = await service.generateExplanation(userId, waitlistId);

      expect(result.alternativeScenarios).toBeDefined();
      expect(result.alternativeScenarios.more_referrals).toBeDefined();
      expect(result.alternativeScenarios.more_activity).toBeDefined();
      expect(result.alternativeScenarios.optimal_engagement).toBeDefined();
    });
  });
});
