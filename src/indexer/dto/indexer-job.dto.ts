import {
  IsString,
  IsNumber,
  IsOptional,
  IsObject,
  IsArray,
  IsBoolean,
} from "class-validator";

export class BlockRangeDto {
  @IsNumber()
  fromBlock: number;

  @IsNumber()
  toBlock: number;

  @IsString()
  @IsOptional()
  shardId?: string;

  @IsNumber()
  @IsOptional()
  instanceId?: number;
}

export class EventIngestionDto {
  @IsString()
  blockNumber: string;

  @IsString()
  blockHash: string;

  @IsString()
  txHash: string;

  @IsNumber()
  logIndex: number;

  @IsString()
  address: string;

  @IsString()
  @IsOptional()
  topic0?: string;

  @IsObject()
  data: any;

  @IsArray()
  @IsOptional()
  topics?: any[];

  @IsString()
  @IsOptional()
  shardId?: string;

  @IsNumber()
  @IsOptional()
  retryCount?: number;
}

export class IndexerConfigDto {
  @IsString()
  @IsOptional()
  rpcUrl?: string;

  @IsNumber()
  @IsOptional()
  confirmations?: number;

  @IsNumber()
  @IsOptional()
  startBlock?: number;

  @IsString()
  @IsOptional()
  contractAddress?: string;

  @IsString()
  @IsOptional()
  topic0?: string;

  @IsNumber()
  @IsOptional()
  batchSize?: number;

  @IsNumber()
  @IsOptional()
  pollIntervalMs?: number;

  @IsNumber()
  @IsOptional()
  shardCount?: number;

  @IsNumber()
  @IsOptional()
  maxConcurrency?: number;
}

export class ShardAssignmentDto {
  @IsString()
  shardId: string;

  @IsNumber()
  instanceId: number;

  @IsNumber()
  fromBlock: number;

  @IsNumber()
  toBlock: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class IndexerHealthDto {
  @IsString()
  instanceId: string;

  @IsNumber()
  lastProcessedBlock: number;

  @IsNumber()
  currentBlock: number;

  @IsNumber()
  lagBlocks: number;

  @IsBoolean()
  isHealthy: boolean;

  @IsNumber()
  @IsOptional()
  queueDepth?: number;

  @IsNumber()
  @IsOptional()
  processingRate?: number;
}

export class ReorgCheckDto {
  @IsNumber()
  blockNumber: number;

  @IsString()
  expectedHash: string;

  @IsString()
  @IsOptional()
  actualHash?: string;

  @IsBoolean()
  @IsOptional()
  isReorg?: boolean;
}
