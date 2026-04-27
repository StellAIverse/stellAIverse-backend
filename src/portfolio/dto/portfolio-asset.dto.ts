import { IsString, IsOptional, IsNumber, IsDateString } from "class-validator";

export class PortfolioAssetDto {
  @IsString()
  ticker: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  currentPrice?: number;

  @IsOptional()
  @IsNumber()
  costBasis?: number;
}

export class AddAssetToPortfolioDto {
  @IsString()
  ticker: string;

  @IsString()
  name: string;

  @IsNumber()
  quantity: number;

  @IsOptional()
  @IsNumber()
  currentPrice?: number;

  @IsOptional()
  @IsNumber()
  costBasis?: number;
}

export class UpdatePortfolioAssetDto {
  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  currentPrice?: number;

  @IsOptional()
  @IsNumber()
  costBasis?: number;
}

export class PortfolioAssetResponseDto {
  id: string;
  ticker: string;
  name: string;
  type: string;
  quantity: number;
  currentPrice?: number;
  value: number;
  allocationPercentage: number;
  suggestedAllocation?: number;
  expectedReturn?: number;
  volatility?: number;
  beta?: number;
  unrealizedGain?: number;
  updatedAt: Date;
}
