import { RetryPolicyService } from "./retry-policy.service";

describe("RetryPolicyService", () => {
  it("should return configured policy for a job type", () => {
    const configService = {
      get: jest.fn().mockReturnValue(
        JSON.stringify({
          "data-processing": {
            maxAttempts: 7,
            backoff: {
              type: "fixed",
              delay: 500,
            },
          },
        }),
      ),
    } as any;

    const service = new RetryPolicyService(configService);

    expect(service.getPolicy("data-processing")).toEqual({
      maxAttempts: 7,
      backoff: {
        type: "fixed",
        delay: 500,
      },
    });
  });

  it("should fall back to job type defaults when not configured", () => {
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as any;

    const service = new RetryPolicyService(configService);

    expect(service.getPolicy("batch-operation")).toEqual({
      maxAttempts: 5,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    });
  });

  it("should fall back to global default for unknown job type", () => {
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as any;

    const service = new RetryPolicyService(configService);

    expect(service.getPolicy("unknown-type")).toEqual({
      maxAttempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    });
  });
});
