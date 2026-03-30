import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, IsJSON } from 'class-validator';import { IsString, IsNumber, IsOptional, IsBoolean, IsEnum, IsJSON } from 'class-validator';










































































}  assetCount?: number;  lastRebalanceDate?: Date;  updatedAt: Date;  createdAt: Date;  rebalanceThreshold: number;  rebalanceFrequency?: string;  autoRebalanceEnabled: boolean;  targetAllocation?: Record<string, number>;  currentAllocation: Record<string, number>;  totalValue: number;  status: PortfolioStatus;  description?: string;  name: string;  id: string;export class PortfolioResponseDto {}  rebalanceThreshold?: number;  @IsNumber()  @IsOptional()  rebalanceFrequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly';  @IsEnum(['daily', 'weekly', 'monthly', 'quarterly'])  @IsOptional()  autoRebalanceEnabled?: boolean;  @IsBoolean()  @IsOptional()  totalValue?: number;  @IsNumber()  @IsOptional()  status?: PortfolioStatus;  @IsEnum(PortfolioStatus)  @IsOptional()  description?: string;  @IsString()  @IsOptional()  name?: string;  @IsString()  @IsOptional()export class UpdatePortfolioDto {}  rebalanceThreshold?: number;  @IsNumber()  @IsOptional()  rebalanceFrequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly';  @IsEnum(['daily', 'weekly', 'monthly', 'quarterly'])  @IsOptional()  autoRebalanceEnabled?: boolean;  @IsBoolean()  @IsOptional()  totalValue?: number;  @IsNumber()  @IsOptional()  description?: string;  @IsString()  @IsOptional()  name: string;  @IsString()export class CreatePortfolioDto {import { PortfolioStatus } from '../entities/portfolio.entity';import { PortfolioStatus } from '../entities/portfolio.entity';

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
  rebalanceFrequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly';

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
  rebalanceFrequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly';

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
