import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";
import { BullModule } from "@nestjs/bull";
import { QueueModule } from "./queue.module";
import { QueueController } from "./queue.controller";

describe("QueueController (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        BullModule.forRoot({
          redis: {
            host: process.env.REDIS_HOST || "localhost",
            port: parseInt(process.env.REDIS_PORT || "6379"),
            db: 15, // Use separate DB for testing
          },
        }),
        QueueModule,
      ],
      controllers: [QueueController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /queue/jobs", () => {
    it("should create a new job", () => {
      return request(app.getHttpServer())
        .post("/queue/jobs")
        .send({
          type: "data-processing",
          payload: { test: "data" },
          userId: "test-user",
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty("id");
          expect(res.body.type).toBe("data-processing");
          expect(res.body.status).toBeDefined();
        });
    });

    it("should validate job creation request", () => {
      return request(app.getHttpServer())
        .post("/queue/jobs")
        .send({
          // Missing required fields
          payload: {},
        })
        .expect(400);
    });
  });

  describe("POST /queue/jobs/delayed", () => {
    it("should create a delayed job", () => {
      return request(app.getHttpServer())
        .post("/queue/jobs/delayed")
        .send({
          type: "data-processing",
          payload: { test: "delayed" },
          delayMs: 5000,
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty("id");
          expect(res.body.type).toBe("data-processing");
        });
    });

    it("should validate delay value", () => {
      return request(app.getHttpServer())
        .post("/queue/jobs/delayed")
        .send({
          type: "data-processing",
          payload: {},
          delayMs: -1000, // Invalid negative delay
        })
        .expect(400);
    });
  });

  describe("POST /queue/jobs/recurring", () => {
    it("should create a recurring job", () => {
      return request(app.getHttpServer())
        .post("/queue/jobs/recurring")
        .send({
          type: "data-processing",
          payload: { test: "recurring" },
          cronExpression: "0 0 * * *",
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty("id");
          expect(res.body.type).toBe("data-processing");
        });
    });
  });

  describe("GET /queue/jobs/:id", () => {
    it("should retrieve a job by ID", async () => {
      // First create a job
      const createResponse = await request(app.getHttpServer())
        .post("/queue/jobs")
        .send({
          type: "data-processing",
          payload: { test: "data" },
        });

      const jobId = createResponse.body.id;

      // Then retrieve it
      return request(app.getHttpServer())
        .get(`/queue/jobs/${jobId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(jobId);
          expect(res.body.type).toBe("data-processing");
        });
    });

    it("should return 500 for non-existent job", () => {
      return request(app.getHttpServer())
        .get("/queue/jobs/non-existent-id")
        .expect(500);
    });
  });

  describe("GET /queue/jobs/:id/status", () => {
    it("should retrieve job status", async () => {
      const createResponse = await request(app.getHttpServer())
        .post("/queue/jobs")
        .send({
          type: "data-processing",
          payload: {},
        });

      const jobId = createResponse.body.id;

      return request(app.getHttpServer())
        .get(`/queue/jobs/${jobId}/status`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("status");
          expect([
            "waiting",
            "active",
            "completed",
            "failed",
            "delayed",
          ]).toContain(res.body.status);
        });
    });
  });

  describe("DELETE /queue/jobs/:id", () => {
    it("should remove a job", async () => {
      const createResponse = await request(app.getHttpServer())
        .post("/queue/jobs")
        .send({
          type: "data-processing",
          payload: {},
        });

      const jobId = createResponse.body.id;

      return request(app.getHttpServer())
        .delete(`/queue/jobs/${jobId}`)
        .expect(204);
    });
  });

  describe("POST /queue/jobs/:id/retry", () => {
    it("should retry a job", async () => {
      const createResponse = await request(app.getHttpServer())
        .post("/queue/jobs")
        .send({
          type: "email-notification",
          payload: {}, // Will fail due to missing 'to' field
        });

      const jobId = createResponse.body.id;

      // Wait a bit for the job to process and potentially fail
      await new Promise((resolve) => setTimeout(resolve, 3000));

      return request(app.getHttpServer())
        .post(`/queue/jobs/${jobId}/retry`)
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toContain("queued for retry");
        });
    }, 10000);
  });

  describe("GET /queue/stats", () => {
    it("should return queue statistics", () => {
      return request(app.getHttpServer())
        .get("/queue/stats")
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("compute");
          expect(res.body.compute).toHaveProperty("waiting");
          expect(res.body.compute).toHaveProperty("active");
          expect(res.body.compute).toHaveProperty("completed");
          expect(res.body.compute).toHaveProperty("failed");
          expect(res.body.compute).toHaveProperty("delayed");
          expect(res.body).toHaveProperty("deadLetter");
        });
    });
  });

  describe("GET /queue/failed", () => {
    it("should return failed jobs", () => {
      return request(app.getHttpServer())
        .get("/queue/failed")
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it("should support pagination", () => {
      return request(app.getHttpServer())
        .get("/queue/failed?start=0&end=5")
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  describe("GET /queue/dead-letter", () => {
    it("should return dead letter jobs", () => {
      return request(app.getHttpServer())
        .get("/queue/dead-letter")
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  describe("POST /queue/pause", () => {
    it("should pause the queue", () => {
      return request(app.getHttpServer())
        .post("/queue/pause")
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toBe("Queue paused");
        });
    });
  });

  describe("POST /queue/resume", () => {
    it("should resume the queue", () => {
      return request(app.getHttpServer())
        .post("/queue/resume")
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toBe("Queue resumed");
        });
    });
  });

  describe("DELETE /queue/clean", () => {
    it("should clean old jobs", () => {
      return request(app.getHttpServer()).delete("/queue/clean").expect(204);
    });

    it("should accept custom grace period", () => {
      return request(app.getHttpServer())
        .delete("/queue/clean?grace=3600000")
        .expect(204);
    });
  });
});
