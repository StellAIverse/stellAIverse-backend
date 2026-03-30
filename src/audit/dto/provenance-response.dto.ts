import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ProvenanceStatus,
  ProvenanceAction,
} from "../entities/provenance-record.entity";

export class ProvenanceResponseDto {
  @ApiProperty({
    description: "Unique identifier for the provenance record",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  id: string;

  @ApiProperty({
    description: "ID of the agent that performed the action",
    example: "agent-123",
  })
  agentId: string;

  @ApiPropertyOptional({
    description: "ID of the user who initiated the action",
    example: "550e8400-e29b-41d4-a716-446655440001",
  })
  userId?: string;

  @ApiProperty({
    description: "Type of action being recorded",
    enum: ProvenanceAction,
    example: ProvenanceAction.PROVIDER_CALL,
  })
  action: ProvenanceAction;

  @ApiProperty({
    description: "Input data for the action",
    example: { query: "What is the price of ETH?" },
  })
  input: Record<string, any>;

  @ApiPropertyOptional({
    description: "Output data from the action",
    example: { result: "The current price of ETH is $3,500" },
  })
  output?: Record<string, any>;

  @ApiPropertyOptional({
    description: "Provider used for the action",
    example: "openai",
  })
  provider?: string;

  @ApiPropertyOptional({
    description: "Specific model used by the provider",
    example: "gpt-4-turbo",
  })
  providerModel?: string;

  @ApiProperty({
    description: "Current status of the action",
    enum: ProvenanceStatus,
    example: ProvenanceStatus.SUCCESS,
  })
  status: ProvenanceStatus;

  @ApiPropertyOptional({
    description: "Error message if action failed",
    example: "Rate limit exceeded",
  })
  error?: string;

  @ApiPropertyOptional({
    description: "On-chain transaction hash for submissions",
    example: "0x1234567890abcdef...",
  })
  onChainTxHash?: string;

  @ApiProperty({
    description: "Cryptographic signature of the record",
    example: "0xabcdef1234567890...",
  })
  signature: string;

  @ApiProperty({
    description: "Hash of the record data for integrity verification",
    example: "0xhash1234567890...",
  })
  recordHash: string;

  @ApiPropertyOptional({
    description: "Processing duration in milliseconds",
    example: 1500,
  })
  processingDurationMs?: number;

  @ApiPropertyOptional({
    description: "Additional metadata for the record",
    example: { requestId: "req-123" },
  })
  metadata?: Record<string, any>;

  @ApiProperty({
    description: "Timestamp when the record was created",
    example: "2024-01-29T10:00:00Z",
  })
  createdAt: Date;

  @ApiPropertyOptional({
    description: "IP address of the client",
    example: "192.168.1.1",
  })
  clientIp?: string;

  @ApiPropertyOptional({
    description: "User agent string of the client",
    example: "Mozilla/5.0...",
  })
  userAgent?: string;
}

export class ProvenanceListResponseDto {
  @ApiProperty({
    description: "List of provenance records",
    type: [ProvenanceResponseDto],
  })
  data: ProvenanceResponseDto[];

  @ApiProperty({
    description: "Total number of records matching the query",
    example: 150,
  })
  total: number;

  @ApiProperty({
    description: "Current page number",
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: "Number of records per page",
    example: 20,
  })
  limit: number;

  @ApiProperty({
    description: "Total number of pages",
    example: 8,
  })
  totalPages: number;
}

export class ProvenanceVerificationResultDto {
  @ApiProperty({
    description: "Whether the signature is valid",
    example: true,
  })
  isValid: boolean;

  @ApiProperty({
    description: "The provenance record ID that was verified",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  recordId: string;

  @ApiProperty({
    description: "The record hash that was verified",
    example: "0xhash1234567890...",
  })
  recordHash: string;

  @ApiPropertyOptional({
    description: "Error message if verification failed",
    example: "Signature mismatch",
  })
  error?: string;
}

export class ProvenanceTimelineResponseDto {
  @ApiProperty({
    description: "ID of the agent",
    example: "agent-123",
  })
  agentId: string;

  @ApiProperty({
    description: "Chronological list of provenance records",
    type: [ProvenanceResponseDto],
  })
  timeline: ProvenanceResponseDto[];

  @ApiProperty({
    description: "Total number of records in the timeline",
    example: 50,
  })
  total: number;

  @ApiProperty({
    description: "Date range start",
    example: "2024-01-01T00:00:00Z",
  })
  fromDate: string;

  @ApiProperty({
    description: "Date range end",
    example: "2024-12-31T23:59:59Z",
  })
  toDate: string;
}
