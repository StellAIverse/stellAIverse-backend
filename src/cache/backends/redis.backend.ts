import { Injectable, Logger } from "@nestjs/common";
import Redis from "ioredis";
import { CacheEntry, CacheVersionDto } from "../dto/cache-config.dto";
import {
  ICacheStorage,
  CacheStorageConfig,
} from "../interfaces/cache-storage.interface";
import { CacheUtils } from "../utils/cache.utils";

@Injectable()
export class RedisCacheBackend implements ICacheStorage {
  private readonly logger = new Logger(RedisCacheBackend.name);
  private client: Redis;
  private config: CacheStorageConfig;

  constructor(config: CacheStorageConfig) {
    this.config = {
      host: "localhost",
      port: 6379,
      db: 0,
      connectionTimeout: 5000,
      requestTimeout: 5000,
      maxRetries: 3,
      retryDelay: 1000,
      ...config,
    };
    this.initializeClient();
  }

  private initializeClient(): void {
    if (!this.config.enabled) {
      this.logger.warn("Redis cache backend is disabled");
      return;
    }

    try {
      this.client = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        connectTimeout: this.config.connectionTimeout,
        commandTimeout: this.config.requestTimeout,
        retryStrategy: (times) => {
          const delay = Math.min(times * this.config.retryDelay, 2000);
          return delay;
        },
        maxRetriesPerRequest: this.config.maxRetries,
        enableReadyCheck: false,
        enableOfflineQueue: true,
      });

      this.client.on("error", (err) => {
        this.logger.error(`Redis client error: ${err.message}`, err.stack);
      });

      this.client.on("connect", () => {
        this.logger.log("Redis client connected");
      });

      this.client.on("reconnecting", () => {
        this.logger.warn("Redis client reconnecting");
      });
    } catch (error) {
      this.logger.error(
        `Failed to initialize Redis client: ${error.message}`,
        error.stack,
      );
    }
  }

  async set<T>(
    key: string,
    entry: CacheEntry<T>,
    ttlMs?: number,
  ): Promise<void> {
    try {
      const ttl = ttlMs || this.config.ttl || 24 * 60 * 60 * 1000;
      const ttlSeconds = Math.ceil(ttl / 1000);
      const value = JSON.stringify(entry);

      await this.client.setex(key, ttlSeconds, value);
      this.logger.debug(`Cache entry set: ${key} with TTL ${ttlSeconds}s`);
    } catch (error) {
      this.logger.error(
        `Failed to set cache entry ${key}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const value = await this.client.get(key);
      if (!value) {
        return null;
      }

      const entry: CacheEntry<T> = JSON.parse(value);
      if (CacheUtils.isExpired(entry.expiresAt)) {
        await this.delete(key);
        return null;
      }

      return entry;
    } catch (error) {
      this.logger.error(
        `Failed to get cache entry ${key}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.del(key);
      this.logger.debug(`Cache entry deleted: ${key}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete cache entry ${key}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    try {
      await this.client.del(...keys);
      this.logger.debug(`Deleted ${keys.length} cache entries`);
    } catch (error) {
      this.logger.error(
        `Failed to delete multiple cache entries: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(
        `Failed to check if cache entry exists ${key}: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  async getByPattern<T>(pattern: string): Promise<CacheEntry<T>[]> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) {
        return [];
      }

      const values = await this.client.mget(...keys);
      const entries: CacheEntry<T>[] = [];

      for (const value of values) {
        if (value) {
          try {
            const entry: CacheEntry<T> = JSON.parse(value);
            if (!CacheUtils.isExpired(entry.expiresAt)) {
              entries.push(entry);
            }
          } catch (e) {
            this.logger.warn(`Failed to parse cache entry: ${e.message}`);
          }
        }
      }

      return entries;
    } catch (error) {
      this.logger.error(
        `Failed to get cache entries by pattern ${pattern}: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }

  async clearByTags(tags: string[]): Promise<number> {
    try {
      const pattern = `cache:*`;
      const keys = await this.client.keys(pattern);
      let deletedCount = 0;

      for (const key of keys) {
        try {
          const value = await this.client.get(key);
          if (value) {
            const entry: CacheEntry = JSON.parse(value);
            if (entry.tags && entry.tags.some((tag) => tags.includes(tag))) {
              await this.delete(key);
              deletedCount++;
            }
          }
        } catch (e) {
          this.logger.warn(`Failed to process key ${key}: ${e.message}`);
        }
      }

      this.logger.log(`Cleared ${deletedCount} cache entries by tags`);
      return deletedCount;
    } catch (error) {
      this.logger.error(
        `Failed to clear cache by tags: ${error.message}`,
        error.stack,
      );
      return 0;
    }
  }

  async clearByJobType(jobType: string): Promise<number> {
    try {
      const pattern = `cache:${jobType}:*`;
      const keys = await this.client.keys(pattern);

      if (keys.length > 0) {
        await this.client.del(...keys);
      }

      this.logger.log(
        `Cleared ${keys.length} cache entries for job type: ${jobType}`,
      );
      return keys.length;
    } catch (error) {
      this.logger.error(
        `Failed to clear cache by job type: ${error.message}`,
        error.stack,
      );
      return 0;
    }
  }

  async getMetrics(): Promise<{
    size: number;
    entryCount: number;
    avgEntrySize: number;
  }> {
    try {
      const info = await this.client.info("memory");
      const lines = info.split("\r\n");
      let usedMemory = 0;

      for (const line of lines) {
        if (line.startsWith("used_memory:")) {
          usedMemory = parseInt(line.split(":")[1], 10);
          break;
        }
      }

      const keys = await this.client.keys("cache:*");
      const entryCount = keys.length;
      const avgEntrySize =
        entryCount > 0 ? Math.round(usedMemory / entryCount) : 0;

      return {
        size: usedMemory,
        entryCount,
        avgEntrySize,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get cache metrics: ${error.message}`,
        error.stack,
      );
      return { size: 0, entryCount: 0, avgEntrySize: 0 };
    }
  }

  async clear(): Promise<void> {
    try {
      const pattern = `cache:*`;
      const keys = await this.client.keys(pattern);

      if (keys.length > 0) {
        await this.client.del(...keys);
      }

      this.logger.log(`Cleared all cache entries (${keys.length})`);
    } catch (error) {
      this.logger.error(
        `Failed to clear all cache: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async health(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === "PONG";
    } catch (error) {
      this.logger.error(`Redis health check failed: ${error.message}`);
      return false;
    }
  }

  async setVersion<T>(key: string, version: CacheVersionDto): Promise<void> {
    try {
      const versionKey = `${key}:version`;
      await this.client.set(versionKey, JSON.stringify(version));
    } catch (error) {
      this.logger.error(`Failed to set version: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getVersion<T>(key: string): Promise<CacheVersionDto | null> {
    try {
      const versionKey = `${key}:version`;
      const value = await this.client.get(versionKey);
      if (!value) return null;
      return JSON.parse(value);
    } catch (error) {
      this.logger.error(`Failed to get version: ${error.message}`, error.stack);
      return null;
    }
  }

  async invalidateOldVersions(
    jobType: string,
    currentVersion: CacheVersionDto,
  ): Promise<number> {
    try {
      const pattern = `cache:${jobType}:*`;
      const keys = await this.client.keys(pattern);
      let invalidatedCount = 0;

      for (const key of keys) {
        try {
          const version = await this.getVersion(key);
          if (
            version &&
            version.schemaVersion !== currentVersion.schemaVersion
          ) {
            await this.delete(key);
            invalidatedCount++;
          }
        } catch (e) {
          this.logger.warn(`Failed to check version for key ${key}`);
        }
      }

      this.logger.log(
        `Invalidated ${invalidatedCount} cache entries with old version for job type: ${jobType}`,
      );
      return invalidatedCount;
    } catch (error) {
      this.logger.error(
        `Failed to invalidate old versions: ${error.message}`,
        error.stack,
      );
      return 0;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.logger.log("Redis client disconnected");
    }
  }
}
