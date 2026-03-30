import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from "typeorm";
import { DeFiPosition } from "./defi-position.entity";

export enum RiskLevel {
  VERY_LOW = "very_low",
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  VERY_HIGH = "very_high",
  CRITICAL = "critical",
}

@Entity("defi_risk_assessments")
@Index(["position_id", "created_at"])
@Index(["risk_level", "created_at"])
export class DeFiRiskAssessment {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => DeFiPosition)
  position: DeFiPosition;

  @Column("uuid")
  position_id: string;

  @Column("enum", { enum: RiskLevel })
  overall_risk_level: RiskLevel;

  @Column("decimal", { precision: 5, scale: 2 })
  risk_score: number; // 0-100

  @Column("json")
  risk_components: {
    smartContractRisk: number;
    liquidationRisk: number;
    priceVolatilityRisk: number;
    counterpartyRisk: number;
    governanceRisk: number;
    bridgeRisk?: number;
    composabilityRisk?: number;
  };

  @Column("json")
  protocol_metrics: {
    protocolLaunchDate?: string;
    totalValueLocked?: number;
    marketCap?: number;
    auditStatus?: string;
    insuranceCoverage?: boolean;
    insuranceAmount?: number;
  };

  @Column("json")
  position_metrics: {
    ltvRatio?: number;
    healthFactor?: number;
    liquidationPrice?: number;
    daysToLiquidation?: number;
    exposureToProtocol?: number;
    exposureToToken?: number;
  };

  @Column("json", { nullable: true })
  warnings: string[];

  @Column("json", { nullable: true })
  recommendations: string[];

  @Column("boolean", { default: false })
  liquidation_risk_detected: boolean;

  @Column("decimal", { precision: 5, scale: 2, nullable: true })
  estimated_liquidation_price: number;

  @Column("integer", { nullable: true })
  estimated_hours_to_liquidation: number;

  @CreateDateColumn()
  created_at: Date;

  @Column("timestamp", { nullable: true })
  effective_until: Date;
}
