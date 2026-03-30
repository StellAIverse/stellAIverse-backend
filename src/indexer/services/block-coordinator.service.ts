import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import { IBlockCoordinator, BlockRange } from "../interfaces/indexer.interface";

interface BlockRangeStatus {
  range: BlockRange;
  status: "pending" | "processing" | "completed" | "failed";
  instanceId: number;
  acquiredAt: string;
  completedAt?: string;
  retryCount: number;
}

@Injectable()
export class BlockCoordinatorService implements IBlockCoordinator {
  private readonly logger = new Logger(BlockCoordinatorService.name);
  private readonly redis: Redis;
  private readonly rangeSize: number;
  private readonly lockTTL: number;
  private readonly keyPrefix = "indexer:range:";
  private readonly progressKey = "indexer:global:progress";

  constructor(private readonly configService: ConfigService) {
    this.rangeSize = this.configService.get<number>("INDEXER_RANGE_SIZE", 1000);
    this.lockTTL = this.configService.get<number>(
      "INDEXER_LOCK_TTL_SECONDS",
      300,
    );

    this.redis = new Redis({
      host: this.configService.get<string>("REDIS_HOST", "localhost"),
      port: this.configService.get<number>("REDIS_PORT", 6379),
      password: this.configService.get<string>("REDIS_PASSWORD"),
      db: this.configService.get<number>("REDIS_DB", 0),
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
  }

  /**
   * Initialize block ranges for processing
   */
  async initializeRanges(startBlock: number, endBlock: number): Promise<void> {
    const rangeCount = Math.ceil((endBlock - startBlock + 1) / this.rangeSize);

    for (let i = 0; i < rangeCount; i++) {
      const fromBlock = startBlock + i * this.rangeSize;
      const toBlock = Math.min(fromBlock + this.rangeSize - 1, endBlock);
      const rangeId = `range-${fromBlock}-${toBlock}`;

      const rangeStatus: BlockRangeStatus = {
        range: {
          fromBlock,
          toBlock,
          shardId: "",
          instanceId: -1,
        },
        status: "pending",
        instanceId: -1,
        acquiredAt: "",
        retryCount: 0,
      };

      await this.redis.setex(
        `${this.keyPrefix}${rangeId}`,
        86400, // 24 hour TTL
        JSON.stringify(rangeStatus),
      );
    }

    // Set global start and target
    await this.redis.setex(
      `${this.progressKey}:start`,
      86400,
      String(startBlock),
    );
    await this.redis.setex(
      `${this.progressKey}:target`,
      86400,
      String(endBlock),
    );

    this.logger.log(
      `Initialized ${rangeCount} block ranges from ${startBlock} to ${endBlock}`,
    );
  }

  /**
   * Acquire a block range for processing by an instance
   */
  async acquireBlockRange(
    instanceId: number,
    preferredRange?: BlockRange,
  ): Promise<BlockRange | null> {
    // Try preferred range first if provided
    if (preferredRange) {
      const rangeId = `range-${preferredRange.fromBlock}-${preferredRange.toBlock}`;
      const acquired = await this.tryAcquireRange(rangeId, instanceId);
      if (acquired) {
        return preferredRange;
      }
    }

    // Get all pending ranges
    const rangeKeys = await this.redis.keys(`${this.keyPrefix}range-*`);
    const pendingRanges: Array<{ key: string; status: BlockRangeStatus }> = [];

    for (const key of rangeKeys) {
      const data = await this.redis.get(key);
      if (data) {
        const status: BlockRangeStatus = JSON.parse(data);
        if (
          status.status === "pending" ||
          (status.status === "failed" && status.retryCount < 3)
        ) {
          pendingRanges.push({ key, status });
        }
      }
    }

    // Sort by fromBlock to process in order
    pendingRanges.sort(
      (a, b) => a.status.range.fromBlock - b.status.range.fromBlock,
    );

    // Try to acquire the first available range
    for (const { key, status } of pendingRanges) {
      const rangeId = key.replace(this.keyPrefix, "");
      const acquired = await this.tryAcquireRange(rangeId, instanceId);
      if (acquired) {
        return status.range;
      }
    }

    return null;
  }

  /**
   * Try to acquire a specific range with distributed locking
   */
  private async tryAcquireRange(
    rangeId: string,
    instanceId: number,
  ): Promise<boolean> {
    const lockKey = `${this.keyPrefix}${rangeId}:lock`;
    const dataKey = `${this.keyPrefix}${rangeId}`;

    // Try to acquire lock
    const lockAcquired = await this.redis.set(
      lockKey,
      String(instanceId),
      "EX",
      this.lockTTL,
      "NX",
    );

    if (!lockAcquired) {
      return false;
    }

    try {
      // Update range status
      const data = await this.redis.get(dataKey);
      if (!data) {
        await this.redis.del(lockKey);
        return false;
      }

      const status: BlockRangeStatus = JSON.parse(data);

      // Check if range is already being processed
      if (status.status === "processing") {
        await this.redis.del(lockKey);
        return false;
      }

      // Update status
      const wasFailed = status.status === "failed";
      status.status = "processing";
      status.instanceId = instanceId;
      status.acquiredAt = new Date().toISOString();
      if (wasFailed) {
        status.retryCount++;
      }

      await this.redis.setex(dataKey, 86400, JSON.stringify(status));

      this.logger.log(`Instance ${instanceId} acquired range ${rangeId}`);
      return true;
    } catch (error) {
      await this.redis.del(lockKey);
      throw error;
    }
  }

  /**
   * Release a block range (typically on failure or shutdown)
   */
  async releaseBlockRange(range: BlockRange): Promise<void> {
    const rangeId = `range-${range.fromBlock}-${range.toBlock}`;
    const lockKey = `${this.keyPrefix}${rangeId}:lock`;
    const dataKey = `${this.keyPrefix}${rangeId}`;

    const data = await this.redis.get(dataKey);
    if (data) {
      const status: BlockRangeStatus = JSON.parse(data);

      // Mark as failed if it was processing
      if (status.status === "processing") {
        status.status = "failed";
        status.instanceId = -1;
        await this.redis.setex(dataKey, 86400, JSON.stringify(status));
      }
    }

    await this.redis.del(lockKey);
    this.logger.log(`Released range ${rangeId}`);
  }

  /**
   * Mark a block range as completed
   */
  async markRangeComplete(range: BlockRange): Promise<void> {
    const rangeId = `range-${range.fromBlock}-${range.toBlock}`;
    const lockKey = `${this.keyPrefix}${rangeId}:lock`;
    const dataKey = `${this.keyPrefix}${rangeId}`;

    const data = await this.redis.get(dataKey);
    if (data) {
      const status: BlockRangeStatus = JSON.parse(data);
      status.status = "completed";
      status.completedAt = new Date().toISOString();
      await this.redis.setex(dataKey, 86400, JSON.stringify(status));
    }

    await this.redis.del(lockKey);

    // Update global progress
    await this.updateGlobalProgress(range.toBlock);

    this.logger.log(`Marked range ${rangeId} as completed`);
  }

  /**
   * Update global indexing progress
   */
  private async updateGlobalProgress(completedBlock: number): Promise<void> {
    const currentProgress = await this.redis.get(`${this.progressKey}:current`);
    const current = currentProgress ? parseInt(currentProgress, 10) : 0;

    if (completedBlock > current) {
      await this.redis.setex(
        `${this.progressKey}:current`,
        86400,
        String(completedBlock),
      );
    }
  }

  /**
   * Get the global indexing progress
   */
  async getGlobalProgress(): Promise<number> {
    const current = await this.redis.get(`${this.progressKey}:current`);
    return current ? parseInt(current, 10) : 0;
  }

  /**
   * Get the target block (highest block to index)
   */
  async getTargetBlock(): Promise<number> {
    const target = await this.redis.get(`${this.progressKey}:target`);
    return target ? parseInt(target, 10) : 0;
  }

  /**
   * Extend the lock on a range to prevent expiration during long processing
   */
  async extendRangeLock(range: BlockRange, instanceId: number): Promise<void> {
    const rangeId = `range-${range.fromBlock}-${range.toBlock}`;
    const lockKey = `${this.keyPrefix}${rangeId}:lock`;

    const currentOwner = await this.redis.get(lockKey);
    if (currentOwner === String(instanceId)) {
      await this.redis.expire(lockKey, this.lockTTL);
    }
  }

  /**
   * Get statistics about range processing
   */
  async getRangeStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    completionPercentage: number;
  }> {
    const rangeKeys = await this.redis.keys(`${this.keyPrefix}range-*`);
    const stats = {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      completionPercentage: 0,
    };

    for (const key of rangeKeys) {
      const data = await this.redis.get(key);
      if (data) {
        const status: BlockRangeStatus = JSON.parse(data);
        stats.total++;
        stats[status.status]++;
      }
    }

    if (stats.total > 0) {
      stats.completionPercentage = Math.round(
        (stats.completed / stats.total) * 100,
      );
    }

    return stats;
  }

  /**
   * Get ranges assigned to a specific instance
   */
  async getInstanceRanges(instanceId: number): Promise<BlockRange[]> {
    const rangeKeys = await this.redis.keys(`${this.keyPrefix}range-*`);
    const ranges: BlockRange[] = [];

    for (const key of rangeKeys) {
      const data = await this.redis.get(key);
      if (data) {
        const status: BlockRangeStatus = JSON.parse(data);
        if (
          status.instanceId === instanceId &&
          status.status === "processing"
        ) {
          ranges.push(status.range);
        }
      }
    }

    return ranges;
  }

  /**
   * Reset failed ranges back to pending for retry
   */
  async resetFailedRanges(): Promise<number> {
    const rangeKeys = await this.redis.keys(`${this.keyPrefix}range-*`);
    let resetCount = 0;

    for (const key of rangeKeys) {
      const data = await this.redis.get(key);
      if (data) {
        const status: BlockRangeStatus = JSON.parse(data);
        if (status.status === "failed" && status.retryCount < 3) {
          status.status = "pending";
          status.instanceId = -1;
          await this.redis.setex(key, 86400, JSON.stringify(status));
          resetCount++;
        }
      }
    }

    this.logger.log(`Reset ${resetCount} failed ranges to pending`);
    return resetCount;
  }

  /**
   * Clean up completed ranges older than specified hours
   */
  async cleanupOldRanges(hoursOld: number = 24): Promise<number> {
    const rangeKeys = await this.redis.keys(`${this.keyPrefix}range-*`);
    let cleanedCount = 0;
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - hoursOld);

    for (const key of rangeKeys) {
      const data = await this.redis.get(key);
      if (data) {
        const status: BlockRangeStatus = JSON.parse(data);
        if (status.status === "completed" && status.completedAt) {
          const completedTime = new Date(status.completedAt);
          if (completedTime < cutoffTime) {
            await this.redis.del(key);
            await this.redis.del(`${key}:lock`);
            cleanedCount++;
          }
        }
      }
    }

    this.logger.log(`Cleaned up ${cleanedCount} old completed ranges`);
    return cleanedCount;
  }
}
