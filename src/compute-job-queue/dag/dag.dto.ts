import {
  IsString,
  IsOptional,
  IsObject,
  IsNumber,
  IsArray,
  IsEnum,
  ValidateNested,
  Min,
  Max,
  ArrayMinSize,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  DependencyCondition,
  DagNodeStatus,
  DagWorkflowStatus,
} from "./dag.interfaces";

/** Describes a single dependency edge in the request payload. */
export class DagDependencyDto {
  @ApiProperty({
    description: "ID of the upstream job this node depends on",
    example: "extract-data",
  })
  @IsString()
  jobId: string;

  @ApiPropertyOptional({
    description: "Condition under which the dependent job should run",
    enum: DependencyCondition,
    default: DependencyCondition.ON_SUCCESS,
    example: DependencyCondition.ON_SUCCESS,
  })
  @IsOptional()
  @IsEnum(DependencyCondition)
  condition?: DependencyCondition = DependencyCondition.ON_SUCCESS;
}

/** Describes a single node (job) within the workflow submission. */
export class CreateDagNodeDto {
  @ApiProperty({
    description: "Unique job identifier within the workflow",
    example: "extract-data",
  })
  @IsString()
  jobId: string;

  @ApiProperty({
    description: "Job type routed to the processor",
    example: "data-processing",
  })
  @IsString()
  type: string;

  @ApiProperty({
    description: "Job payload data",
    example: { source: "s3://bucket/raw-data.csv" },
  })
  @IsObject()
  payload: any;

  @ApiPropertyOptional({
    description: "User ID who owns this job",
    example: "user-123",
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    description: "Queue priority (lower = higher priority)",
    example: 5,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  priority?: number;

  @ApiPropertyOptional({
    description: "Grouping key for correlation",
    example: "ml-pipeline-run-42",
  })
  @IsOptional()
  @IsString()
  groupKey?: string;

  @ApiPropertyOptional({
    description: "Additional metadata forwarded to the job",
    example: { retries: 2 },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    description: "Upstream dependencies with optional conditions",
    type: [DagDependencyDto],
    example: [{ jobId: "extract-data", condition: "onSuccess" }],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DagDependencyDto)
  dependsOn?: DagDependencyDto[];
}

/** Top-level request body to submit a DAG workflow. */
export class CreateDagWorkflowDto {
  @ApiPropertyOptional({
    description: "Human-readable workflow name",
    example: "ML Training Pipeline",
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: "Nodes (jobs) that compose the workflow",
    type: [CreateDagNodeDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateDagNodeDto)
  nodes: CreateDagNodeDto[];

  @ApiPropertyOptional({
    description: "User ID who submitted the workflow",
    example: "user-123",
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    description: "Workflow-level metadata",
    example: { environment: "staging" },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

export class DagNodeResponseDto {
  @ApiProperty({ example: "extract-data" })
  jobId: string;

  @ApiProperty({ example: "data-processing" })
  type: string;

  @ApiProperty({ enum: DagNodeStatus, example: DagNodeStatus.PENDING })
  status: DagNodeStatus;

  @ApiPropertyOptional()
  queueJobId?: string;

  @ApiPropertyOptional()
  result?: any;

  @ApiPropertyOptional()
  error?: string;

  @ApiPropertyOptional({ type: [DagDependencyDto] })
  dependsOn?: DagDependencyDto[];
}

export class DagWorkflowResponseDto {
  @ApiProperty({ example: "wf-abc123" })
  workflowId: string;

  @ApiPropertyOptional({ example: "ML Training Pipeline" })
  name?: string;

  @ApiProperty({ enum: DagWorkflowStatus })
  status: DagWorkflowStatus;

  @ApiProperty({ type: [DagNodeResponseDto] })
  nodes: DagNodeResponseDto[];

  @ApiProperty({ description: "Topological execution order", type: [String] })
  topologicalOrder: string[];

  @ApiProperty({ example: "2026-02-24T09:00:00.000Z" })
  createdAt: string;

  @ApiPropertyOptional({ example: "2026-02-24T09:05:00.000Z" })
  completedAt?: string;
}

export class DagValidationResponseDto {
  @ApiProperty({ example: true })
  valid: boolean;

  @ApiProperty({ type: [String], example: [] })
  errors: string[];

  @ApiPropertyOptional({ type: [String] })
  topologicalOrder?: string[];
}
