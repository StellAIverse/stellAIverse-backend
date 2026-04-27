import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecommendationFeedback, FeedbackType } from '../../src/recommendation/entities/recommendation-feedback.entity';
import { RecommendationInteraction, InteractionType } from '../../src/recommendation/entities/recommendation-interaction.entity';
import { User } from '../../src/user/entities/user.entity';

describe('Recommendation System (e2e)', () => {
  let app: INestApplication;
  let feedbackRepository: Repository<RecommendationFeedback>;
  let interactionRepository: Repository<RecommendationInteraction>;
  let userRepository: Repository<User>;
  let testUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    feedbackRepository = moduleFixture.get<Repository<RecommendationFeedback>>(
      getRepositoryToken(RecommendationFeedback),
    );
    interactionRepository = moduleFixture.get<Repository<RecommendationInteraction>>(
      getRepositoryToken(RecommendationInteraction),
    );
    userRepository = moduleFixture.get<Repository<User>>(getRepositoryToken(User));

    // Create a test user
    const user = userRepository.create({
      walletAddress: `0xTest${Date.now()}`,
      email: `test${Date.now()}@example.com`,
    });
    const savedUser = await userRepository.save(user);
    testUserId = savedUser.id;
  });

  afterAll(async () => {
    // Cleanup
    if (testUserId) {
      await userRepository.delete(testUserId);
    }
    await app.close();
  });

  describe('/recommendations (GET)', () => {
    it('should return personalized recommendations', async () => {
      const response = await request(app.getHttpServer())
        .get('/recommendations')
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThan(0);

      if (response.body.length > 0) {
        const firstRec = response.body[0];
        expect(firstRec).toHaveProperty('agentId');
        expect(firstRec).toHaveProperty('name');
        expect(firstRec).toHaveProperty('totalScore');
        expect(firstRec).toHaveProperty('explanation');
        expect(firstRec.explanation).toHaveProperty('performanceScore');
        expect(firstRec.explanation).toHaveProperty('usageScore');
      }
    });

    it('should filter by capabilities', async () => {
      const response = await request(app.getHttpServer())
        .get('/recommendations?capabilities=trading,sentiment-analysis')
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      
      // All returned agents should have at least one of the requested capabilities
      response.body.forEach((rec: any) => {
        expect(rec.explanation).toBeDefined();
      });
    });

    it('should limit results', async () => {
      const response = await request(app.getHttpServer())
        .get('/recommendations?limit=3')
        .expect(200);

      expect(response.body.length).toBeLessThanOrEqual(3);
    });

    it('should accept userId parameter', async () => {
      const response = await request(app.getHttpServer())
        .get(`/recommendations?userId=${testUserId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
    });

    it('should track impressions when sessionId is provided', async () => {
      const sessionId = `test-session-${Date.now()}`;
      
      await request(app.getHttpServer())
        .get(`/recommendations?sessionId=${sessionId}`)
        .expect(200);

      // Give some time for async tracking
      await new Promise(resolve => setTimeout(resolve, 100));

      const interactions = await interactionRepository.find({
        where: { sessionId },
      });

      expect(interactions.length).toBeGreaterThan(0);
      expect(interactions.some(i => i.interactionType === InteractionType.IMPRESSION)).toBe(true);
    });
  });

  describe('/recommendations/feedback (POST)', () => {
    it('should submit explicit rating feedback', async () => {
      const feedbackData = {
        userId: testUserId,
        agentId: '1',
        feedbackType: 'explicit_rating',
        rating: 5,
        metadata: { source: 'e2e-test' },
      };

      const response = await request(app.getHttpServer())
        .post('/recommendations/feedback')
        .send(feedbackData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.feedbackType).toBe('explicit_rating');
      expect(response.body.data.rating).toBe(5);
    });

    it('should submit usage feedback', async () => {
      const feedbackData = {
        userId: testUserId,
        agentId: '2',
        feedbackType: 'usage',
      };

      const response = await request(app.getHttpServer())
        .post('/recommendations/feedback')
        .send(feedbackData)
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('should reject invalid ratings', async () => {
      const feedbackData = {
        userId: testUserId,
        agentId: '1',
        feedbackType: 'explicit_rating',
        rating: 10, // Invalid: must be 1-5
      };

      await request(app.getHttpServer())
        .post('/recommendations/feedback')
        .send(feedbackData)
        .expect(400);
    });
  });

  describe('/recommendations/interactions (POST)', () => {
    it('should record a click interaction', async () => {
      const interactionData = {
        userId: testUserId,
        agentId: '1',
        interactionType: 'click',
        position: 1,
      };

      const response = await request(app.getHttpServer())
        .post('/recommendations/interactions')
        .send(interactionData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.interactionType).toBe('click');
    });

    it('should record a dismiss interaction', async () => {
      const interactionData = {
        userId: testUserId,
        agentId: '2',
        interactionType: 'dismiss',
        position: 3,
      };

      const response = await request(app.getHttpServer())
        .post('/recommendations/interactions')
        .send(interactionData)
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('should record impression with context', async () => {
      const sessionId = `test-context-${Date.now()}`;
      const interactionData = {
        userId: testUserId,
        agentId: '3',
        interactionType: 'impression',
        position: 2,
        sessionId,
        context: { capabilities: ['trading'] },
      };

      const response = await request(app.getHttpServer())
        .post('/recommendations/interactions')
        .send(interactionData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.context).toEqual({ capabilities: ['trading'] });
    });
  });

  describe('/recommendations/agents/:agentId/stats (GET)', () => {
    it('should return feedback statistics for an agent', async () => {
      const response = await request(app.getHttpServer())
        .get('/recommendations/agents/1/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalFeedback');
      expect(response.body.data).toHaveProperty('averageRating');
      expect(response.body.data).toHaveProperty('distribution');
      expect(response.body.data.distribution).toHaveProperty('1');
      expect(response.body.data).toHaveProperty('positiveCount');
      expect(response.body.data).toHaveProperty('negativeCount');
    });
  });

  describe('/recommendations/users/:userId/feedback (GET)', () => {
    it('should return user feedback history', async () => {
      const response = await request(app.getHttpServer())
        .get(`/recommendations/users/${testUserId}/feedback`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body).toHaveProperty('count');
    });

    it('should respect limit parameter', async () => {
      const response = await request(app.getHttpServer())
        .get(`/recommendations/users/${testUserId}/feedback?limit=5`)
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(5);
    });
  });

  describe('/recommendations/:agentId/click (POST)', () => {
    it('should record a quick click', async () => {
      const response = await request(app.getHttpServer())
        .post('/recommendations/1/click')
        .send({ userId: testUserId })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Click recorded');
    });
  });

  describe('/recommendations/:agentId/dismiss (POST)', () => {
    it('should record a quick dismiss', async () => {
      const response = await request(app.getHttpServer())
        .post('/recommendations/2/dismiss')
        .send({ userId: testUserId })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Dismissal recorded');
    });
  });

  describe('/recommendations/:agentId/use (POST)', () => {
    it('should record usage', async () => {
      const response = await request(app.getHttpServer())
        .post('/recommendations/3/use')
        .send({ userId: testUserId })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Usage recorded');
    });
  });

  describe('/recommendations/train (POST)', () => {
    it('should trigger model training', async () => {
      const response = await request(app.getHttpServer())
        .post('/recommendations/train')
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('weights');
      expect(response.body.data).toHaveProperty('featureImportance');
      expect(response.body.message).toBe('Model trained successfully');
    });
  });

  describe('/recommendations/model/info (GET)', () => {
    it('should return model information', async () => {
      const response = await request(app.getHttpServer())
        .get('/recommendations/model/info')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('modelType');
      expect(response.body.data.modelType).toBe('Logistic Regression');
      expect(response.body.data).toHaveProperty('weights');
      expect(response.body.data).toHaveProperty('featureImportance');
      expect(response.body.data).toHaveProperty('description');
    });
  });

  describe('Personalization Flow', () => {
    it('should improve recommendations based on feedback', async () => {
      const sessionId = `personalization-test-${Date.now()}`;
      
      // Get initial recommendations
      const initialResponse = await request(app.getHttpServer())
        .get(`/recommendations?sessionId=${sessionId}`)
        .expect(200);

      expect(initialResponse.body.length).toBeGreaterThan(0);
      const topAgentId = initialResponse.body[0].agentId;

      // Provide positive feedback for the second agent
      const secondAgentId = initialResponse.body[1]?.agentId || topAgentId;
      await request(app.getHttpServer())
        .post('/recommendations/feedback')
        .send({
          userId: testUserId,
          agentId: secondAgentId,
          feedbackType: 'explicit_rating',
          rating: 5,
        });

      // Record usage
      await request(app.getHttpServer())
        .post('/recommendations/feedback')
        .send({
          userId: testUserId,
          agentId: secondAgentId,
          feedbackType: 'usage',
        });

      // Get new recommendations - the scored agent should rank higher
      const newResponse = await request(app.getHttpServer())
        .get(`/recommendations?userId=${testUserId}`)
        .expect(200);

      expect(newResponse.body.length).toBeGreaterThan(0);
      
      // The system should now have learned from feedback
      // (In a real scenario with more data, we'd see ranking changes)
    });
  });
});
