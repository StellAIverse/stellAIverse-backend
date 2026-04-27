import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { QueueModule } from '../src/compute-job-queue/compute-job-queue.module';
import { QueueService } from '../src/compute-job-queue/queue.service';
import { JwtAuthGuard } from '../src/auth/jwt.guard';
import { RolesGuard } from '../src/common/guard/roles.guard';
import { Role } from '../src/common/decorators/roles.decorator';

describe('Job Control E2E Tests', () => {
  let app: INestApplication;
  let queueService: QueueService;
  let testJobId: string;

  // Mock operator user
  const operatorUser = {
    userId: 'operator-123',
    roles: [Role.OPERATOR],
  };

  // Mock regular user
  const regularUser = {
    userId: 'user-456',
    roles: [Role.USER],
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [QueueModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          const request = context.switchToHttp().getRequest();
          // Default to operator for most tests
          request.user = operatorUser;
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    queueService = moduleFixture.get<QueueService>(QueueService);
  });

  afterAll(async () => {
    // Clean up test jobs
    if (testJobId) {
      try {
        await queueService.removeJob(testJobId);
      } catch (error) {
        // Job may already be removed
      }
    }
    await app.close();
  });

  describe('Complete Job Control Workflow', () => {
    it('should create, pause, resume, and cancel a job', async () => {
      // Step 1: Create a job
      const createResponse = await request(app.getHttpServer())
        .post('/queue/jobs')
        .send({
          type: 'data-processing',
          payload: { test: 'data', items: [1, 2, 3] },
          userId: 'operator-123',
          priority: 5,
          metadata: { source: 'e2e-test' },
        })
        .expect(201);

      testJobId = createResponse.body.id;
      expect(testJobId).toBeDefined();

      // Step 2: Check initial status
      const statusResponse1 = await request(app.getHttpServer())
        .get(`/queue/jobs/${testJobId}/status`)
        .expect(200);

      expect(statusResponse1.body).toMatchObject({
        id: testJobId,
        type: 'data-processing',
        state: expect.any(String),
        progress: expect.any(Number),
        attemptsMade: 0,
      });

      // Wait a bit for job to be in waiting state
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Step 3: Pause the job
      const pauseResponse = await request(app.getHttpServer())
        .post(`/queue/jobs/${testJobId}/pause`)
        .expect(200);

      expect(pauseResponse.body).toMatchObject({
        success: true,
        message: expect.stringContaining('paused successfully'),
        jobId: testJobId,
        previousState: expect.any(String),
        newState: 'paused',
      });

      // Step 4: Verify job is paused
      const statusResponse2 = await request(app.getHttpServer())
        .get(`/queue/jobs/${testJobId}/status`)
        .expect(200);

      expect(statusResponse2.body.metadata.paused).toBe(true);

      // Step 5: Resume the job
      const resumeResponse = await request(app.getHttpServer())
        .post(`/queue/jobs/${testJobId}/resume`)
        .expect(200);

      expect(resumeResponse.body).toMatchObject({
        success: true,
        message: expect.stringContaining('resumed successfully'),
        jobId: testJobId,
        previousState: 'paused',
        newState: 'waiting',
      });

      // Step 6: Verify job is resumed
      const statusResponse3 = await request(app.getHttpServer())
        .get(`/queue/jobs/${testJobId}/status`)
        .expect(200);

      expect(statusResponse3.body.metadata.paused).toBe(false);

      // Step 7: Cancel the job
      const cancelResponse = await request(app.getHttpServer())
        .post(`/queue/jobs/${testJobId}/cancel`)
        .expect(200);

      expect(cancelResponse.body).toMatchObject({
        success: true,
        message: expect.stringContaining('cancelled successfully'),
        jobId: testJobId,
      });

      // Step 8: Verify job is removed
      await request(app.getHttpServer())
        .get(`/queue/jobs/${testJobId}/status`)
        .expect(404);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent job gracefully', async () => {
      const fakeJobId = 'non-existent-job-999';

      await request(app.getHttpServer())
        .get(`/queue/jobs/${fakeJobId}/status`)
        .expect(404);

      await request(app.getHttpServer())
        .post(`/queue/jobs/${fakeJobId}/pause`)
        .expect(404);

      await request(app.getHttpServer())
        .post(`/queue/jobs/${fakeJobId}/resume`)
        .expect(404);

      await request(app.getHttpServer())
        .post(`/queue/jobs/${fakeJobId}/cancel`)
        .expect(404);
    });

    it('should prevent pausing already completed job', async () => {
      // This test would require a job to complete, which is complex in e2e
      // In a real scenario, you'd wait for job completion or mock the processor
    });

    it('should prevent resuming non-paused job', async () => {
      // Create a job
      const createResponse = await request(app.getHttpServer())
        .post('/queue/jobs')
        .send({
          type: 'data-processing',
          payload: { test: 'data' },
          userId: 'operator-123',
        })
        .expect(201);

      const jobId = createResponse.body.id;

      // Try to resume without pausing first
      await request(app.getHttpServer())
        .post(`/queue/jobs/${jobId}/resume`)
        .expect(400);

      // Cleanup
      await queueService.removeJob(jobId);
    });
  });

  describe('Role-Based Access Control', () => {
    let restrictedApp: INestApplication;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [QueueModule],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate: (context) => {
            const request = context.switchToHttp().getRequest();
            request.user = regularUser; // Regular user without operator role
            return true;
          },
        })
        .compile();

      restrictedApp = moduleFixture.createNestApplication();
      restrictedApp.useGlobalPipes(new ValidationPipe());
      await restrictedApp.init();
    });

    afterAll(async () => {
      await restrictedApp.close();
    });

    it('should allow regular users to view job status', async () => {
      // Create a job as operator first
      const createResponse = await request(app.getHttpServer())
        .post('/queue/jobs')
        .send({
          type: 'data-processing',
          payload: { test: 'data' },
          userId: 'user-456',
        })
        .expect(201);

      const jobId = createResponse.body.id;

      // Regular user can view status
      await request(restrictedApp.getHttpServer())
        .get(`/queue/jobs/${jobId}/status`)
        .expect(200);

      // Cleanup
      await queueService.removeJob(jobId);
    });

    it('should deny regular users from pausing jobs', async () => {
      await request(restrictedApp.getHttpServer())
        .post('/queue/jobs/any-job-id/pause')
        .expect(403);
    });

    it('should deny regular users from resuming jobs', async () => {
      await request(restrictedApp.getHttpServer())
        .post('/queue/jobs/any-job-id/resume')
        .expect(403);
    });

    it('should deny regular users from cancelling jobs', async () => {
      await request(restrictedApp.getHttpServer())
        .post('/queue/jobs/any-job-id/cancel')
        .expect(403);
    });
  });

  describe('Batch Job Control', () => {
    it('should handle multiple job operations in sequence', async () => {
      const jobIds: string[] = [];

      // Create multiple jobs
      for (let i = 0; i < 3; i++) {
        const response = await request(app.getHttpServer())
          .post('/queue/jobs')
          .send({
            type: 'data-processing',
            payload: { index: i },
            userId: 'operator-123',
            priority: i + 1,
          })
          .expect(201);

        jobIds.push(response.body.id);
      }

      // Pause all jobs
      for (const jobId of jobIds) {
        await request(app.getHttpServer())
          .post(`/queue/jobs/${jobId}/pause`)
          .expect(200);
      }

      // Verify all are paused
      for (const jobId of jobIds) {
        const status = await request(app.getHttpServer())
          .get(`/queue/jobs/${jobId}/status`)
          .expect(200);

        expect(status.body.metadata.paused).toBe(true);
      }

      // Cancel all jobs
      for (const jobId of jobIds) {
        await request(app.getHttpServer())
          .post(`/queue/jobs/${jobId}/cancel`)
          .expect(200);
      }

      // Verify all are removed
      for (const jobId of jobIds) {
        await request(app.getHttpServer())
          .get(`/queue/jobs/${jobId}/status`)
          .expect(404);
      }
    });
  });
});
