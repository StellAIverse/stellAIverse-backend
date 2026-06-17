import { Test, TestingModule } from "@nestjs/testing";
import { Reflector } from "@nestjs/core";
import { QuotaGuard } from "./quota.guard";
import { HttpException } from "@nestjs/common";

describe("QuotaGuard", () => {
  let guard: QuotaGuard;
  let reflector: Reflector;
  let rateLimiterService: any;

  beforeEach(async () => {
    const mockRateLimiterService = {
      checkQuota: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<QuotaGuard>(QuotaGuard);
    reflector = module.get<Reflector>(Reflector);

    // Manually set the optional service for testing
    (guard as any).rateLimiterService = mockRateLimiterService;
    rateLimiterService = mockRateLimiterService;
  });

  it("should be defined", () => {
    expect(guard).toBeDefined();
  });

  it("should allow request if no @RateLimit decorator is present", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(null);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn(),
      }),
    } as any;

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it("should throw HttpException if rate limit is exceeded", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      level: "free",
    });
    (rateLimiterService.checkQuota as jest.Mock).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetMs: 60000,
    });

    const mockResponse = {
      header: jest.fn(),
    };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ ip: "127.0.0.1", headers: {} }),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
    } as any;

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    expect(mockResponse.header).toHaveBeenCalledWith(
      "X-RateLimit-Limit",
      expect.any(Number),
    );
  });

  it("should allow request and set headers if within limit", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      level: "free",
    });
    (rateLimiterService.checkQuota as jest.Mock).mockResolvedValue({
      allowed: true,
      remaining: 5,
      resetMs: 60000,
    });

    const mockResponse = {
      header: jest.fn(),
    };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ ip: "127.0.0.1", headers: {} }),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
    } as any;

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(mockResponse.header).toHaveBeenCalledWith(
      "X-RateLimit-Remaining",
      5,
    );
  });
});
