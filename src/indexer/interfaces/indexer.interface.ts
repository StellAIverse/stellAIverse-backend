export interface IndexerEvent {
  id?: string;
  blockNumber: string;
  blockHash: string;
  txHash: string;
  logIndex: number;
  address: string;
  topic0?: string;
  data: any;
  topics?: any[];
  processedAt?: Date;
  shardId?: string;
}

export interface BlockRange {
  fromBlock: number;
  toBlock: number;
  shardId: string;
  instanceId: number;
}

export interface ShardConfig {
  shardId: string;
  startBlock: number;
  endBlock: number;
  instanceId: number;
  isActive: boolean;
}

export interface IndexerInstance {
  id: number;
  host: string;
  port: number;
  assignedShards: string[];
  lastHeartbeat: Date;
  isActive: boolean;
}

export interface IngestionResult {
  success: boolean;
  eventsProcessed: number;
  eventsFailed: number;
  errors?: string[];
}

export interface ReorgDetectionResult {
  hasReorg: boolean;
  reorgBlock: number | null;
  affectedEvents: number;
}

export interface IndexerMetrics {
  totalEventsIndexed: number;
  eventsPerSecond: number;
  averageProcessingTime: number;
  queueDepth: number;
  failedEvents: number;
  retryEvents: number;
}

export interface IIndexerQueueService {
  addBlockRange(range: BlockRange): Promise<void>;
  addEventBatch(events: IndexerEvent[]): Promise<void>;
  addReorgCheck(blockNumber: number, expectedHash: string): Promise<void>;
  getQueueStats(): Promise<QueueStats>;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface IShardManager {
  getShardForBlock(blockNumber: number): string;
  assignShardToInstance(shardId: string, instanceId: number): Promise<void>;
  releaseShard(shardId: string): Promise<void>;
  getInstanceShards(instanceId: number): Promise<string[]>;
  rebalanceShards(): Promise<void>;
}

export interface IBlockCoordinator {
  acquireBlockRange(
    instanceId: number,
    preferredRange?: BlockRange,
  ): Promise<BlockRange | null>;
  releaseBlockRange(range: BlockRange): Promise<void>;
  markRangeComplete(range: BlockRange): Promise<void>;
  getGlobalProgress(): Promise<number>;
}
