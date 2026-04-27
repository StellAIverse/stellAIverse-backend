import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  ValidateNested,
  IsArray,
  IsUUID,
} from "class-validator";
import { Type } from "class-transformer";

export enum KycStatus {
  PENDING = "pending",
  VERIFIED = "verified",
  REJECTED = "rejected",
}

export enum ComplianceAlertSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export class WatchlistEntryDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  riskCategory?: string;
}

export class KycProfileDto {
  @IsString()
  userId: string;

  @IsString()
  fullName: string;

  @IsString()
  dateOfBirth: string;

  @IsString()
  country: string;

  @IsString()
  idNumber: string;

  @IsEnum(KycStatus)
  status: KycStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ComplianceTransactionDto {
  @IsString()
  txId: string;

  @IsString()
  userId: string;

  @IsString()
  fromAddress: string;

  @IsString()
  toAddress: string;

  @IsNumber()
  amount: number;

  @IsString()
  asset: string;

  @IsOptional()
  @IsString()
  sourceCountry?: string;

  @IsOptional()
  @IsString()
  destinationCountry?: string;

  @IsOptional()
  @IsString()
  timestamp?: string;
}

export class FrameworkConfigDto {
  @IsString()
  framework: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredKycLevels?: string[];

  @IsOptional()
  @IsNumber()
  transactionThreshold?: number;
}

export class ComplianceAlertDto {
  @IsString()
  type: string;

  @IsEnum(ComplianceAlertSeverity)
  severity: ComplianceAlertSeverity;

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  txId?: string;

  @IsNumber()
  score: number;

  @IsString()
  triggeredAt: string;
}
