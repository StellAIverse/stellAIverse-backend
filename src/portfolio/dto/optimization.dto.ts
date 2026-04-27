import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  IsJSON,
  IsDateString,
} from "class-validator";
import {
  OptimizationMethod,
  OptimizationStatus,
} from "../entities/optimization-history.entity";

export class CreateOptimizationDto {
  @IsEnum(OptimizationMethod)
  method: OptimizationMethod;

  @IsString()
  portfolioId: string;

  @IsOptional()
  @IsJSON()
  parameters?: Record<string, any>;

  @IsOptional()
  @IsString()
  riskProfileId?: string;

  @IsOptional()
  @IsNumber()
  targetReturn?: number;

  @IsOptional()
  @IsNumber()
  maxVolatility?: number;

  @IsOptional()
  @IsArray()
  constraints?: Array<{ asset: string; min: number; max: number }>;
}

export class ApproveOptimizationDto {
  @IsString()
  optimizationId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectOptimizationDto {
  @IsString()
  optimizationId: string;

  @IsString()
  rejectionReason: string;
}

export class ImplementOptimizationDto {
  @IsString()
  optimizationId: string;

  @IsOptional()
  @IsString()
  executionNotes?: string;
}

export class OptimizationHistoryResponseDto {
  id: string;
  method: OptimizationMethod;
  status: OptimizationStatus;
  suggestedAllocation: Record<string, number>;
  expectedReturn?: number;
  expectedVolatility?: number;
  expectedSharpeRatio?: number;
  valueAtRisk?: number;
  maxDrawdown?: number;
  improvementScore?: number;
  backtestedMetrics?: Record<string, number>;
  createdAt: Date;
  completedAt?: Date;
  implementedAt?: Date;
}
