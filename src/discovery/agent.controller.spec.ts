import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AgentsModule } from './agents.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Agent, AgentCapability, AgentStatus } from './entities/agent.entity';

describe('AgentsController (e2e)', () => {
  let app: INestApplication;

  const mockAgent: Agent = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Test Agent',
    description: 'A test agent for e2e testing',
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

  const mockRepository = {
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    findOne: jest.fn().mockResolvedValue(mockAgent),
    find: jest.fn().mockResolvedValue([mockAgent]),
    increment: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AgentsModule],
    })
      .overrideProvider(getRepositoryToken(Agent))
      .useValue(mockRepository)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('/agents/search (GET)', () => {
    it('should return paginated agents', () => {
      return request(app.getHttpServer())
        .get('/agents/search')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('meta');
          expect(Array.isArray(res.body.data)).toBe(true);
          expect(res.body.data).toHaveLength(1);
          expect(res.body.meta.totalItems).toBe(1);
        });
    });

    it('should search with query parameter', () => {
      return request(app.getHttpServer())
        .get('/agents/search?query=test')
        .expect(200)
        .expect((res) => {
          expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
        });
    });

    it('should filter by capabilities', () => {
      return request(app.getHttpServer())
        .get('/agents/search?capabilities=code_execution,text_generation')
        .expect(200);
    });

    it('should filter by status', () => {
      return request(app.getHttpServer())
        .get('/agents/search?status=active')
        .expect(200);
    });

    it('should filter by minimum rating', () => {
      return request(app.getHttpServer())
        .get('/agents/search?minRating=4.0')
        .expect(200);
    });

    it('should sort by popularity', () => {
      return request(app.getHttpServer())
        .get('/agents/search?sortBy=popularity&sortOrder=DESC')
        .expect(200);
    });

    it('should sort by rating', () => {
      return request(app.getHttpServer())
        .get('/agents/search?sortBy=rating')
        .expect(200);
    });

    it('should paginate results', () => {
      return request(app.getHttpServer())
        .get('/agents/search?page=2&limit=10')
        .expect(200)
        .expect((res) => {
          expect(res.body.meta.currentPage).toBe(2);
          expect(res.body.meta.itemsPerPage).toBe(10);
        });
    });

    it('should validate pagination parameters', () => {
      return request(app.getHttpServer())
        .get('/agents/search?page=0&limit=101')
        .expect(400);
    });

    it('should validate rating range', () => {
      return request(app.getHttpServer())
        .get('/agents/search?minRating=6')
        .expect(400);
    });
  });

  describe('/agents/:id (GET)', () => {
    it('should return an agent by id', () => {
      return request(app.getHttpServer())
        .get(`/agents/${mockAgent.id}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(mockAgent.id);
          expect(res.body.name).toBe(mockAgent.name);
        });
    });

    it('should return 404 if agent not found', () => {
      mockRepository.findOne.mockResolvedValueOnce(null);

      return request(app.getHttpServer())
        .get('/agents/non-existent-id')
        .expect(404);
    });
  });

  describe('/agents/:id/track-usage (POST)', () => {
    it('should track agent usage', () => {
      return request(app.getHttpServer())
        .post(`/agents/${mockAgent.id}/track-usage`)
        .expect(204);
    });

    it('should return 404 if agent not found', () => {
      mockRepository.findOne.mockResolvedValueOnce(null);

      return request(app.getHttpServer())
        .post('/agents/non-existent-id/track-usage')
        .expect(404);
    });
  });

  describe('/agents/update-popularity-scores (POST)', () => {
    it('should initiate popularity score update', () => {
      return request(app.getHttpServer())
        .post('/agents/update-popularity-scores')
        .expect(202)
        .expect((res) => {
          expect(res.body.message).toContain('initiated');
        });
    });
  });
});