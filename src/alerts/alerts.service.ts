import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Alert, AlertType, AlertCondition } from "./entities/alert.entity";
import { AlertTriggerLog } from "./entities/alert-trigger-log.entity";
import { CreatePriceAlertDto, CreatePortfolioAlertDto } from "./dto/alert.dto";

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alert)
    private alertRepo: Repository<Alert>,
    @InjectRepository(AlertTriggerLog)
    private logRepo: Repository<AlertTriggerLog>,
  ) {}

  async createPriceAlert(dto: CreatePriceAlertDto): Promise<Alert> {
    const alert = this.alertRepo.create({
      userId: dto.userId,
      type: AlertType.PRICE,
      asset: dto.asset,
      condition: dto.condition,
      threshold: dto.threshold,
      cooldownSeconds: dto.cooldownSeconds ?? 300,
      active: true,
    });
    return this.alertRepo.save(alert);
  }

  async createPortfolioAlert(dto: CreatePortfolioAlertDto): Promise<Alert> {
    const alert = this.alertRepo.create({
      userId: dto.userId,
      type: AlertType.PORTFOLIO,
      condition: dto.condition,
      threshold: dto.threshold,
      cooldownSeconds: dto.cooldownSeconds ?? 300,
      active: true,
    });
    return this.alertRepo.save(alert);
  }

  async getUserAlerts(userId: string): Promise<Alert[]> {
    return this.alertRepo.find({ where: { userId, active: true } });
  }

  async deleteAlert(alertId: string): Promise<void> {
    const alert = await this.alertRepo.findOne({ where: { id: alertId } });
    if (!alert) throw new NotFoundException(`Alert ${alertId} not found`);
    alert.active = false;
    await this.alertRepo.save(alert);
  }

  async getAlertHistory(userId: string): Promise<AlertTriggerLog[]> {
    return this.logRepo.find({
      where: { userId },
      order: { triggeredAt: "DESC" },
    });
  }

  /**
   * Evaluate a price update against all active price alerts.
   * Respects cooldown to prevent spam.
   */
  async evaluatePriceAlerts(
    asset: string,
    currentPrice: number,
  ): Promise<AlertTriggerLog[]> {
    const alerts = await this.alertRepo.find({
      where: { type: AlertType.PRICE, asset, active: true },
    });

    const triggered: AlertTriggerLog[] = [];

    for (const alert of alerts) {
      if (
        !this.isConditionMet(alert.condition!, currentPrice, alert.threshold!)
      ) {
        continue;
      }
      if (!this.isCooldownElapsed(alert)) {
        continue;
      }

      alert.lastTriggeredAt = new Date();
      await this.alertRepo.save(alert);

      const log = this.logRepo.create({
        alertId: alert.id,
        userId: alert.userId,
        payload: {
          asset,
          currentPrice,
          threshold: alert.threshold,
          condition: alert.condition,
        },
      });
      triggered.push(await this.logRepo.save(log));
    }

    return triggered;
  }

  private isConditionMet(
    condition: AlertCondition,
    current: number,
    threshold: number,
  ): boolean {
    return condition === AlertCondition.ABOVE
      ? current > threshold
      : current < threshold;
  }

  private isCooldownElapsed(alert: Alert): boolean {
    if (!alert.lastTriggeredAt) return true;
    const elapsed = (Date.now() - alert.lastTriggeredAt.getTime()) / 1000;
    return elapsed >= alert.cooldownSeconds;
  }
}
