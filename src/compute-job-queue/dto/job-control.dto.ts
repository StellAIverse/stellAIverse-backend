import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsOptional, IsEnum } from "class-validator";

export enum JobState {
  WAITING = "waiting",
  ACTIVE = "active",
  COMPLETED = "completed",
  FAILED = "failed",
  DELAYED = "delayed",
  PAUSED = "paused",
}

export class JobStatusResponseDto {
  @ApiProperty({
    description: "Job ID",
    example: "data-processing-user-123-1234567890",
  })
  id: string;

  @ApiProperty({
    description: "Job type",
    example: "data-processing",
  })
  type: string;

  @ApiProperty({
    description: "Current job state",
    enum: JobState,
    example: JobState.ACTIVE,
  })
  state: JobState;

  @ApiProperty({
    description: "Job progress (0-100)",
    example: 45,
    minimum: 0,
    maximum: 100,
  })
  progress: number;

  @ApiProperty({
    description: "Number of attempts made",
    example: 1,
  })
  attemptsMade: number;

  @ApiPropertyOptional({
    description: "Timestamp when job was created",
    example: "2026-02-25T10:00:00Z",
  })
  createdAt?: string;

  @ApiPropertyOptional({
    description: "Timestamp when job processing started",
    example: "2026-02-25T10:01:00Z",
  })
  processedOn?: string;

  @ApiPropertyOptional({
    description: "Timestamp when job finished",
    example: "2026-02-25T10:05:00Z",
  })
  finishedOn?: string;

  @ApiPropertyOptional({
    description: "Job result data (if completed)",
  })
  result?: any;

  @ApiPropertyOptional({
    description: "Error message (if failed)",
    example: "Connection timeout",
  })
  failedReason?: string;

  @ApiPropertyOptional({
    description: "Job metadata",
    example: { userId: "user-123", priority: "high" },
  })
  metadata?: Record<string, any>;
}

export class JobControlResponseDto {
  @ApiProperty({
    description: "Success status",
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: "Response message",
    example: "Job paused successfully",
  })
  message: string;

  @ApiProperty({
    description: "Job ID",
    example: "data-processing-user-123-1234567890",
  })
  jobId: string;

  @ApiPropertyOptional({
    description: "Previous job state",
    enum: JobState,
  })
  previousState?: JobState;

  @ApiPropertyOptional({
    description: "New job state",
    enum: JobState,
  })
  newState?: JobState;
}
