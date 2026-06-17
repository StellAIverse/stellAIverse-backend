import { Test, TestingModule } from "@nestjs/testing";
import { HealthCheckError } from "@nestjs/terminus";
import { RiskManagementHealthIndicator } from "./risk-management.health";
import { CircuitBreakerService } from "../circuit-breaker.service";
import { EventEmitter2 } from "@nestjs/event-emitter";

describe("RiskManagementHealthIndicator", () => {
  let indicator: RiskManagementHealthIndicator;
  let circuitBreakerService: CircuitBreakerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskManagementHealthIndicator,
        CircuitBreakerService,
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    indicator = module.get<RiskManagementHealthIndicator>(
      RiskManagementHealthIndicator,
    );
    circuitBreakerService = module.get<CircuitBreakerService>(
      CircuitBreakerService,
    );
  });

  describe("isHealthy", () => {
    it("should return health status when no circuit breakers registered", async () => {
      const result = await indicator.isHealthy();
      expect(result).toBeDefined();
      expect(Object.keys(result).length).toBeGreaterThan(0);
    });

    it("should report healthy when all services are CLOSED", async () => {
      circuitBreakerService.registerService("service-1");
      circuitBreakerService.registerService("service-2");

      const result = await indicator.isHealthy();
      const indicatorResult = Object.values(result)[0] as any;
      expect(indicatorResult.status).toBe("up");
    });

    it("should throw HealthCheckError when any service circuit is OPEN", async () => {
      circuitBreakerService.registerService("service-1", {
        failureThreshold: 1,
      });
      circuitBreakerService.registerService("service-2");

      circuitBreakerService.recordFailure("service-1");

      try {
        await indicator.isHealthy();
        fail("Should have thrown HealthCheckError");
      } catch (error) {
        expect(error).toBeInstanceOf(HealthCheckError);
        expect(error.message).toContain(
          "Risk management circuit breaker is in OPEN state",
        );
      }
    });

    it("should work with multiple registered services", async () => {
      circuitBreakerService.registerService("service-1");
      circuitBreakerService.registerService("service-2");
      circuitBreakerService.registerService("service-3");

      circuitBreakerService.recordSuccess("service-1");
      circuitBreakerService.recordSuccess("service-2");
      circuitBreakerService.recordSuccess("service-3");

      const result = await indicator.isHealthy();
      const indicatorResult = Object.values(result)[0] as any;
      expect(indicatorResult.status).toBe("up");
    });

    it("should properly indicate health with failed services", async () => {
      circuitBreakerService.registerService("service-1", {
        failureThreshold: 1,
      });

      circuitBreakerService.recordFailure("service-1");

      try {
        await indicator.isHealthy();
        fail("Should have thrown HealthCheckError");
      } catch (error) {
        expect(error).toBeInstanceOf(HealthCheckError);
      }
    });

    it("should indicate healthy for HALF_OPEN state", async () => {
      circuitBreakerService.registerService("service-1", {
        failureThreshold: 1,
        recoveryTimeMs: 50,
      });

      circuitBreakerService.recordFailure("service-1");
      // Wait for transition to HALF_OPEN
      await new Promise((resolve) => setTimeout(resolve, 100));
      circuitBreakerService.isOpen("service-1"); // Trigger transition check

      const result = await indicator.isHealthy();
      const indicatorResult = Object.values(result)[0] as any;
      expect(indicatorResult.status).toBe("up");
    });
  });
});
