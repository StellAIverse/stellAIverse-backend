import { Test, TestingModule } from "@nestjs/testing";
import { HealthService } from "./health.service";

describe("HealthService", () => {
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  describe("getLivenessStatus", () => {
    it("should return alive status with timestamp and uptime", () => {
      const result = service.getLivenessStatus();

      expect(result).toEqual({
        status: "alive",
        timestamp: expect.any(String),
        uptime: expect.any(Number),
      });
    });

    it("should return valid ISO timestamp", () => {
      const result = service.getLivenessStatus();
      const date = new Date(result.timestamp);
      expect(date.toISOString()).toBe(result.timestamp);
    });
  });

  describe("getHealthStatus", () => {
    it("should return ok status with all required fields", () => {
      const result = service.getHealthStatus();

      expect(result).toEqual({
        status: "ok",
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
      });
    });

    it("should return version from environment or default", () => {
      const result = service.getHealthStatus();
      expect(result.version).toBeDefined();
    });
  });

  describe("getMemoryStats", () => {
    it("should return memory usage statistics", () => {
      const result = service.getMemoryStats();

      expect(result).toHaveProperty("rss");
      expect(result).toHaveProperty("heapTotal");
      expect(result).toHaveProperty("heapUsed");
      expect(result).toHaveProperty("external");

      // All values should be strings ending with MB
      expect(result.rss).toMatch(/^\d+MB$/);
      expect(result.heapTotal).toMatch(/^\d+MB$/);
      expect(result.heapUsed).toMatch(/^\d+MB$/);
      expect(result.external).toMatch(/^\d+MB$/);
    });
  });
});
