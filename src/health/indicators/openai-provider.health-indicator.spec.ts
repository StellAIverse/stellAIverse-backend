import { Test, TestingModule } from "@nestjs/testing";
import { OpenAIProviderHealthIndicator } from "./openai-provider.health-indicator";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { HealthCheckError } from "@nestjs/terminus";
import { of, throwError } from "rxjs";

describe("OpenAIProviderHealthIndicator", () => {
  let indicator: OpenAIProviderHealthIndicator;
  let httpService: HttpService;
  let configService: ConfigService;

  const mockHttpService = {
    get: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAIProviderHealthIndicator,
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

    indicator = module.get<OpenAIProviderHealthIndicator>(
      OpenAIProviderHealthIndicator,
    );
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);

    jest.clearAllMocks();
  });

  describe("isHealthy", () => {
    it("should return healthy with warning when API key is not configured", async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const result = await indicator.isHealthy("openai");

      expect(result.openai.status).toBe("up");
      expect(result.openai.configured).toBe(false);
      expect(result.openai.message).toContain("not configured");
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });

    it("should return healthy when OpenAI API responds with 200", async () => {
      mockConfigService.get.mockReturnValue("test-api-key");
      mockHttpService.get.mockReturnValue(of({ status: 200, data: {} }));

      const result = await indicator.isHealthy("openai");

      expect(result.openai.status).toBe("up");
      expect(result.openai.configured).toBe(true);
      expect(result.openai.message).toBe("OpenAI API is accessible");
      expect(mockHttpService.get).toHaveBeenCalledWith(
        "https://api.openai.com/v1/models",
        {
          headers: { Authorization: "Bearer test-api-key" },
          timeout: 5000,
        },
      );
    });

    it("should throw HealthCheckError when OpenAI API returns non-200 status", async () => {
      mockConfigService.get.mockReturnValue("test-api-key");
      mockHttpService.get.mockReturnValue(of({ status: 500, data: {} }));

      await expect(indicator.isHealthy("openai")).rejects.toThrow(
        HealthCheckError,
      );
    });

    it("should throw HealthCheckError when HTTP request fails", async () => {
      mockConfigService.get.mockReturnValue("test-api-key");
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error("Network error")),
      );

      await expect(indicator.isHealthy("openai")).rejects.toThrow(
        HealthCheckError,
      );
    });

    it("should include error message in failed health check", async () => {
      const errorMessage = "Connection timeout";
      mockConfigService.get.mockReturnValue("test-api-key");
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error(errorMessage)),
      );

      try {
        await indicator.isHealthy("openai");
        fail("Expected HealthCheckError to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HealthCheckError);
        expect(error.causes.openai.message).toContain(errorMessage);
        expect(error.causes.openai.configured).toBe(true);
      }
    });
  });
});
