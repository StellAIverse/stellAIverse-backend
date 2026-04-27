import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";
import { QueueController } from "./compute-job-queue.controller";
import { QueueService } from "./queue.service";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { RolesGuard } from "../common/guard/roles.guard";

describe("Job Control API (Integration)", () => {
  let app: INestApplication;
  let queueService: QueueService;

  const mockQueueService = {
    getDetailedJobStatus: jest.fn(),
    pauseJob: jest.fn(),
    resumeJob: jest.fn(),
    cancelJob: jest.fn(),
  };

  // Mock authenticated user with operator role
  const mockUser = {
    userId: "user-123",
    roles: ["operator"],
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [QueueController],
      providers: [
        {
          provide: QueueService,
          useValue: mockQueueService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          const request = context.switchToHttp().getRequest();
          request.user = mockUser;
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: () => true,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    queueService = moduleFixture.get<QueueService>(QueueService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /queue/jobs/:id/status", () => {
    it("should return detailed job status", async () => {
      const mockStatus = {
        id: "test-job-123",
        type: "data-processing",
        state: "active",
        progress: 45,
        attemptsMade: 1,
        createdAt: "2026-02-25T10:00:00Z",
        metadata: { userId: "user-123" },
      };

      mockQueueService.getDetailedJobStatus.mockResolvedValue(mockStatus);

      const response = await request(app.getHttpServer())
        .get("/queue/jobs/test-job-123/status")
        .expect(200);

      expect(response.body).toEqual(mockStatus);
      expect(mockQueueService.getDetailedJobStatus).toHaveBeenCalledWith(
        "test-job-123",
      );
    });

    it("should return 404 for non-existent job", async () => {
      mockQueueService.getDetailedJobStatus.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get("/queue/jobs/non-existent/status")
        .expect(404);
    });
  });

  describe("POST /queue/jobs/:id/pause", () => {
    it("should pause a job successfully", async () => {
      mockQueueService.pauseJob.mockResolvedValue({
        previousState: "waiting",
        newState: "paused",
      });

      const response = await request(app.getHttpServer())
        .post("/queue/jobs/test-job-123/pause")
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: "Job test-job-123 paused successfully",
        jobId: "test-job-123",
        previousState: "waiting",
        newState: "paused",
      });
      expect(mockQueueService.pauseJob).toHaveBeenCalledWith("test-job-123");
    });

    it("should return 404 for non-existent job", async () => {
      mockQueueService.pauseJob.mockRejectedValue(
        new Error("Job non-existent not found"),
      );

      await request(app.getHttpServer())
        .post("/queue/jobs/non-existent/pause")
        .expect(404);
    });

    it("should return 400 when job cannot be paused", async () => {
      mockQueueService.pauseJob.mockRejectedValue(
        new Error("Cannot pause job in state: active"),
      );

      await request(app.getHttpServer())
        .post("/queue/jobs/test-job-123/pause")
        .expect(400);
    });
  });

  describe("POST /queue/jobs/:id/resume", () => {
    it("should resume a paused job successfully", async () => {
      mockQueueService.resumeJob.mockResolvedValue({
        previousState: "paused",
        newState: "waiting",
      });

      const response = await request(app.getHttpServer())
        .post("/queue/jobs/test-job-123/resume")
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: "Job test-job-123 resumed successfully",
        jobId: "test-job-123",
        previousState: "paused",
        newState: "waiting",
      });
      expect(mockQueueService.resumeJob).toHaveBeenCalledWith("test-job-123");
    });

    it("should return 404 for non-existent job", async () => {
      mockQueueService.resumeJob.mockRejectedValue(
        new Error("Job non-existent not found"),
      );

      await request(app.getHttpServer())
        .post("/queue/jobs/non-existent/resume")
        .expect(404);
    });

    it("should return 400 when job is not paused", async () => {
      mockQueueService.resumeJob.mockRejectedValue(
        new Error("Job test-job-123 is not paused"),
      );

      await request(app.getHttpServer())
        .post("/queue/jobs/test-job-123/resume")
        .expect(400);
    });
  });

  describe("POST /queue/jobs/:id/cancel", () => {
    it("should cancel a job successfully", async () => {
      mockQueueService.cancelJob.mockResolvedValue({
        previousState: "waiting",
      });

      const response = await request(app.getHttpServer())
        .post("/queue/jobs/test-job-123/cancel")
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: "Job test-job-123 cancelled successfully",
        jobId: "test-job-123",
        previousState: "waiting",
        newState: undefined,
      });
      expect(mockQueueService.cancelJob).toHaveBeenCalledWith("test-job-123");
    });

    it("should return 404 for non-existent job", async () => {
      mockQueueService.cancelJob.mockRejectedValue(
        new Error("Job non-existent not found"),
      );

      await request(app.getHttpServer())
        .post("/queue/jobs/non-existent/cancel")
        .expect(404);
    });

    it("should return 400 when job cannot be cancelled", async () => {
      mockQueueService.cancelJob.mockRejectedValue(
        new Error("Cannot cancel completed job test-job-123"),
      );

      await request(app.getHttpServer())
        .post("/queue/jobs/test-job-123/cancel")
        .expect(400);
    });
  });

  describe("Authorization", () => {
    let restrictedApp: INestApplication;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        controllers: [QueueController],
        providers: [
          {
            provide: QueueService,
            useValue: mockQueueService,
          },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate: (context) => {
            const request = context.switchToHttp().getRequest();
            request.user = { userId: "user-456", roles: ["user"] }; // Regular user
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

    it("should deny access to pause endpoint for regular users", async () => {
      await request(restrictedApp.getHttpServer())
        .post("/queue/jobs/test-job-123/pause")
        .expect(403);
    });

    it("should deny access to resume endpoint for regular users", async () => {
      await request(restrictedApp.getHttpServer())
        .post("/queue/jobs/test-job-123/resume")
        .expect(403);
    });

    it("should deny access to cancel endpoint for regular users", async () => {
      await request(restrictedApp.getHttpServer())
        .post("/queue/jobs/test-job-123/cancel")
        .expect(403);
    });
  });
});
