import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AIProviderType } from '../interfaces/provider.interface';

export class BaseRequestDto {
  @ApiProperty({ enum: AIProviderType })
  @IsString()
  provider: AIProviderType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return Boolean(value);
  })
  @IsBoolean()
  stream?: boolean;
}

export class ErrorResponseDto {
  @ApiProperty({ type: String })
  error: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  statusCode?: number;
}

export class EmbeddingResponseDto {
  @ApiProperty({ type: [Number], description: 'Embedding vector' })
  embedding: number[];

  @ApiProperty({ type: String, description: 'Input text' })
  input: string;

  @ApiProperty({ type: String, description: 'Model used' })
  model: string;
}