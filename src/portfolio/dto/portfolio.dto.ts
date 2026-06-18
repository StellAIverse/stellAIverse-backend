import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsJSON,
} from "class-validator";
import { PortfolioStatus } from "../entities/portfolio.entity";
export class CreatePortfolioDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  totalValue?: number;

  @IsOptional()
  @IsJSON()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  autoRebalanceEnabled?: boolean;

  @IsOptional()
  @IsString()
  rebalanceFrequency?: "daily" | "weekly" | "monthly" | "quarterly";

  @IsOptional()
  @IsNumber()
  rebalanceThreshold?: number;
}

export class UpdatePortfolioDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(PortfolioStatus)
  status?: PortfolioStatus;

  @IsOptional()
  @IsBoolean()
  autoRebalanceEnabled?: boolean;

  @IsOptional()
  @IsString()
  rebalanceFrequency?: "daily" | "weekly" | "monthly" | "quarterly";

  @IsOptional()
  @IsNumber()
  rebalanceThreshold?: number;

  @IsOptional()
  @IsJSON()
  metadata?: Record<string, any>;
}

export class PortfolioResponseDto {
  id: string;
  name: string;
  description?: string;
  status: PortfolioStatus;
  totalValue: number;
  currentAllocation: Record<string, number>;
  targetAllocation?: Record<string, number>;
  autoRebalanceEnabled: boolean;
  rebalanceFrequency?: string;
  rebalanceThreshold: number;
  lastRebalanceDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}
