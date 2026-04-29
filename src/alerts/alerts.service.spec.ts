import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { NotFoundException } from "@nestjs/common";
import { AlertsService } from "./alerts.service";
import { Alert, AlertType, AlertCondition } from "./entities/alert.entity";
import { AlertTriggerLog } from "./entities/alert-trigger-log.entity";

const mockAlertRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockLogRepo = {
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

describe("AlertsService", () => {
  let service: AlertsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: getRepositoryToken(Alert), useValue: mockAlertRepo },
        { provide: getRepositoryToken(AlertTriggerLog), useValue: mockLogRepo },
      ],
    }).compile();

    service = module.get<AlertsService>(AlertsService);
    jest.clearAllMocks();
    mockAlertRepo.create.mockImplementation((p) => ({ ...p }));
    mockAlertRepo.save.mockImplementation((p) =>
      Promise.resolve({ id: "a1", ...p }),
    );
    mockLogRepo.create.mockImplementation((p) => ({ ...p }));
    mockLogRepo.save.mockImplementation((p) =>
      Promise.resolve({ id: "l1", ...p }),
    );
  });

  it("creates a price alert", async () => {
    const alert = await service.createPriceAlert({
      userId: "u1",
      asset: "BTC",
      condition: AlertCondition.ABOVE,
      threshold: 50000,
    });
    expect(alert.type).toBe(AlertType.PRICE);
    expect(alert.asset).toBe("BTC");
  });

  it("creates a portfolio alert", async () => {
    const alert = await service.createPortfolioAlert({
      userId: "u1",
      condition: AlertCondition.BELOW,
      threshold: 10000,
    });
    expect(alert.type).toBe(AlertType.PORTFOLIO);
  });

  it("throws NotFoundException when deleting unknown alert", async () => {
    mockAlertRepo.findOne.mockResolvedValue(null);
    await expect(service.deleteAlert("bad-id")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("evaluates price alerts and triggers matching ones", async () => {
    const alert: Partial<Alert> = {
      id: "a1",
      userId: "u1",
      type: AlertType.PRICE,
      asset: "BTC",
      condition: AlertCondition.ABOVE,
      threshold: 50000,
      cooldownSeconds: 300,
      lastTriggeredAt: undefined,
      active: true,
    };
    mockAlertRepo.find.mockResolvedValue([alert]);

    const logs = await service.evaluatePriceAlerts("BTC", 55000);
    expect(logs).toHaveLength(1);
    expect(logs[0].alertId).toBe("a1");
  });

  it("respects cooldown and does not re-trigger", async () => {
    const alert: Partial<Alert> = {
      id: "a1",
      userId: "u1",
      type: AlertType.PRICE,
      asset: "BTC",
      condition: AlertCondition.ABOVE,
      threshold: 50000,
      cooldownSeconds: 3600,
      lastTriggeredAt: new Date(), // just triggered
      active: true,
    };
    mockAlertRepo.find.mockResolvedValue([alert]);

    const logs = await service.evaluatePriceAlerts("BTC", 55000);
    expect(logs).toHaveLength(0);
  });
});
