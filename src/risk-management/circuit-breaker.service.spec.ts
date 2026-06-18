import { Test, TestingModule } from "@nestjs/testing";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { CircuitBreakerService, CircuitState } from "./circuit-breaker.service";

describe("CircuitBreakerService", () => {
  let service: CircuitBreakerService;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CircuitBreakerService,
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CircuitBreakerService>(CircuitBreakerService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("registerService", () => {
    it("should register a service with default config", () => {
      service.registerService("test-service");
      const metrics = service.getMetrics("test-service");
      expect(metrics.state).toBe("CLOSED");
      expect(metrics.metrics.totalCallCount).toBe(0);
    });

    it("should register a service with custom config", () => {
      service.registerService("test-service", {
        failureThreshold: 3,
        recoveryTimeMs: 5000,
      });
      const metrics = service.getMetrics("test-service");
      expect(metrics.state).toBe("CLOSED");
    });

    it("should not register same service twice", () => {
      service.registerService("test-service");
      service.registerService("test-service");
      const allStatus = service.getAllStatus();
      expect(allStatus.size).toBe(1);
    });
  });

  describe("CLOSED state transitions", () => {
    beforeEach(() => {
      service.registerService("test-service", { failureThreshold: 3 });
    });

    it("should remain CLOSED on successful calls", () => {
      service.recordSuccess("test-service");
      service.recordSuccess("test-service");
      const metrics = service.getMetrics("test-service");
      expect(metrics.state).toBe("CLOSED");
      expect(metrics.metrics.successCount).toBe(2);
    });

    it("should transition to OPEN on failure threshold exceeded", () => {
      service.recordFailure("test-service");
      service.recordFailure("test-service");
      service.recordFailure("test-service");

      const metrics = service.getMetrics("test-service");
      expect(metrics.state).toBe("OPEN");
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        "circuit-breaker.open",
        expect.objectContaining({
          from: "CLOSED",
          to: "OPEN",
          serviceName: "test-service",
        }),
      );
    });

    it("should transition to OPEN on failure rate threshold exceeded", () => {
      service.registerService("test-service-2", {
        failureThreshold: 100,
        failureRateThreshold: 50,
      });

      // 3 failures, 2 successes = 60% failure rate
      service.recordFailure("test-service-2");
      service.recordFailure("test-service-2");
      service.recordFailure("test-service-2");
      service.recordSuccess("test-service-2");
      service.recordSuccess("test-service-2");

      const metrics = service.getMetrics("test-service-2");
      expect(metrics.state).toBe("OPEN");
    });

    it("should transition to OPEN on slow call rate threshold exceeded", () => {
      service.registerService("test-service-3", {
        failureThreshold: 100,
        slowCallRateThreshold: 50,
        slowCallDurationMs: 100,
      });

      // 3 slow calls, 2 fast calls = 60% slow call rate
      service.recordSlowCall("test-service-3", 150);
      service.recordSlowCall("test-service-3", 150);
      service.recordSlowCall("test-service-3", 150);
      service.recordSuccess("test-service-3", 50);
      service.recordSuccess("test-service-3", 50);

      const metrics = service.getMetrics("test-service-3");
      expect(metrics.state).toBe("OPEN");
    });
  });

  describe("OPEN state transitions", () => {
    beforeEach(() => {
      service.registerService("test-service", {
        failureThreshold: 1,
        recoveryTimeMs: 100,
      });
      service.recordFailure("test-service");
    });

    it("should be open initially", () => {
      const metrics = service.getMetrics("test-service");
      expect(metrics.state).toBe("OPEN");
      expect(service.isOpen("test-service")).toBe(true);
    });

    it("should remain OPEN while recovery time has not passed", () => {
      expect(service.isOpen("test-service")).toBe(true);
      const metrics = service.getMetrics("test-service");
      expect(metrics.state).toBe("OPEN");
    });

    it("should transition to HALF_OPEN after recovery time", (done) => {
      expect(service.isOpen("test-service")).toBe(true);

      setTimeout(() => {
        service.isOpen("test-service"); // Trigger check
        const metrics = service.getMetrics("test-service");
        expect(metrics.state).toBe("HALF_OPEN");
        expect(eventEmitter.emit).toHaveBeenCalledWith(
          "circuit-breaker.half_open",
          expect.objectContaining({
            from: "OPEN",
            to: "HALF_OPEN",
            serviceName: "test-service",
          }),
        );
        done();
      }, 150);
    });

    it("should emit state-change event on transition", (done) => {
      setTimeout(() => {
        service.isOpen("test-service");
        expect(eventEmitter.emit).toHaveBeenCalledWith(
          "circuit-breaker.state-change",
          expect.any(Object),
        );
        done();
      }, 150);
    });
  });

  describe("HALF_OPEN state transitions", () => {
    beforeEach((done) => {
      service.registerService("test-service", {
        failureThreshold: 1,
        recoveryTimeMs: 50,
        halfOpenRequestCount: 2,
      });
      service.recordFailure("test-service");

      setTimeout(() => {
        service.isOpen("test-service"); // Trigger transition to HALF_OPEN
        done();
      }, 100);
    });

    it("should be in HALF_OPEN state", () => {
      const metrics = service.getMetrics("test-service");
      expect(metrics.state).toBe("HALF_OPEN");
    });

    it("should return to OPEN on failure in HALF_OPEN state", () => {
      service.recordFailure("test-service");
      const metrics = service.getMetrics("test-service");
      expect(metrics.state).toBe("OPEN");
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        "circuit-breaker.open",
        expect.objectContaining({
          from: "HALF_OPEN",
          to: "OPEN",
        }),
      );
    });

    it("should transition to CLOSED after successful probes in HALF_OPEN state", () => {
      service.recordSuccess("test-service");
      expect(service.getMetrics("test-service").state).toBe("HALF_OPEN");

      service.recordSuccess("test-service");
      const metrics = service.getMetrics("test-service");
      expect(metrics.state).toBe("CLOSED");
      expect(metrics.metrics.successCount).toBe(0); // Reset after closing
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        "circuit-breaker.closed",
        expect.objectContaining({
          from: "HALF_OPEN",
          to: "CLOSED",
        }),
      );
    });
  });

  describe("metrics tracking", () => {
    beforeEach(() => {
      service.registerService("test-service");
    });

    it("should track success and failure counts", () => {
      service.recordSuccess("test-service");
      service.recordSuccess("test-service");
      service.recordFailure("test-service");

      const metrics = service.getMetrics("test-service");
      expect(metrics.metrics.successCount).toBe(2);
      expect(metrics.metrics.failureCount).toBe(1);
      expect(metrics.metrics.totalCallCount).toBe(3);
    });

    it("should track slow call count", () => {
      service.recordSlowCall("test-service", 1500);
      service.recordSlowCall("test-service", 50);

      const metrics = service.getMetrics("test-service");
      expect(metrics.metrics.slowCallCount).toBe(1);
    });

    it("should track state transitions", () => {
      service.registerService("test-service-2", { failureThreshold: 1 });
      service.recordFailure("test-service-2");

      const metrics = service.getMetrics("test-service-2");
      expect(metrics.metrics.stateTransitions.length).toBeGreaterThan(1);
      expect(metrics.metrics.stateTransitions[0].state).toBe("CLOSED");
      expect(metrics.metrics.stateTransitions[1].state).toBe("OPEN");
    });

    it("should track lastFailureTime and lastSuccessTime", () => {
      service.recordSuccess("test-service");
      const afterSuccess = new Date();

      const successMetrics = service.getMetrics("test-service");
      expect(successMetrics.metrics.lastSuccessTime).toBeTruthy();
      expect(
        successMetrics.metrics.lastSuccessTime!.getTime(),
      ).toBeLessThanOrEqual(afterSuccess.getTime());

      service.recordFailure("test-service");
      const afterFailure = new Date();

      const failureMetrics = service.getMetrics("test-service");
      expect(failureMetrics.metrics.lastFailureTime).toBeTruthy();
      expect(
        failureMetrics.metrics.lastFailureTime!.getTime(),
      ).toBeLessThanOrEqual(afterFailure.getTime());
    });
  });

  describe("reset", () => {
    it("should reset circuit breaker to CLOSED state", () => {
      service.registerService("test-service", { failureThreshold: 1 });
      service.recordFailure("test-service");
      expect(service.getMetrics("test-service").state).toBe("OPEN");

      service.reset("test-service");
      const metrics = service.getMetrics("test-service");
      expect(metrics.state).toBe("CLOSED");
      expect(metrics.metrics.failureCount).toBe(0);
      expect(metrics.metrics.successCount).toBe(0);
    });
  });

  describe("health checks", () => {
    it("should report service as healthy when CLOSED", () => {
      service.registerService("test-service");
      expect(service.isHealthy("test-service")).toBe(true);
    });

    it("should report service as unhealthy when OPEN", () => {
      service.registerService("test-service", { failureThreshold: 1 });
      service.recordFailure("test-service");
      expect(service.isHealthy("test-service")).toBe(false);
    });

    it("should report service as healthy when HALF_OPEN", (done) => {
      service.registerService("test-service", {
        failureThreshold: 1,
        recoveryTimeMs: 50,
      });
      service.recordFailure("test-service");

      setTimeout(() => {
        service.isOpen("test-service");
        expect(service.isHealthy("test-service")).toBe(true);
        done();
      }, 100);
    });
  });

  describe("getAllStatus", () => {
    it("should return all registered services", () => {
      service.registerService("service-1");
      service.registerService("service-2");
      service.registerService("service-3");

      const allStatus = service.getAllStatus();
      expect(allStatus.size).toBe(3);
      expect(allStatus.has("service-1")).toBe(true);
      expect(allStatus.has("service-2")).toBe(true);
      expect(allStatus.has("service-3")).toBe(true);
    });
  });

  describe("auto-registration", () => {
    it("should auto-register service on first use if not pre-registered", () => {
      service.recordSuccess("auto-service");
      const metrics = service.getMetrics("auto-service");
      expect(metrics.state).toBe("CLOSED");
      expect(metrics.metrics.successCount).toBe(1);
    });
  });
});
