import {
  IsString,
  IsOptional,
  IsArray,
  IsObject,
  IsDateString,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class JobProvenanceDto {
  @ApiProperty({
    description: "Job ID",
    example: "job-123",
  })
  @IsString()
  jobId: string;

  @ApiProperty({
    description: "Hash of the job definition for reproducibility",
    example: "0x1234567890abcdef...",
  })
  @IsString()
  jobDefinitionHash: string;

  @ApiProperty({
    description: "Provider ID that executed the job",
    example: "openai-gpt4",
  })
  @IsString()
  providerId: string;

  @ApiPropertyOptional({
    description: "Specific model used by the provider",
    example: "gpt-4-turbo",
  })
  @IsOptional()
  @IsString()
  providerModel?: string;

  @ApiProperty({
    description: "Hash of the input data",
    example: "0xabcdef1234567890...",
  })
  @IsString()
  inputHash: string;

  @ApiProperty({
    description: "Original input data for reproducibility",
    example: { query: "Process this data", parameters: { temperature: 0.7 } },
  })
  @IsObject()
  inputs: any;

  @ApiPropertyOptional({
    description: "Parent job IDs this job depends on",
    example: ["job-123", "job-456"],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  parentJobIds?: string[];

  @ApiProperty({
    description: "Timestamp when the job was created",
    example: "2024-01-29T10:00:00Z",
  })
  @IsDateString()
  createdAt: string;

  @ApiProperty({
    description: "Timestamp when the job was completed",
    example: "2024-01-29T10:05:00Z",
  })
  @IsDateString()
  completedAt: string;

  @ApiPropertyOptional({
    description: "Additional metadata for the job execution",
    example: { executionTime: 5000, retryCount: 0 },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class JobLineageDto {
  @ApiProperty({
    description: "The target job ID",
    example: "job-789",
  })
  @IsString()
  jobId: string;

  @ApiProperty({
    description: "Ancestor jobs (dependencies)",
    type: [JobProvenanceDto],
  })
  ancestors: JobProvenanceDto[];

  @ApiProperty({
    description: "Descendant jobs (dependents)",
    type: [JobProvenanceDto],
  })
  descendants: JobProvenanceDto[];

  @ApiProperty({
    description: "Total depth of the lineage tree",
    example: 3,
  })
  depth: number;
}

export class JobRerunDto {
  @ApiProperty({
    description: "Original job ID to rerun",
    example: "job-123",
  })
  @IsString()
  originalJobId: string;

  @ApiPropertyOptional({
    description: "Override provider ID for the rerun",
    example: "openai-gpt4-turbo",
  })
  @IsOptional()
  @IsString()
  overrideProviderId?: string;

  @ApiPropertyOptional({
    description: "Override input parameters",
    example: { temperature: 0.8 },
  })
  @IsOptional()
  @IsObject()
  overrideInputs?: any;
}
