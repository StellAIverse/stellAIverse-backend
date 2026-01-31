import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentsService } from './agents.service';
import { Agent, AgentCapability, AgentStatus } from './entities/agent.entity';
import { SearchAgentsDto, SortBy, SortOrder } from './dto/search-agents.dto';

describe('AgentsService', () => {
  let service: AgentsService;
  let repository: Repository<Agent>;

  const mockAgent: Agent = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Test Agent',
    description: 'A test agent for unit testing',
    capabilities: [AgentCapability.CODE_EXECUTION, AgentCapability.TEXT_GENERATION],
    status: AgentStatus.ACTIVE,
    averageRating: 4.5,
    totalRatings: 100,
    usageCount: 500,
    popularityScore: 85.5,
    metadata: {
      author: 'Test Author',
      version: '1.0.0',
      tags: ['test', 'ai'],
    },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-15'),
    lastUsedAt: new Date('2024-01-15'),
  };

  const mockQueryBuilder: any = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(1),
    getMany: jest.fn().mockResolvedValue([mockAgent]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        {
          provide: getRepositoryToken(Agent),
          useValue: {
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
            findOne: jest.fn(),
            find: jest.fn(),
            increment: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
    repository = module.get<Repository<Agent>>(getRepositoryToken(Agent));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchAgents', () => {
    it('should search agents with default parameters', async () => {
      const searchDto: SearchAgentsDto = {};

      const result = await service.searchAgents(searchDto);

      expect(result.data).toHaveLength(1);
      expect(result.meta.totalItems).toBe(1);
      expect(result.meta.currentPage).toBe(1);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
    });

    it('should search agents with query text', async () => {
      const searchDto: SearchAgentsDto = {
        query: 'test',
      };

      await service.searchAgents(searchDto);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(agent.name)'),
        expect.objectContaining({ query: '%test%' }),
      );
    });

    it('should filter by capabilities', async () => {
      const searchDto: SearchAgentsDto = {
        capabilities: [AgentCapability.CODE_EXECUTION],
      };

      await service.searchAgents(searchDto);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'agent.capabilities @> :capabilities',
        expect.objectContaining({ capabilities: [AgentCapability.CODE_EXECUTION] }),
      );
    });

    it('should filter by minimum rating', async () => {
      const searchDto: SearchAgentsDto = {
        minRating: 4.0,
      };

      await service.searchAgents(searchDto);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'agent.averageRating >= :minRating',
        expect.objectContaining({ minRating: 4.0 }),
      );
    });

    it('should filter by tags', async () => {
      const searchDto: SearchAgentsDto = {
        tags: ['ai', 'test'],
      };

      await service.searchAgents(searchDto);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "agent.metadata->'tags' ?| :tags",
        expect.objectContaining({ tags: ['ai', 'test'] }),
      );
    });

    it('should apply pagination', async () => {
      const searchDto: SearchAgentsDto = {
        page: 2,
        limit: 10,
      };

      await service.searchAgents(searchDto);

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });

    it('should sort by popularity', async () => {
      const searchDto: SearchAgentsDto = {
        sortBy: SortBy.POPULARITY,
        sortOrder: SortOrder.DESC,
      };

      await service.searchAgents(searchDto);

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('agent.popularityScore', 'DESC');
    });

    it('should sort by rating', async () => {
      const searchDto: SearchAgentsDto = {
        sortBy: SortBy.RATING,
      };

      await service.searchAgents(searchDto);

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('agent.averageRating', 'DESC');
      expect(mockQueryBuilder.addOrderBy).toHaveBeenCalledWith('agent.totalRatings', 'DESC');
    });

    it('should calculate correct pagination metadata', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(50);
      
      const searchDto: SearchAgentsDto = {
        page: 2,
        limit: 20,
      };

      const result = await service.searchAgents(searchDto);

      expect(result.meta.totalPages).toBe(3);
      expect(result.meta.hasNextPage).toBe(true);
      expect(result.meta.hasPreviousPage).toBe(true);
    });
  });

  describe('findOne', () => {
    it('should find an agent by id', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(mockAgent);

      const result = await service.findOne(mockAgent.id);

      expect(result).toEqual(mockAgent);
      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: mockAgent.id } });
    });

    it('should return null if agent not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(null);

      const result = await service.findOne('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('trackUsage', () => {
    it('should increment usage count and update last used timestamp', async () => {
      jest.spyOn(repository, 'increment').mockResolvedValue(undefined);
      jest.spyOn(repository, 'update').mockResolvedValue(undefined as any);
      jest.spyOn(repository, 'findOne').mockResolvedValue(mockAgent);

      await service.trackUsage(mockAgent.id);

      expect(repository.increment).toHaveBeenCalledWith(
        { id: mockAgent.id },
        'usageCount',
        1,
      );
      expect(repository.update).toHaveBeenCalledWith(
        mockAgent.id,
        expect.objectContaining({ lastUsedAt: expect.any(Date) }),
      );
    });
  });

  describe('updatePopularityScore', () => {
    it('should calculate and update popularity score', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(mockAgent);
      jest.spyOn(repository, 'update').mockResolvedValue(undefined as any);

      await service.updatePopularityScore(mockAgent.id);

      expect(repository.update).toHaveBeenCalledWith(
        mockAgent.id,
        expect.objectContaining({ popularityScore: expect.any(Number) }),
      );
    });

    it('should return early if agent not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(null);
      jest.spyOn(repository, 'update').mockResolvedValue(undefined as any);

      await service.updatePopularityScore('non-existent-id');

      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('updateAllPopularityScores', () => {
    it('should update popularity scores for all agents', async () => {
      const agents = [mockAgent, { ...mockAgent, id: 'another-id' }];
      jest.spyOn(repository, 'find').mockResolvedValue(agents);
      jest.spyOn(repository, 'findOne').mockResolvedValue(mockAgent);
      jest.spyOn(repository, 'update').mockResolvedValue(undefined as any);

      await service.updateAllPopularityScores();

      expect(repository.find).toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalledTimes(agents.length);
    });
  });
});