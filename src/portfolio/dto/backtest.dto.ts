import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsEnum,
  IsArray,
} from "class-validator";
import { BacktestStatus } from "../entities/backtest-result.entity";

export class CreateBacktestDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumber()
  initialCapital: number;

  @IsString()
  strategy: string;

  @IsArray()
  assets: Array<{ ticker: string; weight: number }>;

  @IsOptional()
  @IsString()
  benchmarkTicker?: string;

  @IsOptional()
  @IsNumber()
  rebalanceFrequency?: number; // months
}

export class BacktestResultResponseDto {
  id: string;
  name: string;
  description?: string;
  status: BacktestStatus;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  finalValue?: number;
  totalReturn?: number;
  annualizedReturn?: number;
  volatility?: number;
  sharpeRatio?: number;
  sortinoRatio?: number;
  maxDrawdown?: number;
  benchmarkReturn?: number;
  alpha?: number;
  beta?: number;
  Correlation?: number;
  totalTrades?: number;
  winRate?: number;
  profitFactor?: number;
  createdAt: Date;
  completedAt?: Date;
}
