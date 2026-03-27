import {
  IsString,
  IsOptional,
  IsObject,
  IsEnum,
  IsUUID,
  IsNumber,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProvenanceStatus, ProvenanceAction } from '../entities/provenance-record.entity';

export class CreateProvenanceRecordDto {
  @ApiProperty({
    description: 'ID of the agent that performed the action',
    example: 'agent-123',
  })
  @IsString()
  agentId: string;

  @ApiPropertyOptional({
    description: 'ID of the user who initiated the action',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({
    description: 'Type of action being recorded',
    enum: ProvenanceAction,
    example: ProvenanceAction.PROVIDER_CALL,
  })
  @IsEnum(ProvenanceAction)
  action: ProvenanceAction;

  @ApiProperty({
    description: 'Input data for the action',
    example: { query: 'What is the price of ETH?', parameters: { temperature: 0.7 } },
  })
  @IsObject()
  input: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Output data from the action',
    example: { result: 'The current price of ETH is $3,500' },
  })
  @IsOptional()
  @IsObject()
  output?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Provider used for the action',
    example: 'openai',
  })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({
    description: 'Specific model used by the provider',
    example: 'gpt-4-turbo',
  })
  @IsOptional()
  @IsString()
  providerModel?: string;

  @ApiProperty({
    description: 'Current status of the action',
    enum: ProvenanceStatus,
    example: ProvenanceStatus.SUCCESS,
  })
  @IsEnum(ProvenanceStatus)
  status: ProvenanceStatus;

  @ApiPropertyOptional({
    description: 'Error message if action failed',
    example: 'Rate limit exceeded',
  })
  @IsOptional()
  @IsString()
  error?: string;

  @ApiPropertyOptional({
    description: 'On-chain transaction hash for submissions',
    example: '0x1234567890abcdef...',
  })
  @IsOptional()
  @IsString()
  onChainTxHash?: string;

  @ApiPropertyOptional({
    description: 'Processing duration in milliseconds',
    example: 1500,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  processingDurationMs?: number;

  @ApiPropertyOptional({
    description: 'Additional metadata for the record',
    example: { requestId: 'req-123', cacheHit: false },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'IP address of the client',
    example: '192.168.1.1',
  })
  @IsOptional()
  @IsString()
  clientIp?: string;

  @ApiPropertyOptional({
    description: 'User agent string of the client',
    example: 'Mozilla/5.0...',
  })
  @IsOptional()
  @IsString()
  userAgent?: string;
}
