import { Injectable, Logger } from "@nestjs/common";
import {
  RiskConfigDto,
  PortfolioRiskDto,
  RiskAlertDto,
  PositionSizeDto,
} from "./dto/risk.dto";

interface Position {
  asset: string;
  value: number;
  weight: number;
  volatility: number;
  entryPrice: number;
  currentPrice: number;
}

@Injectable()
export class RiskManagementService {
  private readonly logger = new Logger(RiskManagementService.name);

  private readonly riskConfigs = new Map<string, RiskConfigDto>();

  setRiskConfig(dto: RiskConfigDto): void {
    this.riskConfigs.set(dto.userId, dto);
    this.logger.log(`Risk config updated for user ${dto.userId}`);
  }

  getRiskConfig(userId: string): RiskConfigDto | null {
    return this.riskConfigs.get(userId) ?? null;
  }

  async calculatePortfolioRisk(
    userId: string,
    positions: Position[],
  ): Promise<PortfolioRiskDto> {
    const totalValue = positions.reduce((sum, p) => sum + p.value, 0);
    const weights = positions.map((p) => p.value / totalValue);
    const portfolioVolatility = this.calculatePortfolioVolatility(
      positions,
      weights,
    );

    const var95 = this.calculateVaR(totalValue, portfolioVolatility, 1.645);
    const var99 = this.calculateVaR(totalValue, portfolioVolatility, 2.326);
    const cvar95 = var95 * 1.25; // Simplified CVaR approximation
    const sharpeRatio = this.calculateSharpeRatio(
      positions,
      portfolioVolatility,
    );
    const maxDrawdown = this.calculateMaxDrawdown(positions);
    const currentDrawdown = this.calculateCurrentDrawdown(positions);
    const diversificationScore = this.calculateDiversificationScore(weights);
    const riskScore = this.calculateRiskScore(
      var95,
      totalValue,
      maxDrawdown,
      diversificationScore,
    );

    const alerts = this.generateAlerts(userId, positions, {
      var95,
      maxDrawdown,
      currentDrawdown,
      diversificationScore,
    });

    return {
      userId,
      totalValue,
      var95,
      var99,
      cvar95,
      sharpeRatio,
      maxDrawdown,
      currentDrawdown,
      diversificationScore,
      riskScore,
      alerts,
      calculatedAt: new Date(),
    };
  }

  calculatePositionSize(dto: PositionSizeDto): {
    recommendedSize: number;
    maxSize: number;
    kellyFraction: number;
  } {
    const config = this.riskConfigs.get(dto.userId);
    const riskTolerance = config?.riskTolerance ?? 0.02;
    const maxPositionSize = config?.maxPositionSize ?? dto.portfolioValue * 0.1;

    // Kelly Criterion approximation
    const winRate = 0.55; // Mock win rate
    const avgWin = 0.03;
    const avgLoss = 0.02;
    const kellyFraction = winRate / avgLoss - (1 - winRate) / avgWin;

    const volatilityAdjusted =
      (riskTolerance * dto.portfolioValue) / dto.volatility;
    const recommendedSize = Math.min(
      volatilityAdjusted,
      maxPositionSize,
      dto.portfolioValue * kellyFraction,
    );

    return {
      recommendedSize: Math.max(0, recommendedSize),
      maxSize: maxPositionSize,
      kellyFraction: Math.max(0, kellyFraction),
    };
  }

  checkStopLoss(
    userId: string,
    asset: string,
    entryPrice: number,
    currentPrice: number,
  ): boolean {
    const config = this.riskConfigs.get(userId);
    if (!config) return false;
    const loss = (entryPrice - currentPrice) / entryPrice;
    return loss >= config.stopLossPercentage / 100;
  }

  checkTakeProfit(
    userId: string,
    asset: string,
    entryPrice: number,
    currentPrice: number,
  ): boolean {
    const config = this.riskConfigs.get(userId);
    if (!config) return false;
    const gain = (currentPrice - entryPrice) / entryPrice;
    return gain >= config.takeProfitPercentage / 100;
  }

  getPositionRisk(userId: string): { userId: string; positions: unknown[]; riskScore: number } {
    const config = this.riskConfigs.get(userId);
    return {
      userId,
      positions: [],
      riskScore: config ? 0 : -1,
    };
  }

  getExposure(): { totalExposure: number; byAsset: Record<string, number>; timestamp: Date } {
    return {
      totalExposure: 0,
      byAsset: {},
      timestamp: new Date(),
    };
  }

  private calculateVaR(
    totalValue: number,
    volatility: number,
    zScore: number,
  ): number {
    return totalValue * volatility * zScore;
  }

  private calculatePortfolioVolatility(
    positions: Position[],
    weights: number[],
  ): number {
    // Simplified: weighted average volatility (ignores correlations)
    return positions.reduce((sum, p, i) => sum + weights[i] * p.volatility, 0);
  }

  private calculateSharpeRatio(
    positions: Position[],
    volatility: number,
  ): number {
    const riskFreeRate = 0.05;
    const avgReturn =
      positions.reduce((sum, p) => {
        return sum + (p.currentPrice - p.entryPrice) / p.entryPrice;
      }, 0) / Math.max(positions.length, 1);
    return volatility > 0 ? (avgReturn - riskFreeRate) / volatility : 0;
  }

  private calculateMaxDrawdown(positions: Position[]): number {
    if (!positions.length) return 0;
    const losses = positions.map((p) =>
      Math.max(0, (p.entryPrice - p.currentPrice) / p.entryPrice),
    );
    return Math.max(...losses);
  }

  private calculateCurrentDrawdown(positions: Position[]): number {
    return this.calculateMaxDrawdown(positions);
  }

  private calculateDiversificationScore(weights: number[]): number {
    if (!weights.length) return 0;
    // Herfindahl-Hirschman Index inverted
    const hhi = weights.reduce((sum, w) => sum + w * w, 0);
    return 1 - hhi;
  }

  private calculateRiskScore(
    var95: number,
    totalValue: number,
    maxDrawdown: number,
    diversification: number,
  ): number {
    const varRatio = totalValue > 0 ? var95 / totalValue : 0;
    return Math.min(
      100,
      varRatio * 50 + maxDrawdown * 30 + (1 - diversification) * 20,
    );
  }

  private generateAlerts(
    userId: string,
    positions: Position[],
    metrics: {
      var95: number;
      maxDrawdown: number;
      currentDrawdown: number;
      diversificationScore: number;
    },
  ): RiskAlertDto[] {
    const alerts: RiskAlertDto[] = [];
    const config = this.riskConfigs.get(userId);

    if (metrics.currentDrawdown > 0.1) {
      alerts.push({
        type: "drawdown",
        severity: metrics.currentDrawdown > 0.2 ? "critical" : "high",
        message: `Portfolio drawdown of ${(metrics.currentDrawdown * 100).toFixed(1)}% detected`,
        threshold: 0.1,
        currentValue: metrics.currentDrawdown,
        triggeredAt: new Date(),
      });
    }

    if (metrics.diversificationScore < 0.3) {
      alerts.push({
        type: "concentration",
        severity: "medium",
        message: "Portfolio is highly concentrated. Consider diversifying.",
        threshold: 0.3,
        currentValue: metrics.diversificationScore,
        triggeredAt: new Date(),
      });
    }

    if (config) {
      for (const position of positions) {
        if (
          this.checkStopLoss(
            userId,
            position.asset,
            position.entryPrice,
            position.currentPrice,
          )
        ) {
          alerts.push({
            type: "stop_loss",
            severity: "high",
            message: `Stop-loss triggered for ${position.asset}`,
            asset: position.asset,
            threshold: config.stopLossPercentage,
            currentValue:
              ((position.entryPrice - position.currentPrice) /
                position.entryPrice) *
              100,
            triggeredAt: new Date(),
          });
        }
      }
    }

    return alerts;
  }
}
