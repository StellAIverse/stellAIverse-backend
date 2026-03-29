import { IsString, IsNumber, IsEnum, IsOptional, IsJSON, IsBoolean, IsArray, Min, Max } from 'class-validator';
import { StrategyType } from '../entities/defi-yield-strategy.entity';

export class CreateYieldStrategyDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(StrategyType)
  strategy_type: StrategyType;

  @IsArray()
  @IsOptional()
  protocols?: string[];

  @IsArray()
  tokens: string[];

  @IsNumber()
  @Min(0)
  total_allocation: number;

  @IsNumber()
  @Min(0)
  target_min_apy: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  target_max_slippage?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  max_risk_score?: number;

  @IsJSON()
  allocation_weights: Record<string, number>;

  @IsJSON()
  @IsOptional()
  constraints?: {
    maxLTVRatio?: number;
    minHealthFactor?: number;
    preferredNetwork?: string[];
    excludeProtocols?: string[];
  };

  @IsBoolean()
  @IsOptional()
  auto_rebalance_enabled?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(1)
  rebalance_frequency_days?: number;

  @IsBoolean()
  @IsOptional()
  auto_compound_enabled?: boolean;
}

export class UpdateYieldStrategyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  total_allocation?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  target_min_apy?: number;

  @IsJSON()
  @IsOptional()
  allocation_weights?: Record<string, number>;

  @IsBoolean()
  @IsOptional()
  auto_rebalance_enabled?: boolean;

  @IsBoolean()
  @IsOptional()
  auto_compound_enabled?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(1)
  rebalance_frequency_days?: number;
}

export class YieldStrategyResponseDto {
  id: string;
  name: string;
  description?: string;
  strategy_type: StrategyType;
  status: string;
  protocols: string[];
  tokens: string[];
  total_allocation: number;
  target_min_apy: number;
  allocation_weights: Record<string, number>;
  auto_rebalance_enabled: boolean;
  auto_compound_enabled: boolean;
  current_apy: number;
  accumulated_yield: number;
  current_value: number;
  performance_metrics?: any;
  rebalance_count: number;
  last_rebalanced_at?: Date;
  last_compounded_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export class RebalanceStrategyDto {
  @IsString()
  strategy_id: string;

  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

export class CompoundRewardsDto {
  @IsString()
  strategy_id: string;

  @IsBoolean()
  @IsOptional()
  claim_all?: boolean;
}

export class StrategyPerformanceDto {
  @IsString()
  strategy_id: string;

  @IsNumber()
  @IsOptional()
  days?: number;
}

export class StrategyPerformanceResponseDto {
  strategy_id: string;
  strategy_name: string;
  total_return: number;
  annualized_return: number;
  current_apy: number;
  volatility: number;
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  avg_yield_per_day: number;
  total_yield_earned: number;
  performance_vs_benchmark: number;
  rebalance_times: string[];
  compound_times: string[];
  period_start: Date;
  period_end: Date;
}
