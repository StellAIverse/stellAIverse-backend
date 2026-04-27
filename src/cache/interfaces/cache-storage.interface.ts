import { CacheEntry, CacheVersionDto } from "../dto/cache-config.dto";

export interface ICacheStorage {
  /**
   * Set a cache entry with TTL
   */
  set<T>(key: string, entry: CacheEntry<T>, ttlMs?: number): Promise<void>;

  /**
   * Get a cache entry
   */
  get<T>(key: string): Promise<CacheEntry<T> | null>;

  /**
   * Delete a cache entry
   */
  delete(key: string): Promise<void>;

  /**
   * Delete multiple entries
   */
  deleteMany(keys: string[]): Promise<void>;

  /**
   * Check if cache entry exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * Get all cache entries matching a pattern
   */
  getByPattern<T>(pattern: string): Promise<CacheEntry<T>[]>;

  /**
   * Clear all entries matching tags
   */
  clearByTags(tags: string[]): Promise<number>;

  /**
   * Clear all entries matching job type
   */
  clearByJobType(jobType: string): Promise<number>;

  /**
   * Get cache metrics
   */
  getMetrics(): Promise<{
    size: number;
    entryCount: number;
    avgEntrySize: number;
  }>;

  /**
   * Clear entire cache
   */
  clear(): Promise<void>;

  /**
   * Health check
   */
  health(): Promise<boolean>;

  /**
   * Set versioning info for invalidation
   */
  setVersion<T>(key: string, version: CacheVersionDto): Promise<void>;

  /**
   * Get versioning info
   */
  getVersion<T>(key: string): Promise<CacheVersionDto | null>;

  /**
   * Invalidate entries with old version
   */
  invalidateOldVersions(
    jobType: string,
    currentVersion: CacheVersionDto,
  ): Promise<number>;
}

export interface CacheStorageConfig {
  enabled?: boolean;
  host?: string;
  port?: number;
  region?: string;
  bucket?: string;
  password?: string;
  username?: string;
  db?: number;
  ttl?: number;
  maxRetries?: number;
  retryDelay?: number;
  connectionTimeout?: number;
  requestTimeout?: number;
}
