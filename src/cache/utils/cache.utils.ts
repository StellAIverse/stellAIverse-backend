import * as crypto from "crypto";
import * as zlib from "zlib";
import { promisify } from "util";
import { CompressionAlgorithm } from "../dto/cache-config.dto";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const brotliCompress = promisify(zlib.brotliCompress);
const brotliDecompress = promisify(zlib.brotliDecompress);

export class CacheUtils {
  /**
   * Generate content hash from job definition
   */
  static generateContentHash(
    jobType: string,
    payload: any,
    providerId?: string,
  ): string {
    const content = JSON.stringify({
      jobType,
      payload,
      providerId: providerId || "default",
    });
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * Generate cache key
   */
  static generateCacheKey(
    jobType: string,
    contentHash: string,
    jobId?: string,
  ): string {
    return `cache:${jobType}:${contentHash}${jobId ? `:${jobId}` : ""}`;
  }

  /**
   * Parse cache key
   */
  static parseCacheKey(cacheKey: string): {
    jobType: string;
    contentHash: string;
    jobId?: string;
  } {
    const parts = cacheKey.replace("cache:", "").split(":");
    return {
      jobType: parts[0],
      contentHash: parts[1],
      jobId: parts[2],
    };
  }

  /**
   * Compress data based on algorithm
   */
  static async compress(
    data: any,
    algorithm: CompressionAlgorithm = CompressionAlgorithm.GZIP,
  ): Promise<{ compressed: Buffer; algorithm: CompressionAlgorithm }> {
    const payload = JSON.stringify(data);

    switch (algorithm) {
      case CompressionAlgorithm.GZIP:
        const gzipCompressed = await gzip(payload);
        return {
          compressed: gzipCompressed,
          algorithm: CompressionAlgorithm.GZIP,
        };

      case CompressionAlgorithm.BROTLI:
        const brotliCompressed = await brotliCompress(payload);
        return {
          compressed: brotliCompressed,
          algorithm: CompressionAlgorithm.BROTLI,
        };

      case CompressionAlgorithm.NONE:
      default:
        return {
          compressed: Buffer.from(payload),
          algorithm: CompressionAlgorithm.NONE,
        };
    }
  }

  /**
   * Decompress data based on algorithm
   */
  static async decompress(
    compressed: Buffer,
    algorithm: CompressionAlgorithm,
  ): Promise<any> {
    switch (algorithm) {
      case CompressionAlgorithm.GZIP:
        const gzipDecompressed = await gunzip(compressed);
        return JSON.parse(gzipDecompressed.toString());

      case CompressionAlgorithm.BROTLI:
        const brotliDecompressed = await brotliDecompress(compressed);
        return JSON.parse(brotliDecompressed.toString());

      case CompressionAlgorithm.NONE:
      default:
        return JSON.parse(compressed.toString());
    }
  }

  /**
   * Check if data should be compressed
   */
  static shouldCompress(
    data: any,
    algorithm: CompressionAlgorithm,
    thresholdBytes: number,
  ): boolean {
    if (algorithm === CompressionAlgorithm.NONE) return false;
    const size = JSON.stringify(data).length;
    return size >= thresholdBytes;
  }

  /**
   * Calculate compression ratio
   */
  static calculateCompressionRatio(
    original: number,
    compressed: number,
  ): number {
    if (original === 0) return 0;
    return ((original - compressed) / original) * 100;
  }

  /**
   * Generate dependency invalidation key
   */
  static generateDependencyKey(jobId: string): string {
    return `dep:${jobId}`;
  }

  /**
   * Generate version key
   */
  static generateVersionKey(jobType: string): string {
    return `version:${jobType}`;
  }

  /**
   * Validate cache entry TTL
   */
  static isExpired(expiresAt: string): boolean {
    return new Date(expiresAt) <= new Date();
  }

  /**
   * Calculate remaining TTL
   */
  static getRemainingTTL(expiresAt: string): number {
    const remaining = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, remaining);
  }
}
