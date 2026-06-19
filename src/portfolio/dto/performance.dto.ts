import {
  IsOptional,
  IsNumber,
  IsDateString,
  IsEnum,
  IsString,
  Min,
  Max,
} from "class-validator";
import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";

export enum PerformancePeriod {
  DAY = "1D",
  WEEK = "1W",
  MONTH = "1M",
  THREE_MONTHS = "3M",
  SIX_MONTHS = "6M",
  YEAR_TO_DATE = "YTD",
  ONE_YEAR = "1Y",
  THREE_YEARS = "3Y",
  ALL = "ALL",
}

export class GetPerformanceMetricsDto {
  @ApiPropertyOptional({ description: "Start date (ISO 8601)" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: "End date (ISO 8601)" })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: "Max records to return" })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}

export class GetPerformanceByPeriodDto {
  @ApiProperty({
    enum: PerformancePeriod,
    description: "Predefined time period",
    example: PerformancePeriod.ONE_YEAR,
  })
  @IsEnum(PerformancePeriod)
  period: PerformancePeriod;
}

export class GetBenchmarkComparisonDto {
  @ApiProperty({ description: "Benchmark ticker symbol (e.g. SPY, BTC)" })
  @IsString()
  benchmarkTicker: string;

  @ApiPropertyOptional({ description: "Start date (ISO 8601)" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: "End date (ISO 8601)" })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class RecordSnapshotDto {
  @ApiProperty({ description: "Current portfolio value" })
  @IsNumber()
  @Min(0)
  portfolioValue: number;

  @ApiProperty({ description: "Asset allocation map (ticker → %)  " })
  allocation: Record<string, number>;

  @ApiPropertyOptional({ description: "Previous portfolio value" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  previousValue?: number;
}

export class GetVaRDto {
  @ApiPropertyOptional({
    description: "Confidence level (0–1)",
    default: 0.95,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(0.999)
  @Type(() => Number)
  confidence?: number;
}

export class PerformanceMetricResponseDto {
  id: string;
  dateTime: Date;
  portfolioValue: number;
  dailyReturn?: number;
  cumulativeReturn?: number;
  yearToDateReturn?: number;
  oneYearReturn?: number;
  volatility?: number;
  sharpeRatio?: number;
  sortinoRatio?: number;
  maxDrawdown?: number;
  currentDrawdown?: number;
  valueAtRisk95?: number;
  allocation?: Record<string, number>;
  assetContribution?: Record<string, number>;
  riskContribution?: Record<string, number>;
}

export class PortfolioSummaryDto {
  portfolioId: string;
  portfolioName: string;
  totalValue: number;
  currentAllocation: Record<string, number>;
  targetAllocation?: Record<string, number>;
  assetCount: number;
  dayReturn?: number;
  yearToDateReturn?: number;
  oneYearReturn?: number;
  volatility?: number;
  sharpeRatio?: number;
  maxDrawdown?: number;
  lastRebalanceDate?: Date;
  nextRebalanceDate?: Date;
}
