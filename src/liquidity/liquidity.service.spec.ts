import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { LiquidityService } from "./liquidity.service";
import { LiquidityPool } from "./entities/liquidity-pool.entity";
import { LpPosition } from "./entities/lp-position.entity";

const pool: LiquidityPool = {
  id: "pool-1",
  tokenA: "ETH",
  tokenB: "USDC",
  feeBps: 30,
  reserveA: "1000",
  reserveB: "2000000",
  totalLpTokens: "1414.21",
  totalFeesCollected: "0",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPoolRepo = {
  find: jest.fn().mockResolvedValue([pool]),
  findOne: jest.fn().mockResolvedValue(pool),
  save: jest.fn().mockImplementation((p) => Promise.resolve(p)),
};

const mockPositionRepo = {
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockImplementation((p) => ({ ...p })),
  save: jest.fn().mockImplementation((p) => Promise.resolve(p)),
};

describe("LiquidityService", () => {
  let service: LiquidityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiquidityService,
        { provide: getRepositoryToken(LiquidityPool), useValue: mockPoolRepo },
        { provide: getRepositoryToken(LpPosition), useValue: mockPositionRepo },
      ],
    }).compile();

    service = module.get<LiquidityService>(LiquidityService);
    jest.clearAllMocks();
    mockPoolRepo.findOne.mockResolvedValue({ ...pool });
    mockPositionRepo.findOne.mockResolvedValue(null);
    mockPositionRepo.create.mockImplementation((p) => ({ ...p }));
  });

  it("returns all pools", async () => {
    mockPoolRepo.find.mockResolvedValue([pool]);
    const pools = await service.getPools();
    expect(pools).toHaveLength(1);
  });

  it("throws NotFoundException for unknown pool", async () => {
    mockPoolRepo.findOne.mockResolvedValue(null);
    await expect(service.getPool("bad-id")).rejects.toThrow(NotFoundException);
  });

  it("adds liquidity and mints LP tokens", async () => {
    const result = await service.addLiquidity("pool-1", {
      userId: "user-1",
      amountA: 10,
      amountB: 20000,
    });
    expect(result.lpMinted).toBeGreaterThan(0);
  });

  it("removes liquidity and returns tokens", async () => {
    mockPositionRepo.findOne.mockResolvedValue({
      userId: "user-1",
      poolId: "pool-1",
      lpTokens: "100",
    });
    const result = await service.removeLiquidity("pool-1", {
      userId: "user-1",
      lpTokens: 50,
    });
    expect(result.returnA).toBeGreaterThan(0);
    expect(result.returnB).toBeGreaterThan(0);
  });

  it("rejects remove when insufficient LP tokens", async () => {
    mockPositionRepo.findOne.mockResolvedValue({
      userId: "user-1",
      poolId: "pool-1",
      lpTokens: "10",
    });
    await expect(
      service.removeLiquidity("pool-1", { userId: "user-1", lpTokens: 100 }),
    ).rejects.toThrow(BadRequestException);
  });

  it("calculates impermanent loss", () => {
    const il = service.calculateImpermanentLoss(1000, 2000);
    expect(il).toBeLessThan(0); // IL is always negative
  });
});
