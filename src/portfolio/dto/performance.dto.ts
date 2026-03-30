import { IsOptional, IsNumber, IsDateString } from "class-validator";

export class GetPerformanceMetricsDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  limit?: number;
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
