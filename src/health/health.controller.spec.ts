import { Test, TestingModule } from "@nestjs/testing";
import { HealthCheckService, TerminusModule } from "@nestjs/terminus";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { DatabaseHealthIndicator } from "./indicators/database.health-indicator";
import { QueueHealthIndicator } from "./indicators/queue.health-indicator";
import { OpenAIProviderHealthIndicator } from "./indicators/openai-provider.health-indicator";
import { DataSource } from "typeorm";
import { QueueService } from "../compute-job-queue/queue.service";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";

describe("HealthController", () => {
  let controller: HealthController;
  let healthService: HealthService;
  let healthCheckService: HealthCheckService;

  const mockDataSource = {
    query: jest.fn(),
  };

  const mockQueueService = {
    isRedisHealthy: jest.fn(),
    getQueueStats: jest.fn(),
  };

  const mockHttpService = {
    get: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        HealthService,
        DatabaseHealthIndicator,
        QueueHealthIndicator,
        OpenAIProviderHealthIndicator,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: QueueService,
          useValue: mockQueueService,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthService = module.get<HealthService>(HealthService);
    healthCheckService = module.get<HealthCheckService>(HealthCheckService);

    jest.clearAllMocks();
  });

  describe("getLiveness", () => {
    it("should return liveness status", () => {
      const result = controller.getLiveness();

      expect(result).toHaveProperty("status", "alive");
      expect(result).toHaveProperty("timestamp");
      expect(result).toHaveProperty("uptime");
      expect(typeof result.timestamp).toBe("string");
      expect(typeof result.uptime).toBe("number");
    });
  });

  describe("getHealth", () => {
    it("should return health status", () => {
      const result = controller.getHealth();

      expect(result).toHaveProperty("status", "ok");
      expect(result).toHaveProperty("timestamp");
      expect(result).toHaveProperty("uptime");
      expect(result).toHaveProperty("version");
    });
  });

  describe("getReadiness", () => {
    it("should call health.check with all indicators", async () => {
      const checkSpy = jest
        .spyOn(healthCheckService, "check")
        .mockResolvedValue({
          status: "ok",
          info: {},
          error: {},
          details: {},
        });

      await controller.getReadiness();

      expect(checkSpy).toHaveBeenCalledWith([
        expect.any(Function),
        expect.any(Function),
        expect.any(Function),
      ]);
    });
  });
});
