import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { RateLimiterService } from "./rate-limiter.service";
import { PolicyService } from "./policy.service";
import Redis from "ioredis";

jest.mock("ioredis");

describe("RateLimiterService", () => {
  let service: RateLimiterService;
  let redisMock: any;

  beforeEach(async () => {
    redisMock = {
      eval: jest.fn(),
      on: jest.fn(),
      quit: jest.fn(),
    };
    (Redis as unknown as jest.Mock).mockReturnValue(redisMock);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimiterService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue("redis://localhost:6379"),
          },
        },
        {
          provide: PolicyService,
          useValue: {
            getApplicablePolicy: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RateLimiterService>(RateLimiterService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should allow request when quota is available", async () => {
    redisMock.eval.mockResolvedValue([1, 9]); // allowed=1, remaining=9

    const result = await service.checkQuota("test-key", 10, 60000, 10);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(redisMock.eval).toHaveBeenCalled();
  });

  it("should deny request when quota is exhausted", async () => {
    redisMock.eval.mockResolvedValue([0, 0]); // allowed=0, remaining=0

    const result = await service.checkQuota("test-key", 10, 60000, 10);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should fail open on redis error", async () => {
    redisMock.eval.mockRejectedValue(new Error("Redis down"));

    const result = await service.checkQuota("test-key", 10, 60000, 10);

    expect(result.allowed).toBe(true);
  });
});
