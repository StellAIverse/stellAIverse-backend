import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  DeFiRiskAssessment,
  RiskLevel,
} from "../entities/defi-risk-assessment.entity";
import { DeFiPosition } from "../entities/defi-position.entity";
import { ProtocolRegistry } from "../protocols/protocol-registry";

@Injectable()
export class RiskAssessmentService {
  private logger = new Logger("RiskAssessmentService");

  constructor(
    @InjectRepository(DeFiRiskAssessment)
    private riskRepository: Repository<DeFiRiskAssessment>,
    @InjectRepository(DeFiPosition)
    private positionRepository: Repository<DeFiPosition>,
    private protocolRegistry: ProtocolRegistry,
  ) {}

  /**
   * Assess risk for a DeFi position
   */
  async assessPositionRisk(positionId: string): Promise<DeFiRiskAssessment> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId },
    });

    if (!position) throw new Error("Position not found");

    const adapter = this.protocolRegistry.getAdapter(position.protocol as any);

    // Get protocol metrics
    const protocolMetrics = await adapter.getProtocolMetrics();
    const protocolRiskMetrics = await adapter.getRiskMetrics(
      position.wallet_address,
      position.token_symbol,
      "ethereum",
    );

    // Calculate risk components
    const riskComponents = {
      smartContractRisk: protocolRiskMetrics.smartContractRisk,
      liquidationRisk: 0,
      priceVolatilityRisk: protocolRiskMetrics.priceVolatilityRisk,
      counterpartyRisk: protocolRiskMetrics.counterpartyRisk,
      governanceRisk: this.calculateGovernanceRisk(protocolMetrics),
      bridgeRisk: position.metadata?.chainBridge ? 20 : 0,
      composabilityRisk: protocolRiskMetrics.composabilityRisk || 0,
    };

    // If position has borrowing, calculate liquidation risk
    if (position.borrowed_amount && position.borrowed_amount > 0) {
      riskComponents.liquidationRisk = await this.calculateLiquidationRisk(
        position,
        adapter,
      );
    }

    // Calculate overall risk score
    const riskScore = this.calculateOverallRiskScore(riskComponents);
    const riskLevel = this.getRiskLevel(riskScore);

    // Generate warnings and recommendations
    const warnings = this.generateWarnings(
      position,
      riskComponents,
      protocolMetrics,
    );
    const recommendations = this.generateRecommendations(
      position,
      riskComponents,
      warnings,
    );

    // Check liquidation risk
    let liquidationRiskDetected = false;
    let estimatedLiquidationPrice = null;
    let estimatedHoursToLiquidation = null;

    if (position.borrowed_amount && position.ltv) {
      liquidationRiskDetected =
        position.ltv > (position.liquidation_threshold || 0.8);
      if (liquidationRiskDetected) {
        estimatedHoursToLiquidation =
          await this.estimateHoursToLiquidation(position);
        // Simplified calculation
        estimatedLiquidationPrice =
          (position.collateral_value *
            (position.liquidation_threshold || 0.8)) /
          position.collateral_amount;
      }
    }

    const assessment = this.riskRepository.create({
      position_id: positionId,
      overall_risk_level: riskLevel,
      risk_score: riskScore,
      risk_components: riskComponents,
      protocol_metrics: {
        protocolLaunchDate: protocolMetrics.tvl ? "Active" : "Unknown",
        totalValueLocked: protocolMetrics.tvl,
        marketCap: protocolMetrics.tvl * 0.3,
        auditStatus: protocolMetrics.audits?.join(", ") || "Unknown",
        insuranceCoverage: protocolMetrics.insurance,
      },
      position_metrics: {
        ltvRatio: position.ltv,
        healthFactor: position.metadata?.healthFactor,
        liquidationPrice: estimatedLiquidationPrice,
        daysToLiquidation: estimatedHoursToLiquidation
          ? estimatedHoursToLiquidation / 24
          : undefined,
        exposureToProtocol: (position.current_amount / 1000000) * 100, // Simplified
        exposureToToken: (position.current_amount / 1000000) * 100,
      },
      warnings,
      recommendations,
      liquidation_risk_detected: liquidationRiskDetected,
      estimated_liquidation_price: estimatedLiquidationPrice,
      estimated_hours_to_liquidation: estimatedHoursToLiquidation,
      effective_until: new Date(Date.now() + 24 * 60 * 60 * 1000), // Reassess in 24 hours
    });

    return this.riskRepository.save(assessment);
  }

  /**
   * Monitor all positions for risk changes
   */
  async monitorAllPositions(userId: string): Promise<RiskMonitoringResult> {
    const positions = await this.positionRepository.find({
      where: { user_id: userId },
    });

    const riskAssessments = await Promise.all(
      positions.map((p) => this.assessPositionRisk(p.id)),
    );

    const criticalRisks = riskAssessments.filter(
      (r) => r.overall_risk_level === RiskLevel.CRITICAL,
    );
    const highRisks = riskAssessments.filter(
      (r) => r.overall_risk_level === RiskLevel.HIGH,
    );
    const liquidationRisks = riskAssessments.filter(
      (r) => r.liquidation_risk_detected,
    );

    return {
      totalPositions: positions.length,
      assessments: riskAssessments,
      criticalRisks: criticalRisks.length,
      highRisks: highRisks.length,
      liquidationRisks: liquidationRisks.length,
      requiresImmediateAction:
        criticalRisks.length > 0 || liquidationRisks.length > 0,
      summary: {
        averageRiskScore:
          riskAssessments.reduce((sum, r) => sum + r.risk_score, 0) /
          riskAssessments.length,
        healthRating: this.calculatePortfolioHealthRating(riskAssessments),
      },
    };
  }

  /**
   * Stress test a position under market conditions
   */
  async stressTestPosition(
    positionId: string,
    scenarios: StressScenario[],
  ): Promise<StressTestResult[]> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId },
    });

    if (!position) throw new Error("Position not found");

    const results: StressTestResult[] = [];

    for (const scenario of scenarios) {
      const stressedPosition = { ...position };

      // Apply scenario impacts
      if (scenario.priceChange) {
        stressedPosition.collateral_value =
          position.collateral_value * (1 + scenario.priceChange / 100);
      }

      if (scenario.volatilityMultiplier) {
        // Would increase volatility calculations
      }

      if (scenario.protocolShutdown) {
        stressedPosition.status = "liquidation_risk" as any;
      }

      // Calculate resulting risk metrics
      const riskScore = this.calculateStressedRiskScore(
        stressedPosition,
        scenario,
      );
      const liquidationRisk =
        stressedPosition.ltv &&
        stressedPosition.ltv > (stressedPosition.liquidation_threshold || 0.8);

      results.push({
        scenario: scenario.name,
        riskScore,
        liquidationRisk,
        estimatedLoss: Math.abs(
          stressedPosition.collateral_value - position.collateral_value,
        ),
        recommendations: this.generateStressRecommendations(
          scenario,
          liquidationRisk,
        ),
      });
    }

    return results;
  }

  // Private helper methods

  private async calculateLiquidationRisk(
    position: DeFiPosition,
    adapter: any,
  ): Promise<number> {
    if (!position.ltv || !position.max_ltv) return 0;

    const ltvRatio = position.ltv / position.max_ltv;
    return Math.min(100, ltvRatio * 100);
  }

  private calculateOverallRiskScore(
    components: Record<string, number>,
  ): number {
    const weights = {
      smartContractRisk: 0.25,
      liquidationRisk: 0.3,
      priceVolatilityRisk: 0.2,
      counterpartyRisk: 0.15,
      governanceRisk: 0.05,
      bridgeRisk: 0.03,
      composabilityRisk: 0.02,
    };

    let score = 0;
    for (const [component, weight] of Object.entries(weights)) {
      score += (components[component] || 0) * weight;
    }

    return Math.round(score);
  }

  private getRiskLevel(score: number): RiskLevel {
    if (score >= 80) return RiskLevel.CRITICAL;
    if (score >= 60) return RiskLevel.VERY_HIGH;
    if (score >= 40) return RiskLevel.HIGH;
    if (score >= 20) return RiskLevel.MEDIUM;
    if (score >= 10) return RiskLevel.LOW;
    return RiskLevel.VERY_LOW;
  }

  private calculateGovernanceRisk(metrics: any): number {
    // Governance tokens in hands of few devs = higher risk
    // Decentralized governance = lower risk
    return 20; // Default
  }

  private async estimateHoursToLiquidation(
    position: DeFiPosition,
  ): Promise<number | undefined> {
    if (!position.ltv || !position.max_ltv || !position.metadata?.volatility)
      return undefined;

    const margin = (position.max_ltv - position.ltv) / position.ltv;
    const dailyVolatility = position.metadata.volatility / 100;

    // Based on daily volatility, estimate hours to liquidation
    const hoursToLiquidation = (margin / dailyVolatility) * 24;
    return Math.max(0, Math.round(hoursToLiquidation));
  }

  private generateWarnings(
    position: DeFiPosition,
    riskComponents: Record<string, number>,
    protocolMetrics: any,
  ): string[] {
    const warnings: string[] = [];

    if (riskComponents.liquidationRisk > 50) {
      warnings.push("High liquidation risk: LTV ratio is elevated");
    }

    if (riskComponents.smartContractRisk > 70) {
      warnings.push("Very high smart contract risk for this protocol");
    }

    if (protocolMetrics.tvl < 50000000) {
      warnings.push("Protocol TVL is relatively low, increasing risk");
    }

    if (riskComponents.composabilityRisk > 60) {
      warnings.push(
        "High composability risk - protocol has complex dependencies",
      );
    }

    if (position.metadata?.chainBridge) {
      warnings.push("Position involves cross-chain bridge, adding bridge risk");
    }

    return warnings;
  }

  private generateRecommendations(
    position: DeFiPosition,
    riskComponents: Record<string, number>,
    warnings: string[],
  ): string[] {
    const recommendations: string[] = [];

    if (riskComponents.liquidationRisk > 60) {
      recommendations.push(
        "Reduce borrowed amount to decrease liquidation risk",
      );
      recommendations.push("Add more collateral to improve health factor");
    }

    if (riskComponents.priceVolatilityRisk > 70) {
      recommendations.push("Consider using more stable collateral");
    }

    if (warnings.some((w) => w.includes("TVL"))) {
      recommendations.push(
        "Consider moving to a larger, more established protocol",
      );
    }

    recommendations.push(
      "Monitor this position closely and set up liquidation alerts",
    );

    return recommendations;
  }

  private generateStressRecommendations(
    scenario: StressScenario,
    liquidationRisk: boolean,
  ): string[] {
    const recommendations: string[] = [];

    if (liquidationRisk) {
      recommendations.push(
        `Emergency action required: ${scenario.name} would trigger liquidation`,
      );
      recommendations.push(
        "Consider reducing leverage or increasing collateral immediately",
      );
    }

    if (scenario.priceChange && scenario.priceChange < -30) {
      recommendations.push("Position is vulnerable to large price drops");
    }

    return recommendations;
  }

  private calculatePortfolioHealthRating(
    assessments: DeFiRiskAssessment[],
  ): string {
    const avgScore =
      assessments.reduce((sum, a) => sum + a.risk_score, 0) /
      assessments.length;

    if (avgScore >= 60) return "CRITICAL";
    if (avgScore >= 45) return "POOR";
    if (avgScore >= 30) return "FAIR";
    if (avgScore >= 15) return "GOOD";
    return "EXCELLENT";
  }

  private calculateStressedRiskScore(
    position: DeFiPosition,
    scenario: StressScenario,
  ): number {
    let baseScore = 50;

    if (scenario.priceChange && scenario.priceChange < 0) {
      baseScore += Math.abs(scenario.priceChange) * 0.5;
    }

    if (scenario.protocolShutdown) {
      baseScore += 50;
    }

    return Math.min(100, baseScore);
  }
}

export interface StressScenario {
  name: string;
  priceChange?: number; // percentage
  volatilityMultiplier?: number;
  protocolShutdown?: boolean;
  liquidityDry?: boolean;
}

export interface StressTestResult {
  scenario: string;
  riskScore: number;
  liquidationRisk: boolean;
  estimatedLoss: number;
  recommendations: string[];
}

export interface RiskMonitoringResult {
  totalPositions: number;
  assessments: DeFiRiskAssessment[];
  criticalRisks: number;
  highRisks: number;
  liquidationRisks: number;
  requiresImmediateAction: boolean;
  summary: {
    averageRiskScore: number;
    healthRating: string;
  };
}
