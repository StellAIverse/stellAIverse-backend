import { IsString, IsEnum, IsNumber, IsOptional, Min } from "class-validator";
import { AlertCondition } from "../entities/alert.entity";

export class CreatePriceAlertDto {
  @IsString()
  userId: string;

  @IsString()
  asset: string;

  @IsEnum(AlertCondition)
  condition: AlertCondition;

  @IsNumber()
  @Min(0)
  threshold: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cooldownSeconds?: number;
}

export class CreatePortfolioAlertDto {
  @IsString()
  userId: string;

  @IsEnum(AlertCondition)
  condition: AlertCondition;

  @IsNumber()
  @Min(0)
  threshold: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cooldownSeconds?: number;
}
