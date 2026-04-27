import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PortfolioService } from '../../src/portfolio/services/portfolio.service';
import { Portfolio } from '../../src/portfolio/entities/portfolio.entity';
import { PortfolioAsset } from '../../src/portfolio/entities/portfolio-asset.entity';
import { OptimizationHistory } from '../../src/portfolio/entities/optimization-history.entity';
import { RiskProfile } from '../../src/portfolio/entities/risk-profile.entity';
import { CreatePortfolioDto } from '../../src/portfolio/dto/portfolio.dto';
import { OptimizationMethod } from '../../src/portfolio/entities/optimization-history.entity';

describe('PortfolioService', () => {
  let service: PortfolioService;
  let portfolioRepository: any;
  let assetRepository: any;
  let optimizationRepository: any;
  let riskProfileRepository: any;

  const mockPortfolio = {
    id: 'test-portfolio-1',
    userId: 'test-user-1',
    name: 'Test Portfolio',
    status: 'active',
    totalValue: 100000,
    currentAllocation: { AAPL: 30, MSFT: 70 },
    targetAllocation: null,
    assets: [],
    autoRebalanceEnabled: false,
    rebalanceThreshold: 5,
    save: jest.fn(),
  };

  const mockAsset = {
    id: 'asset-1',
    ticker: 'AAPL',
    name: 'Apple',
    quantity: 100,
    currentPrice: 150,
    value: 15000,
    allocationPercentage: 15,
    portfolioId: 'test-portfolio-1',
    save: jest.fn(),
  };

  beforeEach(async () => {
    portfolioRepository = {
      create: jest.fn().mockReturnValue(mockPortfolio),
      save: jest.fn().mockResolvedValue(mockPortfolio),
      findOne: jest.fn().mockResolvedValue(mockPortfolio),
      find: jest.fn().mockResolvedValue([mockPortfolio]),
    };

    assetRepository = {
      create: jest.fn().mockReturnValue(mockAsset),
      save: jest.fn().mockResolvedValue(mockAsset),
      find: jest.fn().mockResolvedValue([mockAsset]),
      findOne: jest.fn().mockResolvedValue(mockAsset),
    };

    optimizationRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    riskProfileRepository = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortfolioService,
        {
          provide: getRepositoryToken(Portfolio),
          useValue: portfolioRepository,
        },
        {
          provide: getRepositoryToken(PortfolioAsset),
          useValue: assetRepository,
        },
        {
          provide: getRepositoryToken(OptimizationHistory),
          useValue: optimizationRepository,
        },
        {
          provide: getRepositoryToken(RiskProfile),
          useValue: riskProfileRepository,
        },
      ],
    }).compile();

    service = module.get<PortfolioService>(PortfolioService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPortfolio', () => {
    it('should create a new portfolio', async () => {
      const dto: CreatePortfolioDto = {
        name: 'Test Portfolio',
        description: 'Test description',
      };

      const result = await service.createPortfolio(
        'test-user-1',
        dto,
      );

      expect(portfolioRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: dto.name,
          userId: 'test-user-1',
        }),
      );
      expect(portfolioRepository.save).toHaveBeenCalled();
      expect(result).toEqual(mockPortfolio);
    });
  });

  describe('getPortfolio', () => {
    it('should return a portfolio by ID', async () => {
      const result = await service.getPortfolio(
        'test-portfolio-1',
      );

      expect(portfolioRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'test-portfolio-1' },
        relations: expect.any(Array),
      });
      expect(result).toEqual(mockPortfolio);
    });

    it('should throw error if portfolio not found', async () => {
      portfolioRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getPortfolio('non-existent'),
      ).rejects.toThrow('Portfolio not found');
    });
  });

  describe('getUserPortfolios', () => {
    it('should return all portfolios for a user', async () => {
      const result = await service.getUserPortfolios(
        'test-user-1',
      );

      expect(portfolioRepository.find).toHaveBeenCalledWith({
        where: { userId: 'test-user-1' },
        relations: expect.any(Array),
        order: expect.any(Object),
      });
      expect(result).toEqual([mockPortfolio]);
    });
  });

  describe('addAsset', () => {
    it('should add an asset to portfolio', async () => {
      const result = await service.addAsset(
        'test-portfolio-1',
        'AAPL',
        'Apple',
        100,
        150,
        0,
      );

      expect(assetRepository.findOne).toHaveBeenCalled();
      expect(result).toEqual(mockAsset);
    });
  });

  describe('updateAssetPrice', () => {
    it('should update asset price', async () => {
      const newPrice = 160;

      const result = await service.updateAssetPrice(
        'asset-1',
        newPrice,
      );

      expect(assetRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
      });
      expect(result.currentPrice).toBeDefined();
    });
  });

  describe('runOptimization', () => {
    it('should run portfolio optimization', async () => {
      optimizationRepository.create.mockReturnValue({
        portfolioId: 'test-portfolio-1',
        method: OptimizationMethod.MEAN_VARIANCE,
        status: 'pending',
        parameters: {},
        suggestedAllocation: {},
        currentAllocation: mockPortfolio.currentAllocation,
        save: jest.fn(),
      });

      optimizationRepository.save
        .mockResolvedValueOnce({
          id: 'opt-1',
          portfolioId: 'test-portfolio-1',
          method: OptimizationMethod.MEAN_VARIANCE,
          status: 'in_progress',
          suggestedAllocation: {},
          parameters: {},
          currentAllocation: mockPortfolio.currentAllocation,
          save: jest.fn(),
        })
        .mockResolvedValueOnce({
          id: 'opt-1',
          status: 'completed',
          suggestedAllocation: { AAPL: 40, MSFT: 60 },
          expectedReturn: 0.08,
          expectedVolatility: 0.15,
          expectedSharpeRatio: 0.5,
          improvementScore: 10,
          completedAt: new Date(),
        });

      assetRepository.save.mockResolvedValue([mockAsset]);

      const result = await service.runOptimization(
        'test-portfolio-1',
        {
          method: OptimizationMethod.MEAN_VARIANCE,
          portfolioId: 'test-portfolio-1',
        },
      );

      expect(result.status).toBe('completed');
    });
  });
});
