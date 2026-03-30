import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsJSON,
  IsBoolean,
  Min,
  Max,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { DeFiProtocol, PositionType } from "../entities/defi-position.entity";

export class CreateDeFiPositionDto {
  @IsEnum(DeFiProtocol)
  protocol: DeFiProtocol;

  @IsEnum(PositionType)
  position_type: PositionType;

  @IsString()
  contract_address: string;

  @IsString()
  wallet_address: string;

  @IsString()
  token_symbol: string;

  @IsString()
  @IsOptional()
  pair_symbol?: string;

  @IsNumber()
  @Min(0)
  principal_amount: number;

  @IsBoolean()
  @IsOptional()
  auto_compound_enabled?: boolean;
}

export class UpdateDeFiPositionDto {
  @IsBoolean()
  @IsOptional()
  auto_compound_enabled?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(0)
  current_amount?: number;

  @IsJSON()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class DeFiPositionResponseDto {
  id: string;
  protocol: DeFiProtocol;
  position_type: PositionType;
  status: string;
  contract_address: string;
  wallet_address: string;
  token_symbol: string;
  principal_amount: number;
  current_amount: number;
  accumulated_yield: number;
  apy: number;
  risk_score: number;
  ltv?: number;
  collateral_value?: number;
  borrowed_value?: number;
  liquidation_threshold?: number;
  reward_tokens?: any[];
  auto_compound_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export class DeFiPositionDetailDto extends DeFiPositionResponseDto {
  yield_records: DeFiYieldRecordResponseDto[];
  transactions: DeFiTransactionResponseDto[];
  risk_assessment?: DeFiRiskAssessmentResponseDto;
}

export class DeFiYieldRecordResponseDto {
  id: string;
  amount: number;
  token_symbol: string;
  token_value: number;
  apy: number;
  yield_type: string;
  claimed: boolean;
  created_at: Date;
  claim_date?: Date;
}

export class CreateDeFiTransactionDto {
  @IsString()
  position_id: string;

  @IsString()
  @IsEnum([
    "deposit",
    "withdraw",
    "borrow",
    "repay",
    "claim_reward",
    "swap",
    "stake",
    "unstake",
  ])
  transaction_type: string;

  @IsNumber()
  @Min(0)
  amount_in: number;

  @IsString()
  token_in: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  amount_out?: number;

  @IsString()
  @IsOptional()
  token_out?: string;

  @IsString()
  @IsOptional()
  network?: string;
}

export class SimulateTransactionDto extends CreateDeFiTransactionDto {
  @IsNumber()
  @IsOptional()
  @Min(0)
  slippage_tolerance?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  max_gas_price?: number;
}

export class ExecuteTransactionDto {
  @IsString()
  transaction_id: string;

  @IsBoolean()
  @IsOptional()
  approve_if_needed?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(0)
  gas_price_multiplier?: number;
}

export class DeFiTransactionResponseDto {
  id: string;
  position_id: string;
  transaction_type: string;
  status: string;
  transaction_hash?: string;
  amount_in: number;
  token_in: string;
  amount_out?: number;
  token_out?: string;
  gas_used: number;
  gas_price_gwei: number;
  gas_cost_usd: number;
  network: string;
  error_message?: string;
  created_at: Date;
  executed_at?: Date;
}

export class ClaimRewardsDto {
  @IsString()
  position_id: string;

  @IsBoolean()
  @IsOptional()
  claim_all?: boolean;

  @IsString()
  @IsOptional()
  token_symbol?: string;
}

export class WithdrawDeFiPositionDto {
  @IsString()
  position_id: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsBoolean()
  @IsOptional()
  close_position?: boolean;

  @IsBoolean()
  @IsOptional()
  claim_rewards?: boolean;
}

export class EmergencyExitDto {
  @IsString()
  position_id: string;

  @IsBoolean()
  @IsOptional()
  max_slippage?: number;

  @IsString()
  @IsOptional()
  recipient?: string;
}

export class DeFiRiskAssessmentResponseDto {
  id: string;
  position_id: string;
  overall_risk_level: string;
  risk_score: number;
  risk_components: Record<string, number>;
  protocol_metrics: Record<string, any>;
  position_metrics: Record<string, any>;
  liquidation_risk_detected: boolean;
  estimated_liquidation_price?: number;
  estimated_hours_to_liquidation?: number;
  warnings: string[];
  recommendations: string[];
  created_at: Date;
}

export class DeFiPortfolioSummaryDto {
  total_positions: number;
  total_value: number;
  total_collateral: number;
  total_borrowed: number;
  net_value: number;
  average_apy: number;
  accumulated_yield: number;
  total_unclaimed_rewards: number;
  risk_score: number;
  positions_by_protocol: Record<
    string,
    { count: number; value: number; apy: number }
  >;
  positions_by_type: Record<string, { count: number; value: number }>;
  liquidation_risks: number;
  health_factor: number;
}

export class DeFiAnalyticsDto {
  total_positions: number;
  active_positions: number;
  closed_positions: number;
  total_yield_earned: number;
  average_apy: number;
  highest_apy_position: DeFiPositionResponseDto;
  largest_position: DeFiPositionResponseDto;
  protocol_distribution: Record<string, number>;
  risk_distribution: Record<string, number>;
  performance_chart: Array<{ date: Date; value: number; apy: number }>;
}
