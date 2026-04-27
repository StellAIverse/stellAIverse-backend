import {
  IsOptional,
  IsNumber,
  IsString,
  IsEnum,
  IsBoolean,
  Min,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export enum CacheBackendType {
  REDIS = "redis",
  DYNAMODB = "dynamodb",
  S3 = "s3",
  MEMORY = "memory",
}

export enum CompressionAlgorithm {
  GZIP = "gzip",
  BROTLI = "brotli",
  NONE = "none",
}

export class CacheConfigDto {
  @ApiPropertyOptional({
    description: "Enabled caching for this job",
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean = true;

  @ApiPropertyOptional({
    description: "TTL in milliseconds (default: 24 hours)",
    example: 86400000,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  ttlMs?: number = 24 * 60 * 60 * 1000; // 24 hours default

  @ApiPropertyOptional({
    description: "Cache only mode - do not execute if result is cached",
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  cacheOnly?: boolean = false;

  @ApiPropertyOptional({
    description: "Skip cache check and always execute",
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  skipCache?: boolean = false;

  @ApiPropertyOptional({
    description: "Invalidate cache on result update",
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  invalidateOnUpdate?: boolean = false;

  @ApiPropertyOptional({
    description: "Compression algorithm for large payloads",
    enum: CompressionAlgorithm,
    example: CompressionAlgorithm.GZIP,
  })
  @IsOptional()
  @IsEnum(CompressionAlgorithm)
  compression?: CompressionAlgorithm = CompressionAlgorithm.GZIP;

  @ApiPropertyOptional({
    description: "Minimum size in bytes to compress payloads",
    example: 1024,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  compressionThresholdBytes?: number = 1024; // 1KB

  @ApiPropertyOptional({
    description: "Upstream job IDs for dependency tracking",
    example: ["job-id-1", "job-id-2"],
  })
  @IsOptional()
  dependencies?: string[];

  @ApiPropertyOptional({
    description: "Tags for cache grouping and filtering",
    example: ["production", "critical"],
  })
  @IsOptional()
  tags?: string[];
}

export class CacheVersionDto {
  @ApiPropertyOptional({
    description: "Job definition hash for versioning",
    example: "hash-abc123",
  })
  @IsOptional()
  @IsString()
  jobDefinitionHash?: string;

  @ApiPropertyOptional({
    description: "Provider version for compatibility",
    example: "v1",
  })
  @IsOptional()
  @IsString()
  providerVersion?: string = "v1";

  @ApiPropertyOptional({
    description: "Schema version for result format",
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  schemaVersion?: number = 1;
}

export interface CacheEntry<T = any> {
  cacheKey: string;
  jobId: string;
  jobType: string;
  data: T;
  hash: string;
  compressed: boolean;
  createdAt: string;
  expiresAt: string;
  version: CacheVersionDto;
  metadata?: Record<string, any>;
  dependencies?: string[];
  tags?: string[];
}

export class CacheMetrics {
  @ApiPropertyOptional({
    description: "Number of cache hits",
    example: 150,
  })
  cacheHits: number = 0;

  @ApiPropertyOptional({
    description: "Number of cache misses",
    example: 50,
  })
  cacheMisses: number = 0;

  @ApiPropertyOptional({
    description: "Number of cache evictions",
    example: 10,
  })
  cacheEvictions: number = 0;

  @ApiPropertyOptional({
    description: "Total cache size in bytes",
    example: 1048576,
  })
  totalCacheSize: number = 0;

  @ApiPropertyOptional({
    description: "Compression ratio (0-1)",
    example: 0.65,
  })
  compressionRatio: number = 0;

  @ApiPropertyOptional({
    description: "Average hit latency in ms",
    example: 2.5,
  })
  avgHitLatency: number = 0;

  @ApiPropertyOptional({
    description: "Average miss latency in ms",
    example: 150.3,
  })
  avgMissLatency: number = 0;
}

// These types are not classes, just re-exported from services
// The actual DTO wrappers are defined in cache-warmer.service.ts
export type CacheWarmingJobDTO = {
  jobType: string;
  payload?: any;
  jobId?: string;
  config?: CacheConfigDto;
};
