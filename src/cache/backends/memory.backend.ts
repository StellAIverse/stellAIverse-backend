import { Injectable, Logger } from "@nestjs/common";
import { CacheEntry, CacheVersionDto } from "../dto/cache-config.dto";
import {
  ICacheStorage,
  CacheStorageConfig,
} from "../interfaces/cache-storage.interface";
import { CacheUtils } from "../utils/cache.utils";

interface MemoryCacheItem<T> {
  entry: CacheEntry<T>;
  expiresAt: number;
}

@Injectable()
export class MemoryCacheBackend implements ICacheStorage {
  private readonly logger = new Logger(MemoryCacheBackend.name);
  private store = new Map<string, MemoryCacheItem<any>>();
  private versions = new Map<string, CacheVersionDto>();
  private cleanupInterval: NodeJS.Timeout;
  private config: CacheStorageConfig;

  constructor(config: CacheStorageConfig = {}) {
    this.config = { enabled: true, ...config };
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, item] of this.store.entries()) {
      if (item.expiresAt <= now) {
        this.store.delete(key);
        this.versions.delete(`${key}:version`);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(
        `Memory cache cleanup: removed ${cleaned} expired entries`,
      );
    }
  }

  async set<T>(
    key: string,
    entry: CacheEntry<T>,
    ttlMs?: number,
  ): Promise<void> {
    const ttl = ttlMs || this.config.ttl || 24 * 60 * 60 * 1000;
    const expiresAt = Date.now() + ttl;

    this.store.set(key, {
      entry,
      expiresAt,
    });

    this.logger.debug(`Memory cache entry set: ${key}`);
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const item = this.store.get(key);

    if (!item) {
      return null;
    }

    if (item.expiresAt <= Date.now()) {
      this.store.delete(key);
      this.versions.delete(`${key}:version`);
      return null;
    }

    return item.entry;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
    this.versions.delete(`${key}:version`);
    this.logger.debug(`Memory cache entry deleted: ${key}`);
  }

  async deleteMany(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.store.delete(key);
      this.versions.delete(`${key}:version`);
    }
    this.logger.debug(`Deleted ${keys.length} memory cache entries`);
  }

  async exists(key: string): Promise<boolean> {
    const item = this.store.get(key);
    if (!item) return false;

    if (item.expiresAt <= Date.now()) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  async getByPattern<T>(pattern: string): Promise<CacheEntry<T>[]> {
    const entries: CacheEntry<T>[] = [];
    const regex = new RegExp(pattern.replace(/\*/g, ".*"));
    const now = Date.now();

    for (const [key, item] of this.store.entries()) {
      if (regex.test(key) && item.expiresAt > now) {
        entries.push(item.entry);
      }
    }

    return entries;
  }

  async clearByTags(tags: string[]): Promise<number> {
    let deletedCount = 0;
    const now = Date.now();

    for (const [key, item] of this.store.entries()) {
      if (item.expiresAt > now && item.entry.tags) {
        if (item.entry.tags.some((tag) => tags.includes(tag))) {
          this.store.delete(key);
          this.versions.delete(`${key}:version`);
          deletedCount++;
        }
      }
    }

    this.logger.log(`Cleared ${deletedCount} memory cache entries by tags`);
    return deletedCount;
  }

  async clearByJobType(jobType: string): Promise<number> {
    let deletedCount = 0;
    const pattern = `cache:${jobType}:`;

    for (const [key] of this.store.entries()) {
      if (key.startsWith(pattern)) {
        this.store.delete(key);
        this.versions.delete(`${key}:version`);
        deletedCount++;
      }
    }

    this.logger.log(
      `Cleared ${deletedCount} memory cache entries for job type: ${jobType}`,
    );
    return deletedCount;
  }

  async getMetrics(): Promise<{
    size: number;
    entryCount: number;
    avgEntrySize: number;
  }> {
    let totalSize = 0;
    const now = Date.now();

    for (const [, item] of this.store.entries()) {
      if (item.expiresAt > now) {
        const size = JSON.stringify(item.entry).length;
        totalSize += size;
      }
    }

    const entryCount = this.store.size;
    const avgEntrySize =
      entryCount > 0 ? Math.round(totalSize / entryCount) : 0;

    return {
      size: totalSize,
      entryCount,
      avgEntrySize,
    };
  }

  async clear(): Promise<void> {
    const count = this.store.size;
    this.store.clear();
    this.versions.clear();
    this.logger.log(`Cleared all memory cache entries (${count})`);
  }

  async health(): Promise<boolean> {
    return true;
  }

  async setVersion<T>(key: string, version: CacheVersionDto): Promise<void> {
    const versionKey = `${key}:version`;
    this.versions.set(versionKey, version);
  }

  async getVersion<T>(key: string): Promise<CacheVersionDto | null> {
    const versionKey = `${key}:version`;
    return this.versions.get(versionKey) || null;
  }

  async invalidateOldVersions(
    jobType: string,
    currentVersion: CacheVersionDto,
  ): Promise<number> {
    let invalidatedCount = 0;
    const pattern = `cache:${jobType}:`;

    for (const [key] of this.store.entries()) {
      if (key.startsWith(pattern)) {
        const version = this.versions.get(`${key}:version`);
        if (version && version.schemaVersion !== currentVersion.schemaVersion) {
          this.store.delete(key);
          this.versions.delete(`${key}:version`);
          invalidatedCount++;
        }
      }
    }

    this.logger.log(
      `Invalidated ${invalidatedCount} memory cache entries with old version for job type: ${jobType}`,
    );
    return invalidatedCount;
  }

  async disconnect(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.logger.log("Memory cache backend disconnected");
  }
}
