import { IsString, IsEnum, IsOptional, IsNumber, Min } from 'class-validator';

export enum Timeframe {
  ONE_MIN = '1m',
  FIVE_MIN = '5m',
  ONE_HOUR = '1h',
  ONE_DAY = '1d',
}

export class PredictionRequestDto {
  @IsString()
  symbol: string;

  @IsEnum(Timeframe)
  timeframe: Timeframe;

  @IsOptional()
  @IsNumber()
  @Min(1)
  periods?: number;
}

export class PredictionResponseDto {
  symbol: string;
  timeframe: Timeframe;
  currentPrice: number;
  predictions: PricePrediction[];
  confidence: number;
  modelVersion: string;
  generatedAt: Date;
}

export class PricePrediction {
  timestamp: Date;
  predictedPrice: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;
}

export class ModelMetricsDto {
  modelVersion: string;
  accuracy: number;
  mse: number;
  mae: number;
  lastTrainedAt: Date;
  trainingDataPoints: number;
  supportedSymbols: string[];
  supportedTimeframes: Timeframe[];
}

export class BacktestRequestDto {
  @IsString()
  symbol: string;

  @IsEnum(Timeframe)
  timeframe: Timeframe;

  @IsNumber()
  startTimestamp: number;

  @IsNumber()
  endTimestamp: number;
}
