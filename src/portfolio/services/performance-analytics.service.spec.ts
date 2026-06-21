import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Between } from "typeorm";
import { PerformanceAnalyticsService } from "./performance-analytics.service";
import { PerformanceMetric } from "../entities/performance-metric.entity";
import { Portfolio } from "../entities/portfolio.entity";
import { PortfolioAsset } from "../entities/portfolio-asset.entity";
import { PerformancePeriod } from "../dto/performance.dto";

const PORTFOLIO_ID = "portfolio-1";

const makeMetric = (
  portfolioValue: number,
  dateTime: Date,
  overrides: Partial<PerformanceMetric> = {},
): PerformanceMetric =>
  ({
    id: Math.random().toString(36).slice(2),
    portfolioId: PORTFOLIO_ID,
    portfolioValue,
    dateTime,
    dailyReturn: 0,
    previousValue: null,
    allocation: {},
    assetContribution: null,
    ...overrides,
  }) as unknown as PerformanceMetric;

const day = (offset: number) =>
  new Date(Date.now() - offset * 24 * 60 * 60 * 1000);

const mockMetricRepo = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
};

const mockPortfolioRepo = {
  findOne: jest.fn(),
};

const mockAssetRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

describe("PerformanceAnalyticsService", () => {
  let service: PerformanceAnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PerformanceAnalyticsService,
        {
          provide: getRepositoryToken(PerformanceMetric),
          useValue: mockMetricRepo,
        },
        {
          provide: getRepositoryToken(Portfolio),
          useValue: mockPortfolioRepo,
        },
        {
          provide: getRepositoryToken(PortfolioAsset),
          useValue: mockAssetRepo,
        },
      ],
    }).compile();

    service = module.get<PerformanceAnalyticsService>(
      PerformanceAnalyticsService,
    );
    jest.clearAllMocks();
    // Default: a portfolio exists with empty assets and zero metrics so
    // tests that don't care about ROI/drawdowns/period returns don't trip
    // on a missing mock (calculateXxx methods short-circuit to 0 on empty
    // histories or asset lists).
    mockPortfolioRepo.findOne.mockResolvedValue({
      id: PORTFOLIO_ID,
      currentAllocation: {},
    } as Portfolio);
    mockAssetRepo.find.mockResolvedValue([]);
    mockMetricRepo.find.mockResolvedValue([]);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ─── recordMetrics ──────────────────────────────────────────────────────────

  describe("recordMetrics", () => {
    it("persists a metric snapshot and computes dailyReturn", async () => {
      const saved = makeMetric(11000, new Date());
      mockMetricRepo.create.mockReturnValue(saved);
      mockMetricRepo.save.mockResolvedValue(saved);

      const result = await service.recordMetrics(
        PORTFOLIO_ID,
        11000,
        { AAPL: 100 },
        10000,
      );

      expect(mockMetricRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          portfolioId: PORTFOLIO_ID,
          portfolioValue: 11000,
          previousValue: 10000,
          dailyReturn: 0.1,
        }),
      );
      expect(mockMetricRepo.save).toHaveBeenCalledWith(saved);
      expect(result).toBe(saved);
    });

    it("sets dailyReturn to 0 when no previousValue given", async () => {
      const saved = makeMetric(10000, new Date());
      mockMetricRepo.create.mockReturnValue(saved);
      mockMetricRepo.save.mockResolvedValue(saved);

      await service.recordMetrics(PORTFOLIO_ID, 10000, {});

      expect(mockMetricRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ dailyReturn: 0 }),
      );
    });

    it("attaches period returns and currentDrawdown when history exists", async () => {
      // Build a history long enough for period returns + drawdown to compute.
      const dailyPrices = [100, 105, 110, 115, 120, 125, 130, 135, 140, 145];
      mockMetricRepo.find.mockResolvedValue(
        dailyPrices.map((p, i) => makeMetric(p, day(dailyPrices.length - i))),
      );

      const saved = makeMetric(150, new Date());
      mockMetricRepo.create.mockReturnValue(saved);
      mockMetricRepo.save.mockResolvedValue(saved);

      await service.recordMetrics(PORTFOLIO_ID, 150, { AAPL: 100 }, 145);

      expect(mockMetricRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          yearToDateReturn: expect.any(Number),
          oneYearReturn: expect.any(Number),
          threeYearReturn: expect.any(Number),
          fiveYearReturn: expect.any(Number),
          currentDrawdown: expect.any(Number),
        }),
      );
    });

    it("writes the snapshot even when there is no prior history", async () => {
      // Empty history → calculatePeriodReturns returns 0s and
      // calculateCurrentDrawdown returns 0, both must not block the write.
      mockMetricRepo.find.mockResolvedValue([]);

      const saved = makeMetric(10000, new Date());
      mockMetricRepo.create.mockReturnValue(saved);
      mockMetricRepo.save.mockResolvedValue(saved);

      await expect(
        service.recordMetrics(PORTFOLIO_ID, 10000, {}),
      ).resolves.toBe(saved);
    });
  });

  // ─── calculateCumulativeReturn ──────────────────────────────────────────────

  describe("calculateCumulativeReturn", () => {
    it("returns (last - first) / first over available metrics", async () => {
      mockMetricRepo.find.mockResolvedValue([
        makeMetric(10000, day(10)),
        makeMetric(11000, day(5)),
        makeMetric(12000, day(0)),
      ]);

      const result = await service.calculateCumulativeReturn(PORTFOLIO_ID);

      expect(result).toBeCloseTo(0.2, 5); // (12000 - 10000) / 10000
    });

    it("returns 0 when fewer than 2 data points exist", async () => {
      mockMetricRepo.find.mockResolvedValue([makeMetric(10000, day(0))]);

      const result = await service.calculateCumulativeReturn(PORTFOLIO_ID);

      expect(result).toBe(0);
    });

    it("filters by startDate via Between when provided", async () => {
      const start = day(30);
      mockMetricRepo.find.mockResolvedValue([]);

      await service.calculateCumulativeReturn(PORTFOLIO_ID, start);

      expect(mockMetricRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dateTime: expect.any(Object), // Between(...)
          }),
        }),
      );
    });
  });

  // ─── calculateVolatility ───────────────────────────────────────────────────

  describe("calculateVolatility", () => {
    it("computes annualised volatility > 0 for changing prices", async () => {
      const prices = [100, 102, 98, 105, 101, 108];
      mockMetricRepo.find.mockResolvedValue(
        prices.map((p, i) => makeMetric(p, day(prices.length - i))),
      );

      const vol = await service.calculateVolatility(PORTFOLIO_ID);

      expect(vol).toBeGreaterThan(0);
    });

    it("returns 0 for fewer than 2 data points", async () => {
      mockMetricRepo.find.mockResolvedValue([makeMetric(100, day(0))]);

      expect(await service.calculateVolatility(PORTFOLIO_ID)).toBe(0);
    });
  });

  // ─── calculateSharpeRatio ──────────────────────────────────────────────────

  describe("calculateSharpeRatio", () => {
    it("returns 0 when volatility is 0 (flat price series)", async () => {
      // All same price → zero returns → zero volatility
      mockMetricRepo.find.mockResolvedValue([
        makeMetric(10000, day(2)),
        makeMetric(10000, day(1)),
        makeMetric(10000, day(0)),
      ]);

      const ratio = await service.calculateSharpeRatio(PORTFOLIO_ID);
      expect(ratio).toBe(0);
    });

    it("returns a positive value for positive excess returns", async () => {
      const prices = [100, 105, 110, 115, 120, 125, 130];
      mockMetricRepo.find.mockResolvedValue(
        prices.map((p, i) => makeMetric(p, day(prices.length - i))),
      );

      const ratio = await service.calculateSharpeRatio(PORTFOLIO_ID, 0.0);
      expect(ratio).toBeGreaterThan(0);
    });
  });

  // ─── calculateMaxDrawdown ─────────────────────────────────────────────────

  describe("calculateMaxDrawdown", () => {
    it("calculates the max peak-to-trough drawdown correctly", async () => {
      mockMetricRepo.find.mockResolvedValue([
        makeMetric(100, day(4)),
        makeMetric(120, day(3)),
        makeMetric(90, day(2)), // drawdown from 120 → 90 = 25%
        makeMetric(110, day(1)),
        makeMetric(115, day(0)),
      ]);

      const dd = await service.calculateMaxDrawdown(PORTFOLIO_ID);
      expect(dd).toBeCloseTo(0.25, 2);
    });

    it("returns 0 for empty metrics", async () => {
      mockMetricRepo.find.mockResolvedValue([]);
      expect(await service.calculateMaxDrawdown(PORTFOLIO_ID)).toBe(0);
    });
  });

  // ─── calculateVaR ──────────────────────────────────────────────────────────

  describe("calculateVaR", () => {
    it("returns a negative or zero value at 95% confidence", async () => {
      const prices = [100, 95, 98, 92, 100, 88, 102, 97, 105, 101];
      mockMetricRepo.find.mockResolvedValue(
        prices.map((p, i) => makeMetric(p, day(prices.length - i))),
      );

      const var95 = await service.calculateVaR(PORTFOLIO_ID, 0.95);
      // VaR is the worst (1-confidence) return, which should be negative
      expect(var95).toBeLessThanOrEqual(0);
    });

    it("returns 0 for empty metrics", async () => {
      mockMetricRepo.find.mockResolvedValue([]);
      expect(await service.calculateVaR(PORTFOLIO_ID)).toBe(0);
    });
  });

  // ─── calculateCalmarRatio ─────────────────────────────────────────────────

  describe("calculateCalmarRatio", () => {
    it("returns 0 when max drawdown is 0", async () => {
      // Monotonically increasing prices → no drawdown
      mockMetricRepo.find.mockResolvedValue([
        makeMetric(100, day(2)),
        makeMetric(110, day(1)),
        makeMetric(120, day(0)),
      ]);

      const calmar = await service.calculateCalmarRatio(PORTFOLIO_ID);
      expect(calmar).toBe(0);
    });

    it("returns a finite number for normal price series", async () => {
      const prices = [100, 110, 95, 105, 115, 100, 120];
      mockMetricRepo.find.mockResolvedValue(
        prices.map((p, i) => makeMetric(p, day(prices.length - i))),
      );

      const calmar = await service.calculateCalmarRatio(PORTFOLIO_ID);
      expect(isFinite(calmar)).toBe(true);
    });
  });

  // ─── getMetricsForDateRange ────────────────────────────────────────────────

  describe("getMetricsForDateRange", () => {
    it("queries the repository with Between filter", async () => {
      const start = day(30);
      const end = new Date();
      mockMetricRepo.find.mockResolvedValue([]);

      await service.getMetricsForDateRange(PORTFOLIO_ID, start, end);

      expect(mockMetricRepo.find).toHaveBeenCalledWith({
        where: {
          portfolioId: PORTFOLIO_ID,
          dateTime: Between(start, end),
        },
        order: { dateTime: "ASC" },
      });
    });

    it("returns metrics in ascending dateTime order", async () => {
      const metrics = [
        makeMetric(100, day(2)),
        makeMetric(110, day(1)),
        makeMetric(120, day(0)),
      ];
      mockMetricRepo.find.mockResolvedValue(metrics);

      const result = await service.getMetricsForDateRange(
        PORTFOLIO_ID,
        day(3),
        new Date(),
      );

      expect(result).toBe(metrics);
    });
  });

  // ─── getMetricsForPeriod ───────────────────────────────────────────────────

  describe("getMetricsForPeriod", () => {
    it("delegates to getMetricsForDateRange with correct start date for 1M", async () => {
      mockMetricRepo.find.mockResolvedValue([]);
      const before = Date.now();

      await service.getMetricsForPeriod(PORTFOLIO_ID, PerformancePeriod.MONTH);

      const call = mockMetricRepo.find.mock.calls[0][0];
      const { dateTime } = call.where;
      // Between(start, end): start should be ~30 days ago
      const startTs = (dateTime as any)._value[0].getTime();
      const after = Date.now();
      const expected = 30 * 24 * 60 * 60 * 1000;
      expect(before - startTs).toBeGreaterThan(expected - 5000);
      expect(after - startTs).toBeLessThan(expected + 5000);
    });

    it("uses epoch for ALL period", async () => {
      mockMetricRepo.find.mockResolvedValue([]);

      await service.getMetricsForPeriod(PORTFOLIO_ID, PerformancePeriod.ALL);

      const call = mockMetricRepo.find.mock.calls[0][0];
      const { dateTime } = call.where;
      const startTs = (dateTime as any)._value[0].getTime();
      expect(startTs).toBe(0);
    });
  });

  // ─── resolvePeriodStartDate ────────────────────────────────────────────────

  describe("resolvePeriodStartDate", () => {
    const approxDaysAgo = (date: Date, days: number, tolerance = 1) => {
      const expected = Date.now() - days * 24 * 60 * 60 * 1000;
      expect(Math.abs(date.getTime() - expected)).toBeLessThan(
        tolerance * 24 * 60 * 60 * 1000,
      );
    };

    it.each([
      [PerformancePeriod.DAY, 1],
      [PerformancePeriod.WEEK, 7],
      [PerformancePeriod.MONTH, 30],
      [PerformancePeriod.THREE_MONTHS, 90],
      [PerformancePeriod.SIX_MONTHS, 180],
      [PerformancePeriod.ONE_YEAR, 365],
      [PerformancePeriod.THREE_YEARS, 3 * 365],
    ])("%s resolves to ~%d days ago", (period, days) => {
      approxDaysAgo(service.resolvePeriodStartDate(period), days);
    });

    it("YTD resolves to Jan 1 of current year", () => {
      const result = service.resolvePeriodStartDate(
        PerformancePeriod.YEAR_TO_DATE,
      );
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(1);
      expect(result.getFullYear()).toBe(new Date().getFullYear());
    });

    it("ALL resolves to epoch (new Date(0))", () => {
      expect(
        service.resolvePeriodStartDate(PerformancePeriod.ALL).getTime(),
      ).toBe(0);
    });
  });

  // ─── getBenchmarkComparison ────────────────────────────────────────────────

  describe("getBenchmarkComparison", () => {
    it("returns benchmark comparison object with required fields", async () => {
      const metrics = [
        makeMetric(100, day(3)),
        makeMetric(105, day(2)),
        makeMetric(102, day(1)),
        makeMetric(108, day(0)),
      ];
      mockMetricRepo.find.mockResolvedValue(metrics);

      const result = await service.getBenchmarkComparison(PORTFOLIO_ID, "SPY");

      expect(result).toMatchObject({
        benchmarkTicker: "SPY",
        portfolioReturn: expect.any(Number),
        benchmarkReturn: expect.any(Number),
        alpha: expect.any(Number),
        beta: expect.any(Number),
        correlation: expect.any(Number),
        trackingError: expect.any(Number),
        informationRatio: expect.any(Number),
      });
    });

    it("returns zero metrics for empty history", async () => {
      mockMetricRepo.find.mockResolvedValue([]);

      const result = await service.getBenchmarkComparison(PORTFOLIO_ID, "BTC");

      expect(result.portfolioReturn).toBe(0);
    });
  });

  // ─── getPerformanceSummary ─────────────────────────────────────────────────

  describe("getPerformanceSummary", () => {
    it("returns all required summary fields", async () => {
      const metrics = [
        makeMetric(100, day(3)),
        makeMetric(105, day(2)),
        makeMetric(108, day(0)),
      ];
      mockMetricRepo.find.mockResolvedValue(metrics);

      const summary = await service.getPerformanceSummary(PORTFOLIO_ID);

      expect(summary).toMatchObject({
        cumulativeReturn: expect.any(Number),
        volatility: expect.any(Number),
        sharpeRatio: expect.any(Number),
        sortinoRatio: expect.any(Number),
        maxDrawdown: expect.any(Number),
        calmarRatio: expect.any(Number),
        valueAtRisk95: expect.any(Number),
        roi: expect.any(Number),
        currentDrawdown: expect.any(Number),
        allocationBreakdown: expect.any(Object),
        periodReturns: expect.objectContaining({
          yearToDateReturn: expect.any(Number),
          oneYearReturn: expect.any(Number),
          threeYearReturn: expect.any(Number),
          fiveYearReturn: expect.any(Number),
        }),
      });
    });

    it("includes ROI computed from portfolio assets", async () => {
      const metrics = [
        makeMetric(100, day(2)),
        makeMetric(110, day(1)),
        makeMetric(120, day(0)),
      ];
      mockMetricRepo.find.mockResolvedValue(metrics);
      mockAssetRepo.find.mockResolvedValue([
        // quantity * currentPrice = 100 * 150 = 15_000
        {
          id: "a1",
          portfolioId: PORTFOLIO_ID,
          quantity: 100,
          currentPrice: 150,
          costBasis: 10_000,
        },
        // quantity * currentPrice = 50 * 100 = 5_000
        {
          id: "a2",
          portfolioId: PORTFOLIO_ID,
          quantity: 50,
          currentPrice: 100,
          costBasis: 5_000,
        },
      ]);

      const summary = await service.getPerformanceSummary(PORTFOLIO_ID);

      // ROI = (15k + 5k - 10k - 5k) / (10k + 5k) = 5_000 / 15_000 ≈ 0.333…
      expect(summary.roi).toBeCloseTo(5_000 / 15_000, 5);
    });

    it("wires allocation breakdown from the latest portfolio snapshot", async () => {
      mockMetricRepo.find.mockResolvedValue([]);
      mockPortfolioRepo.findOne.mockResolvedValue({
        id: PORTFOLIO_ID,
        currentAllocation: { BTC: 60, ETH: 40 },
      } as unknown as Portfolio);

      const summary = await service.getPerformanceSummary(PORTFOLIO_ID);
      expect(summary.allocationBreakdown).toEqual({ BTC: 60, ETH: 40 });
    });
  });

  // ─── calculateCurrentDrawdown ────────────────────────────────────────────────

  describe("calculateCurrentDrawdown", () => {
    it("returns 0 when there is no history", async () => {
      mockMetricRepo.find.mockResolvedValue([]);
      expect(await service.calculateCurrentDrawdown(PORTFOLIO_ID)).toBe(0);
    });

    it("returns 0 when the latest value is at or above the peak", async () => {
      mockMetricRepo.find.mockResolvedValue([
        makeMetric(100, day(4)),
        makeMetric(120, day(3)),
        makeMetric(140, day(2)),
        makeMetric(150, day(0)),
      ]);

      // Latest is the peak → drawdown = 0.
      expect(await service.calculateCurrentDrawdown(PORTFOLIO_ID)).toBe(0);
    });

    it("returns 0 for a monotonically increasing series", async () => {
      const prices = [100, 110, 120, 130, 140, 150];
      mockMetricRepo.find.mockResolvedValue(
        prices.map((p, i) => makeMetric(p, day(prices.length - i))),
      );
      expect(await service.calculateCurrentDrawdown(PORTFOLIO_ID)).toBe(0);
    });

    it("computes the drawdown from the historical peak to the latest value", async () => {
      // Peak = 200, latest = 150 → drawdown = (200 - 150) / 200 = 0.25
      mockMetricRepo.find.mockResolvedValue([
        makeMetric(100, day(5)),
        makeMetric(200, day(4)), // peak
        makeMetric(180, day(3)),
        makeMetric(150, day(0), { allocation: {}, assetContribution: null }),
      ]);

      const dd = await service.calculateCurrentDrawdown(PORTFOLIO_ID);
      expect(dd).toBeCloseTo(0.25, 5);
    });

    it("computes drawdown correctly when the peak occurred at the first metric", async () => {
      mockMetricRepo.find.mockResolvedValue([
        makeMetric(200, day(3)), // all-time peak & also first metric
        makeMetric(150, day(2)),
        makeMetric(100, day(1)),
        makeMetric(120, day(0)), // latest value, below the historic peak
      ]);
      const dd = await service.calculateCurrentDrawdown(PORTFOLIO_ID);
      // Peak = 200, latest = 120 → (200 - 120) / 200 = 0.4
      expect(dd).toBeCloseTo(0.4, 5);
    });

    it("handles a monotonically declining series (latest is below peak)", async () => {
      const prices = [200, 180, 160, 140, 120, 100];
      mockMetricRepo.find.mockResolvedValue(
        prices.map((p, i) => makeMetric(p, day(prices.length - i))),
      );
      // Peak = 200, latest = 100 → 0.5
      expect(await service.calculateCurrentDrawdown(PORTFOLIO_ID)).toBeCloseTo(
        0.5,
        5,
      );
    });

    it("ignores values <= 0 when computing the peak", async () => {
      mockMetricRepo.find.mockResolvedValue([
        makeMetric(0, day(2)),
        makeMetric(100, day(1)),
        makeMetric(50, day(0)),
      ]);
      // Peak > 0 satisfies the guard and computes (100 - 50) / 100 = 0.5
      expect(await service.calculateCurrentDrawdown(PORTFOLIO_ID)).toBeCloseTo(
        0.5,
        5,
      );
    });
  });

  // ─── calculateROI ─────────────────────────────────────────────────────────────

  describe("calculateROI", () => {
    it("returns 0 when the portfolio has no assets", async () => {
      mockAssetRepo.find.mockResolvedValue([]);
      expect(await service.calculateROI(PORTFOLIO_ID)).toBe(0);
    });

    it("returns 0 when total cost basis is 0", async () => {
      mockAssetRepo.find.mockResolvedValue([
        { id: "a1", costBasis: 0, quantity: 1, currentPrice: 1000 },
      ]);
      expect(await service.calculateROI(PORTFOLIO_ID)).toBe(0);
    });

    it("handles a fully costless portfolio (a.k.a. gifts/airdrops)", async () => {
      mockAssetRepo.find.mockResolvedValue([
        { id: "a1", costBasis: 0, quantity: 1, currentPrice: 1000 },
        { id: "a2", costBasis: 0, quantity: 1, currentPrice: 500 },
      ]);
      expect(await service.calculateROI(PORTFOLIO_ID)).toBe(0);
    });

    it("computes ROI = (value - cost) / cost across all assets", async () => {
      mockAssetRepo.find.mockResolvedValue([
        { id: "a1", costBasis: 8_000, quantity: 100, currentPrice: 120 },
        { id: "a2", costBasis: 2_000, quantity: 50, currentPrice: 60 },
      ]);
      // currentValue = 100*120 + 50*60 = 15_000
      // (15_000 - 10_000) / 10_000 = 0.5
      expect(await service.calculateROI(PORTFOLIO_ID)).toBeCloseTo(0.5, 5);
    });

    it("returns negative ROI when value is below cost basis", async () => {
      mockAssetRepo.find.mockResolvedValue([
        { id: "a1", costBasis: 10_000, quantity: 100, currentPrice: 40 },
      ]);
      // currentValue = 4_000, ROI = (4k - 10k) / 10k = -0.6
      expect(await service.calculateROI(PORTFOLIO_ID)).toBeCloseTo(-0.6, 5);
    });

    it("treats null/undefined fields as zero", async () => {
      mockAssetRepo.find.mockResolvedValue([
        {
          id: "a1",
          costBasis: undefined as any,
          quantity: undefined as any,
          currentPrice: undefined as any,
        },
      ]);
      expect(await service.calculateROI(PORTFOLIO_ID)).toBe(0);
    });
  });

  // ─── calculatePeriodReturns ───────────────────────────────────────────────────

  describe("calculatePeriodReturns", () => {
    it("returns all four period returns as numbers", async () => {
      mockMetricRepo.find.mockResolvedValue([]);

      const result = await service.calculatePeriodReturns(PORTFOLIO_ID);

      expect(result).toEqual({
        yearToDateReturn: expect.any(Number),
        oneYearReturn: expect.any(Number),
        threeYearReturn: expect.any(Number),
        fiveYearReturn: expect.any(Number),
      });
    });

    it("queries the metric repository for each period via calculateCumulativeReturn", async () => {
      mockMetricRepo.find.mockResolvedValue([]);

      await service.calculatePeriodReturns(PORTFOLIO_ID);

      // Four period calls + 0 from each (no history). 4 calls to find.
      expect(mockMetricRepo.find).toHaveBeenCalledTimes(4);
      const startDates = mockMetricRepo.find.mock.calls.map(
        (call) => (call[0].where.dateTime as any)._value[0],
      );
      const nowMs = Date.now();
      const toleranceMs = 5_000; // 5 s slop is plenty for date math
      const ytdStart = new Date(new Date().getFullYear(), 0, 1).getTime();
      const oneYearStart = nowMs - 365 * 24 * 60 * 60 * 1000;
      const threeYearStart = nowMs - 3 * 365 * 24 * 60 * 60 * 1000;
      const fiveYearStart = nowMs - 5 * 365 * 24 * 60 * 60 * 1000;

      const withinTolerance = (target: number) =>
        startDates.some(
          (d: Date) => Math.abs(d.getTime() - target) < toleranceMs,
        );
      expect(withinTolerance(ytdStart)).toBe(true);
      expect(withinTolerance(oneYearStart)).toBe(true);
      expect(withinTolerance(threeYearStart)).toBe(true);
      expect(withinTolerance(fiveYearStart)).toBe(true);
    });

    it("computes returns correctly for a price series with full history", async () => {
      // 6 prices: 100 → 160 → 120 → 180 → 140 → 220 (last = 220, first = 100)
      const prices = [100, 160, 120, 180, 140, 220];
      mockMetricRepo.find.mockResolvedValue(
        prices.map((p, i) => makeMetric(p, day(prices.length - i))),
      );

      const result = await service.calculatePeriodReturns(PORTFOLIO_ID);

      // Each lookback returns the same first/last in this stub → 120% return.
      Object.values(result).forEach((value) => {
        expect(value).toBeCloseTo(1.2, 5);
      });
    });
  });

  // ─── getAllocationBreakdown ───────────────────────────────────────────────────

  describe("getAllocationBreakdown", () => {
    it("returns an empty object when the portfolio is not found", async () => {
      mockPortfolioRepo.findOne.mockResolvedValue(null);
      expect(await service.getAllocationBreakdown(PORTFOLIO_ID)).toEqual({});
    });

    it("returns an empty object when currentAllocation is null", async () => {
      mockPortfolioRepo.findOne.mockResolvedValue({
        id: PORTFOLIO_ID,
        currentAllocation: null,
      } as unknown as Portfolio);
      expect(await service.getAllocationBreakdown(PORTFOLIO_ID)).toEqual({});
    });

    it("returns the live allocation breakdown from the portfolio entity", async () => {
      mockPortfolioRepo.findOne.mockResolvedValue({
        id: PORTFOLIO_ID,
        currentAllocation: { BTC: 55, ETH: 25, USDC: 20 },
      } as unknown as Portfolio);

      const result = await service.getAllocationBreakdown(PORTFOLIO_ID);
      expect(result).toEqual({ BTC: 55, ETH: 25, USDC: 20 });
    });
  });

  // ─── getAttributionAnalysis ────────────────────────────────────────────────

  describe("getAttributionAnalysis", () => {
    it("sums asset contributions across all metrics", async () => {
      mockMetricRepo.find.mockResolvedValue([
        makeMetric(100, day(2), {
          assetContribution: { AAPL: 0.02, MSFT: 0.01 },
        }),
        makeMetric(103, day(1), {
          assetContribution: { AAPL: 0.01, MSFT: 0.02 },
        }),
        makeMetric(105, day(0), { assetContribution: null }),
      ]);

      const result = await service.getAttributionAnalysis(
        PORTFOLIO_ID,
        day(3),
        new Date(),
      );

      expect(result.AAPL).toBeCloseTo(0.03, 5);
      expect(result.MSFT).toBeCloseTo(0.03, 5);
    });

    it("returns empty object for metrics without assetContribution", async () => {
      mockMetricRepo.find.mockResolvedValue([makeMetric(100, day(0))]);

      const result = await service.getAttributionAnalysis(
        PORTFOLIO_ID,
        day(1),
        new Date(),
      );

      expect(result).toEqual({});
    });
  });
});
