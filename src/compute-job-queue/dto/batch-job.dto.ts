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
  IsBoolean,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { CreateJobDto, JobType } from "../compute.job.dto";

export enum BatchStrategy {
  SEQUENTIAL = "sequential",
  PARALLEL = "parallel",
  PRIORITY_BASED = "priority-based",
}

export class BatchJobConfig {
  @ApiProperty({
    description: "Strategy for processing batch jobs",
    enum: BatchStrategy,
    example: BatchStrategy.PARALLEL,
  })
  @IsEnum(BatchStrategy)
  strategy: BatchStrategy;

  @ApiPropertyOptional({
    description: "Maximum concurrent jobs for parallel processing",
    example: 5,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  maxConcurrency?: number = 5;

  @ApiPropertyOptional({
    description: "Whether to continue processing if one job fails",
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  continueOnError?: boolean = true;

  @ApiPropertyOptional({
    description: "Global priority for all jobs in the batch",
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
    description: "Global group key for the entire batch",
    example: "batch-import-2026-02-22",
  })
  @IsOptional()
  @IsString()
  groupKey?: string;

  @ApiPropertyOptional({
    description: "Global timeout for the entire batch in milliseconds",
    example: 3600000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  timeoutMs?: number;
}

export class CreateBatchJobDto {
  @ApiProperty({
    description: "Configuration for batch job processing",
    type: BatchJobConfig,
  })
  @ValidateNested()
  @Type(() => BatchJobConfig)
  config: BatchJobConfig;

  @ApiProperty({
    description: "Individual jobs in the batch",
    type: [CreateJobDto],
    example: [
      {
        type: JobType.DATA_PROCESSING,
        payload: { records: [{ id: 1, name: "Item 1" }] },
        priority: 1,
        metadata: { batchIndex: 0 },
      },
      {
        type: JobType.REPORT_GENERATION,
        payload: { format: "pdf" },
        priority: 2,
        metadata: { batchIndex: 1 },
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateJobDto)
  jobs: CreateJobDto[];

  @ApiPropertyOptional({
    description: "User ID who created the batch job",
    example: "user-123",
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    description: "Additional metadata for the entire batch",
    example: { source: "api", correlationId: "corr-123" },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class BatchJobResult {
  @ApiProperty({
    description: "ID of the batch job",
    example: "batch-job-123",
  })
  batchId: string;

  @ApiProperty({
    description: "Results for individual jobs in the batch",
    example: [
      {
        jobId: "job-1",
        status: "completed",
        result: { processed: true, recordsProcessed: 10 },
      },
      {
        jobId: "job-2",
        status: "failed",
        error: "Processing error occurred",
      },
    ],
  })
  jobResults: Array<{
    jobId: string;
    status: string;
    result?: any;
    error?: string;
  }>;

  @ApiProperty({
    description: "Overall batch status",
    example: "completed",
  })
  status: string;

  @ApiProperty({
    description: "Total number of jobs in the batch",
    example: 5,
  })
  totalJobs: number;

  @ApiProperty({
    description: "Number of completed jobs",
    example: 4,
  })
  completedJobs: number;

  @ApiProperty({
    description: "Number of failed jobs",
    example: 1,
  })
  failedJobs: number;

  @ApiProperty({
    description: "Timestamp when batch started",
    example: "2024-01-29T10:00:00Z",
  })
  startedAt: string;

  @ApiProperty({
    description: "Timestamp when batch completed",
    example: "2024-01-29T10:05:00Z",
  })
  completedAt?: string;
}
