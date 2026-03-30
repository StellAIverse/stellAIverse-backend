import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import { IShardManager, ShardConfig } from "../interfaces/indexer.interface";

@Injectable()
export class ShardManagerService implements IShardManager {
  private readonly logger = new Logger(ShardManagerService.name);
  private readonly redis: Redis;
  private readonly shardCount: number;
  private readonly shardKeyPrefix = "indexer:shard:";
  private readonly instanceKeyPrefix = "indexer:instance:";

  constructor(private readonly configService: ConfigService) {
    this.shardCount = this.configService.get<number>("INDEXER_SHARD_COUNT", 4);

    // Initialize Redis client for distributed coordination
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
   * Get the shard ID for a given block number using consistent hashing
   */
  getShardForBlock(blockNumber: number): string {
    const shardIndex = blockNumber % this.shardCount;
    return `shard-${shardIndex}`;
  }

  /**
   * Get all shard configurations
   */
  async getAllShards(): Promise<ShardConfig[]> {
    const shardKeys = await this.redis.keys(`${this.shardKeyPrefix}*`);
    const shards: ShardConfig[] = [];

    for (const key of shardKeys) {
      const shardData = await this.redis.get(key);
      if (shardData) {
        shards.push(JSON.parse(shardData));
      }
    }

    return shards;
  }

  /**
   * Assign a shard to a specific instance with distributed locking
   */
  async assignShardToInstance(
    shardId: string,
    instanceId: number,
  ): Promise<void> {
    const lockKey = `${this.shardKeyPrefix}${shardId}:lock`;
    const shardKey = `${this.shardKeyPrefix}${shardId}`;
    const instanceKey = `${this.instanceKeyPrefix}${instanceId}`;

    // Try to acquire lock with 30-second TTL
    const lockAcquired = await this.redis.set(
      lockKey,
      String(instanceId),
      "EX",
      30,
      "NX",
    );

    if (!lockAcquired) {
      throw new Error(
        `Shard ${shardId} is already assigned to another instance`,
      );
    }

    try {
      // Update shard configuration
      const shardConfig: ShardConfig = {
        shardId,
        instanceId,
        startBlock: 0,
        endBlock: 0,
        isActive: true,
      };

      await this.redis.setex(shardKey, 3600, JSON.stringify(shardConfig));

      // Add shard to instance's assigned shards
      await this.redis.sadd(`${instanceKey}:shards`, shardId);
      await this.redis.expire(`${instanceKey}:shards`, 3600);

      this.logger.log(`Shard ${shardId} assigned to instance ${instanceId}`);
    } catch (error) {
      // Release lock on failure
      await this.redis.del(lockKey);
      throw error;
    }
  }

  /**
   * Release a shard from its current instance
   */
  async releaseShard(shardId: string): Promise<void> {
    const shardKey = `${this.shardKeyPrefix}${shardId}`;
    const lockKey = `${this.shardKeyPrefix}${shardId}:lock`;

    // Get current shard config
    const shardData = await this.redis.get(shardKey);
    if (shardData) {
      const shard: ShardConfig = JSON.parse(shardData);
      const instanceKey = `${this.instanceKeyPrefix}${shard.instanceId}`;

      // Remove from instance's shards
      await this.redis.srem(`${instanceKey}:shards`, shardId);
    }

    // Delete shard config and lock
    await this.redis.del(shardKey);
    await this.redis.del(lockKey);

    this.logger.log(`Shard ${shardId} released`);
  }

  /**
   * Get all shards assigned to a specific instance
   */
  async getInstanceShards(instanceId: number): Promise<string[]> {
    const instanceKey = `${this.instanceKeyPrefix}${instanceId}:shards`;
    return await this.redis.smembers(instanceKey);
  }

  /**
   * Rebalance shards across active instances
   */
  async rebalanceShards(): Promise<void> {
    const allShards = await this.getAllShards();
    const activeInstances = await this.getActiveInstances();

    if (activeInstances.length === 0) {
      this.logger.warn("No active instances found for rebalancing");
      return;
    }

    // Filter unassigned or inactive shards
    const unassignedShards = allShards.filter(
      (s) => !s.isActive || !activeInstances.includes(s.instanceId),
    );

    // Distribute unassigned shards evenly
    for (let i = 0; i < unassignedShards.length; i++) {
      const instanceId = activeInstances[i % activeInstances.length];
      try {
        await this.assignShardToInstance(
          unassignedShards[i].shardId,
          instanceId,
        );
      } catch (error) {
        this.logger.error(
          `Failed to assign shard ${unassignedShards[i].shardId}: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `Rebalanced ${unassignedShards.length} shards across ${activeInstances.length} instances`,
    );
  }

  /**
   * Register an instance as active with heartbeat
   */
  async registerInstance(
    instanceId: number,
    host: string,
    port: number,
  ): Promise<void> {
    const instanceKey = `${this.instanceKeyPrefix}${instanceId}`;
    const instanceData = {
      id: instanceId,
      host,
      port,
      lastHeartbeat: new Date().toISOString(),
      isActive: true,
    };

    await this.redis.setex(instanceKey, 60, JSON.stringify(instanceData));
    this.logger.log(`Instance ${instanceId} registered at ${host}:${port}`);
  }

  /**
   * Update instance heartbeat
   */
  async updateHeartbeat(instanceId: number): Promise<void> {
    const instanceKey = `${this.instanceKeyPrefix}${instanceId}`;
    const existing = await this.redis.get(instanceKey);

    if (existing) {
      const data = JSON.parse(existing);
      data.lastHeartbeat = new Date().toISOString();
      await this.redis.setex(instanceKey, 60, JSON.stringify(data));
    }
  }

  /**
   * Get all active instances
   */
  async getActiveInstances(): Promise<number[]> {
    const instanceKeys = await this.redis.keys(
      `${this.instanceKeyPrefix}[0-9]*`,
    );
    const instances: number[] = [];

    for (const key of instanceKeys) {
      // Skip shard lists
      if (key.includes(":shards")) continue;

      const data = await this.redis.get(key);
      if (data) {
        const instance = JSON.parse(data);
        if (instance.isActive) {
          instances.push(instance.id);
        }
      }
    }

    return instances;
  }

  /**
   * Initialize shards for a block range
   */
  async initializeShards(startBlock: number, endBlock: number): Promise<void> {
    const blocksPerShard = Math.ceil((endBlock - startBlock) / this.shardCount);

    for (let i = 0; i < this.shardCount; i++) {
      const shardStart = startBlock + i * blocksPerShard;
      const shardEnd = Math.min(shardStart + blocksPerShard - 1, endBlock);
      const shardId = `shard-${i}`;

      const shardConfig: ShardConfig = {
        shardId,
        startBlock: shardStart,
        endBlock: shardEnd,
        instanceId: -1,
        isActive: false,
      };

      const shardKey = `${this.shardKeyPrefix}${shardId}`;
      await this.redis.setex(shardKey, 3600, JSON.stringify(shardConfig));
    }

    this.logger.log(
      `Initialized ${this.shardCount} shards for blocks ${startBlock}-${endBlock}`,
    );
  }

  /**
   * Get shard configuration for a specific shard
   */
  async getShardConfig(shardId: string): Promise<ShardConfig | null> {
    const shardKey = `${this.shardKeyPrefix}${shardId}`;
    const data = await this.redis.get(shardKey);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Extend shard lock to prevent expiration during processing
   */
  async extendShardLock(
    shardId: string,
    instanceId: number,
    ttlSeconds: number = 30,
  ): Promise<void> {
    const lockKey = `${this.shardKeyPrefix}${shardId}:lock`;
    const currentOwner = await this.redis.get(lockKey);

    if (currentOwner === String(instanceId)) {
      await this.redis.expire(lockKey, ttlSeconds);
    }
  }

  /**
   * Clean up stale locks and instance registrations
   */
  async cleanupStaleResources(): Promise<void> {
    const instanceKeys = await this.redis.keys(
      `${this.instanceKeyPrefix}[0-9]*`,
    );
    const now = new Date();

    for (const key of instanceKeys) {
      if (key.includes(":shards")) continue;

      const data = await this.redis.get(key);
      if (data) {
        const instance = JSON.parse(data);
        const lastHeartbeat = new Date(instance.lastHeartbeat);
        const staleThreshold = 2 * 60 * 1000; // 2 minutes

        if (now.getTime() - lastHeartbeat.getTime() > staleThreshold) {
          // Instance is stale, release its shards
          const instanceId = instance.id;
          const shards = await this.getInstanceShards(instanceId);

          for (const shardId of shards) {
            await this.releaseShard(shardId);
          }

          await this.redis.del(key);
          await this.redis.del(`${this.instanceKeyPrefix}${instanceId}:shards`);

          this.logger.log(`Cleaned up stale instance ${instanceId}`);
        }
      }
    }
  }

  /**
   * Get shard statistics
   */
  async getShardStats(): Promise<{
    totalShards: number;
    activeShards: number;
    unassignedShards: number;
    instanceDistribution: Record<number, number>;
  }> {
    const allShards = await this.getAllShards();
    const activeInstances = await this.getActiveInstances();

    const activeShards = allShards.filter((s) => s.isActive).length;
    const unassignedShards = allShards.filter(
      (s) => !s.isActive || !activeInstances.includes(s.instanceId),
    ).length;

    const instanceDistribution: Record<number, number> = {};
    for (const instanceId of activeInstances) {
      const shards = await this.getInstanceShards(instanceId);
      instanceDistribution[instanceId] = shards.length;
    }

    return {
      totalShards: allShards.length,
      activeShards,
      unassignedShards,
      instanceDistribution,
    };
  }
}
