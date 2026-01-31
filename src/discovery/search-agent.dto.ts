import { IsOptional, IsArray, IsEnum, IsInt, Min, Max, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AgentCapability, AgentStatus } from '../entities/agent.entity';

export enum SortBy {
  POPULARITY = 'popularity',
  RATING = 'rating',
  RECENT = 'recent',
  USAGE = 'usage',
  NAME = 'name',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class SearchAgentsDto {
  @ApiPropertyOptional({
    description: 'Search query for agent name or description',
    example: 'code generation',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  query?: string;

  @ApiPropertyOptional({
    description: 'Filter by agent capabilities',
    enum: AgentCapability,
    isArray: true,
    example: [AgentCapability.CODE_EXECUTION, AgentCapability.TEXT_GENERATION],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(AgentCapability, { each: true })
  capabilities?: AgentCapability[];

  @ApiPropertyOptional({
    description: 'Filter by agent status',
    enum: AgentStatus,
    example: AgentStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(AgentStatus)
  status?: AgentStatus;

  @ApiPropertyOptional({
    description: 'Minimum average rating (0-5)',
    example: 4.0,
    minimum: 0,
    maximum: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({
    description: 'Filter by tags',
    isArray: true,
    example: ['ai', 'automation'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Sort by field',
    enum: SortBy,
    default: SortBy.POPULARITY,
    example: SortBy.POPULARITY,
  })
  @IsOptional()
  @IsEnum(SortBy)
  sortBy?: SortBy = SortBy.POPULARITY;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: SortOrder,
    default: SortOrder.DESC,
    example: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}