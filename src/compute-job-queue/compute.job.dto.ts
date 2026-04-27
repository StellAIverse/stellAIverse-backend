import {
  IsString,
  IsOptional,
  IsObject,
  IsNumber,
  Min,
  Max,
  IsEnum,
  ValidateNested,
  IsArray,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { CacheConfigDto } from "../cache/dto/cache-config.dto";

export enum JobType {
  DATA_PROCESSING = "data-processing",
  AI_COMPUTATION = "ai-computation",
  REPORT_GENERATION = "report-generation",
  EMAIL_NOTIFICATION = "email-notification",
  BATCH_OPERATION = "batch-operation",
}

export class CreateJobDto {
  @ApiProperty({
    description: "Type of job to process",
    enum: JobType,
    example: JobType.DATA_PROCESSING,
  })
  @IsEnum(JobType)
  type: JobType;

  @ApiProperty({
    description: "Job payload data",
    example: { records: [{ id: 1, name: "Item 1" }] },
  })
  @IsObject()
  payload: any;

  @ApiPropertyOptional({
    description: "User ID who created the job",
    example: "user-123",
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    description: "Additional metadata for the job",
    example: { priority: "high", source: "api" },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    description: "Queue priority (lower value means higher priority)",
    example: 1,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  priority?: number;

  @ApiPropertyOptional({
    description: "Grouping key for related jobs (batch/correlation key)",
    example: "bulk-import-2026-02-22",
  })
  @IsOptional()
  @IsString()
  groupKey?: string;

  @ApiPropertyOptional({
    description: "Cache configuration for this job",
    type: () => CacheConfigDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CacheConfigDto)
  cacheConfig?: CacheConfigDto;

  @ApiPropertyOptional({
    description: "Provider ID for content-addressable caching",
    example: "openai-gpt4",
  })
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional({
    description: "Parent job IDs this job depends on",
    example: ["job-123", "job-456"],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  parentJobIds?: string[];

  @ApiPropertyOptional({
    description: "Provider model for provenance tracking",
    example: "gpt-4-turbo",
  })
  @IsOptional()
  @IsString()
  providerModel?: string;
}

export class CreateDelayedJobDto extends CreateJobDto {
  @ApiProperty({
    description: "Delay in milliseconds before job execution",
    example: 5000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  delayMs: number;
}

export class CreateRecurringJobDto extends CreateJobDto {
  @ApiProperty({
    description: "Cron expression for recurring job",
    example: "0 0 * * *",
  })
  @IsString()
  cronExpression: string;
}

export class JobResponseDto {
  @ApiProperty({
    description: "Job ID",
    example: "data-processing-user-123-1234567890",
  })
  id: string;

  @ApiProperty({ description: "Job type", enum: JobType })
  type: string;

  @ApiProperty({ description: "Job status", example: "waiting" })
  status: string;

  @ApiProperty({ description: "Number of attempts made", example: 0 })
  attemptsMade: number;

  @ApiProperty({
    description: "Job creation timestamp",
    example: "2024-01-29T10:00:00Z",
  })
  createdAt: string;
}

export class QueueStatsDto {
  @ApiProperty({
    description: "Compute queue statistics",
    example: {
      waiting: 5,
      active: 2,
      completed: 100,
      failed: 3,
      delayed: 1,
    },
  })
  compute: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };

  @ApiProperty({
    description: "Dead letter queue statistics",
    example: { count: 2 },
  })
  deadLetter: {
    count: number;
  };
}
