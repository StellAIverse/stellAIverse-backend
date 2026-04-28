import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CursorPaginationDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  direction?: 'forward' | 'backward' = 'forward';
}

export interface PaginationResult<T> {
  data: T[];
  nextCursor?: string;
  prevCursor?: string;
  hasMore: boolean;
  hasPrevious: boolean;
  total?: number;
}

export interface CursorOptions {
  cursor?: string;
  limit: number;
  direction: 'forward' | 'backward';
  orderBy: string;
  orderDirection: 'ASC' | 'DESC';
}
