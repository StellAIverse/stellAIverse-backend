import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  IsJSON,
} from "class-validator";
import { RiskTolerance, InvestmentGoal } from "../entities/risk-profile.entity";

export class CreateRiskProfileDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(RiskTolerance)
  riskTolerance?: RiskTolerance;

  @IsOptional()
  @IsEnum(InvestmentGoal)
  investmentGoal?: InvestmentGoal;

  @IsOptional()
  @IsNumber()
  targetReturn?: number;

  @IsOptional()
  @IsNumber()
  maxVolatility?: number;

  @IsOptional()
  @IsNumber()
  maxDrawdown?: number;

  @IsOptional()
  @IsNumber()
  investmentHorizonYears?: number;

  @IsOptional()
  @IsNumber()
  equityAllocationMin?: number;

  @IsOptional()
  @IsNumber()
  equityAllocationMax?: number;

  @IsOptional()
  @IsNumber()
  bondAllocationMin?: number;

  @IsOptional()
  @IsNumber()
  bondAllocationMax?: number;

  @IsOptional()
  @IsArray()
  excludedAssets?: string[];

  @IsOptional()
  @IsArray()
  requiredAssets?: string[];

  @IsOptional()
  @IsNumber()
  minESGScore?: number;
}

export class UpdateRiskProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(RiskTolerance)
  riskTolerance?: RiskTolerance;

  @IsOptional()
  @IsEnum(InvestmentGoal)
  investmentGoal?: InvestmentGoal;

  @IsOptional()
  @IsNumber()
  targetReturn?: number;

  @IsOptional()
  @IsNumber()
  maxVolatility?: number;

  @IsOptional()
  @IsNumber()
  maxDrawdown?: number;

  @IsOptional()
  @IsNumber()
  investmentHorizonYears?: number;

  @IsOptional()
  @IsArray()
  excludedAssets?: string[];

  @IsOptional()
  @IsArray()
  requiredAssets?: string[];

  @IsOptional()
  @IsNumber()
  minESGScore?: number;
}

export class RiskProfileResponseDto {
  id: string;
  name: string;
  description?: string;
  riskTolerance: RiskTolerance;
  investmentGoal: InvestmentGoal;
  targetReturn: number;
  maxVolatility: number;
  maxDrawdown: number;
  sharpeRatioTarget: number;
  equityAllocationMin: number;
  equityAllocationMax: number;
  bondAllocationMin: number;
  bondAllocationMax: number;
  investmentHorizonYears: number;
  useMachineLearning: boolean;
  createdAt: Date;
  updatedAt: Date;
}
