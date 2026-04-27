import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  ProvenanceStatus,
  ProvenanceAction,
} from "../entities/provenance-record.entity";

export class QueryProvenanceDto {
  @ApiPropertyOptional({
    description: "Filter by agent ID",
    example: "agent-123",
  })
  @IsOptional()
  @IsString()
  agentId?: string;

  @ApiPropertyOptional({
    description: "Filter by user ID",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    description: "Filter by action type",
    enum: ProvenanceAction,
    example: ProvenanceAction.PROVIDER_CALL,
  })
  @IsOptional()
  @IsEnum(ProvenanceAction)
  action?: ProvenanceAction;

  @ApiPropertyOptional({
    description: "Filter by status",
    enum: ProvenanceStatus,
    example: ProvenanceStatus.SUCCESS,
  })
  @IsOptional()
  @IsEnum(ProvenanceStatus)
  status?: ProvenanceStatus;

  @ApiPropertyOptional({
    description: "Filter by provider",
    example: "openai",
  })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({
    description: "Filter by on-chain transaction hash",
    example: "0x1234567890abcdef...",
  })
  @IsOptional()
  @IsString()
  onChainTxHash?: string;

  @ApiPropertyOptional({
    description: "Filter records created after this date",
    example: "2024-01-01T00:00:00Z",
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: "Filter records created before this date",
    example: "2024-12-31T23:59:59Z",
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({
    description: "Page number for pagination",
    example: 1,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: "Number of records per page",
    example: 20,
    default: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: "Sort field",
    example: "createdAt",
    default: "createdAt",
  })
  @IsOptional()
  @IsString()
  sortBy?: string = "createdAt";

  @ApiPropertyOptional({
    description: "Sort order",
    example: "DESC",
    default: "DESC",
  })
  @IsOptional()
  @IsString()
  sortOrder?: "ASC" | "DESC" = "DESC";
}

export class ExportProvenanceDto {
  @ApiPropertyOptional({
    description: "Export format",
    enum: ["json", "csv"],
    example: "json",
    default: "json",
  })
  @IsOptional()
  @IsString()
  format?: "json" | "csv" = "json";
}
