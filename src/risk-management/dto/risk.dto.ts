import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
  Max,
} from "class-validator";

export enum RiskModel {
  VAR = "VaR",
  CVAR = "CVaR",
  SHARPE = "sharpe",
  DRAWDOWN = "drawdown",
}

export class RiskConfigDto {
  @IsString()
  userId: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  riskTolerance: number;

  @IsNumber()
  @Min(0)
  maxPositionSize: number;

  @IsNumber()
  @Min(0)
  stopLossPercentage: number;

  @IsNumber()
  @Min(0)
  takeProfitPercentage: number;

  @IsOptional()
  @IsNumber()
  maxDrawdown?: number;
}

export class PortfolioRiskDto {
  userId: string;
  totalValue: number;
  var95: number;
  var99: number;
  cvar95: number;
  sharpeRatio: number;
  maxDrawdown: number;
  currentDrawdown: number;
  diversificationScore: number;
  riskScore: number;
  alerts: RiskAlertDto[];
  calculatedAt: Date;
}

export class RiskAlertDto {
  type:
    | "stop_loss"
    | "take_profit"
    | "drawdown"
    | "concentration"
    | "volatility";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  asset?: string;
  threshold: number;
  currentValue: number;
  triggeredAt: Date;
}

export class PositionSizeDto {
  @IsString()
  userId: string;

  @IsString()
  asset: string;

  @IsNumber()
  @Min(0)
  portfolioValue: number;

  @IsNumber()
  @Min(0)
  volatility: number;
}
