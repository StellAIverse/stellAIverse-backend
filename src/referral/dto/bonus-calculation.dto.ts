import { IsString, IsEnum, IsNumber, IsBoolean, IsOptional, IsDate, Min, Max } from "class-validator";
import { BonusCategory, TimeDecayType } from "../bonus-configuration.entity";

export class CreateBonusConfigurationDto {
  @IsEnum(BonusCategory)
  category: BonusCategory;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  baseWeight?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  bonusMultiplier?: number;

  @IsEnum(TimeDecayType)
  @IsOptional()
  decayType?: TimeDecayType;

  @IsNumber()
  @Min(0)
  @IsOptional()
  decayRate?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minimumThreshold?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maximumBonus?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  allowCompounding?: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  compoundMultiplier?: number;

  @IsDate()
  @IsOptional()
  startDate?: Date;

  @IsDate()
  @IsOptional()
  endDate?: Date;

  @IsOptional()
  conditions?: Record<string, any>;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateBonusConfigurationDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  baseWeight?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  bonusMultiplier?: number;

  @IsEnum(TimeDecayType)
  @IsOptional()
  decayType?: TimeDecayType;

  @IsNumber()
  @Min(0)
  @IsOptional()
  decayRate?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minimumThreshold?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maximumBonus?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  allowCompounding?: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  compoundMultiplier?: number;

  @IsDate()
  @IsOptional()
  startDate?: Date;

  @IsDate()
  @IsOptional()
  endDate?: Date;

  @IsOptional()
  conditions?: Record<string, any>;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class CalculateBonusDto {
  @IsString()
  userId: string;

  @IsEnum(BonusCategory)
  category: BonusCategory;

  @IsNumber()
  @Min(0)
  baseAmount: number;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class BonusCalculationResultDto {
  userId: string;
  category: BonusCategory;
  baseAmount: number;
  appliedWeight: number;
  decayFactor: number;
  compoundBonus: number;
  finalAmount: number;
  decayType: TimeDecayType;
  calculationDetails: Record<string, any>;
}
