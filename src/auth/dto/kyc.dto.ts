import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsDateString,
  IsOptional,
  IsNumber,
  MinLength,
  IsEnum,
  IsUUID,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { DocumentType } from "../entities/kyc.entity";

export class KycSubmitDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsDateString()
  dateOfBirth: string;

  @IsString()
  @IsNotEmpty()
  country: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  occupation?: string;

  @IsString()
  @IsOptional()
  sourceOfFunds?: string;

  @IsNumber()
  @IsOptional()
  annualIncome?: number;

  @IsString()
  @IsOptional()
  taxId?: string;

  @IsString()
  @IsOptional()
  nationality?: string;
}

export class KycDocumentUploadDto {
  @IsEnum(DocumentType)
  documentType: DocumentType;

  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @IsNumber()
  fileSize: number;
}

export class KycStatusResponseDto {
  @IsUUID()
  userId: string;

  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  submittedAt?: string;

  @IsOptional()
  @IsString()
  reviewedAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  documents?: KycDocumentDto[];
}

export class KycDocumentDto {
  @IsUUID()
  id: string;

  @IsEnum(DocumentType)
  documentType: DocumentType;

  @IsString()
  fileName: string;

  @IsString()
  mimeType: string;

  @IsNumber()
  fileSize: number;

  @IsString()
  verified: boolean;

  @IsOptional()
  @IsString()
  verifiedAt?: string;

  @IsOptional()
  @IsString()
  verificationNotes?: string;
}

export class KycReviewDto {
  @IsString()
  @IsNotEmpty()
  status: "verified" | "rejected";

  @IsOptional()
  @IsString()
  notes?: string;
}

export class TwoFactorSetupDto {
  @IsString()
  @IsNotEmpty()
  type: "totp" | "sms" | "email";
}

export class TwoFactorVerifyDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsOptional()
  @IsString()
  backupCode?: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}</content>
<parameter name="filePath">/workspaces/stellAIverse-backend/src/auth/dto/kyc.dto.ts