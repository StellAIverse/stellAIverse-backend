import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  SignedPayload,
  PayloadStatus,
  PayloadType,
} from '../entities/signed-payload.entity';

/**
 * Enum for categorizing failures as retryable or permanent
 */
export enum FailureType {
  RETRYABLE = 'retryable', // Network issues, timeouts, temporary chain errors
  PERMANENT = 'permanent', // Invalid payload, expired, signature invalid
}

/**
 * Result of a submission attempt with detailed information
 */
export interface SubmissionResult {
  payloadId: string;
  success: boolean;
  transactionHash?: string;
  errorMessage?: string;
  failureType?: FailureType;
  attemptNumber: number;
}

/**
 * Configuration for batch processing
 */
export interface BatchConfig {
  batchSize: number;
  maxConcurrentBatches: number;
  preserveOrder: boolean;
}

/**
 * Result of a batch submission
 */
export interface BatchSubmissionResult {
  batchId: string;
  results: SubmissionResult[];
  totalPayloads: number;
  successfulPayloads: number;
  failedPayloads: number;
  totalTimeMs: number;
}

/**
 * Service for batch processing of payload submissions with retry logic
 * Handles grouping, idempotency, and safe retry with exponential backoff
 */
@Injectable()
export class SubmissionBatchService {
  private readonly logger = new Logger(SubmissionBatchService.name);

  // Configuration with defaults
  private readonly batchSize: number;
  private readonly maxRetries: number;
  private readonly initialRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly retryBackoffMultiplier: number;
  private readonly preserveOrder: boolean;

  // In-memory tracking for in-flight submissions (prevents race conditions)
  private readonly inFlightSubmissions: Map<string, boolean> = new Map();

  constructor(
    private configService: ConfigService,
    @InjectRepository(SignedPayload)
    private payloadRepository: Repository<SignedPayload>,
  ) {
    // Load configuration from environment or use defaults
    this.batchSize = parseInt(
      this.configService.get<string>('SUBMISSION_BATCH_SIZE', '10'),
    );
    this.maxRetries = parseInt(
      this.configService.get<string>('SUBMISSION_MAX_RETRIES', '5'),
    );
    this.initialRetryDelayMs = parseInt(
      this.configService.get<string>('SUBMISSION_INITIAL_RETRY_DELAY', '1000'),
    );
    this.maxRetryDelayMs = parseInt(
      this.configService.get<string>('SUBMISSION_MAX_RETRY_DELAY', '60000'),
    );
    this.retryBackoffMultiplier = parseFloat(
      this.configService.get<string>('SUBMISSION_RETRY_BACKOFF_MULTIPLIER', '2.0'),
    );
    this.preserveOrder =
      this.configService.get<string>('SUBMISSION_PRESERVE_ORDER', 'true') ===
      'true';

    this.logger.log(
      `Initialized SubmissionBatchService with batchSize=${this.batchSize}, ` +
        `maxRetries=${this.maxRetries}, preserveOrder=${this.preserveOrder}`,
    );
  }

  /**
   * Get payloads ready for batch submission
   * Filters by status, signature presence, and expiration
   */
  async getPayloadsForBatching(limit?: number): Promise<SignedPayload[]> {
    const batchSize = limit || this.batchSize;
    const now = new Date();

    const payloads = await this.payloadRepository.find({
      where: {
        status: PayloadStatus.PENDING,
        signature: In([null, '']),
      },
      order: { createdAt: 'ASC' },
      take: batchSize * 2, // Fetch more to filter expired ones
    });

    // Filter out expired payloads and those already in-flight
    const validPayloads = payloads.filter((p) => {
      const isExpired = p.expiresAt < now;
      const isInFlight = this.isInFlight(p.id);

      if (isExpired) {
        this.markAsFailed(
          p.id,
          'Payload expired before batch submission',
          FailureType.PERMANENT,
        );
      }

      return !isExpired && !isInFlight;
    });

    // Return up to batchSize payloads, preserving order if configured
    const result = validPayloads.slice(0, batchSize);
    if (this.preserveOrder) {
      // Mark payloads as in-flight to prevent concurrent processing
      result.forEach((p) => this.markInFlight(p.id));
    }

    return result;
  }

  /**
   * Process a batch of payloads with proper grouping and retry logic
   */
  async processBatch(
    payloadIds: string[],
    batchId?: string,
  ): Promise<BatchSubmissionResult> {
    const startTime = Date.now();
    const actualBatchId =
      batchId || `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.logger.log(
      `Processing batch ${actualBatchId} with ${payloadIds.length} payloads`,
    );

    // Fetch and validate payloads
    const payloads = await this.validatePayloadsForBatch(payloadIds);

    if (payloads.length === 0) {
      this.logger.warn(`No valid payloads found for batch ${actualBatchId}`);
      return {
        batchId: actualBatchId,
        results: [],
        totalPayloads: 0,
        successfulPayloads: 0,
        failedPayloads: 0,
        totalTimeMs: Date.now() - startTime,
      };
    }

    // Process payloads with or without order preservation
    const results = this.preserveOrder
      ? await this.processSequentially(payloads, actualBatchId)
      : await this.processConcurrently(payloads, actualBatchId);

    // Clear in-flight status for all processed payloads
    payloads.forEach((p) => this.clearInFlight(p.id));

    const successfulPayloads = results.filter((r) => r.success).length;
    const failedPayloads = results.filter((r) => !r.success).length;

    const totalTimeMs = Date.now() - startTime;

    this.logger.log(
      `Batch ${actualBatchId} completed: ${successfulPayloads}/${payloadIds.length} successful in ${totalTimeMs}ms`,
    );

    return {
      batchId: actualBatchId,
      results,
      totalPayloads: payloads.length,
      successfulPayloads,
      failedPayloads,
      totalTimeMs,
    };
  }

  /**
   * Process a single payload with retry logic
   */
  async processWithRetry(
    payloadId: string,
    maxRetries?: number,
  ): Promise<SubmissionResult> {
    const attempts = maxRetries ?? this.maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        // Check if already submitted (idempotency check)
        const payload = await this.payloadRepository.findOne({
          where: { id: payloadId },
        });

        if (!payload) {
          return {
            payloadId,
            success: false,
            errorMessage: 'Payload not found',
            failureType: FailureType.PERMANENT,
            attemptNumber: attempt,
          };
        }

        // Check if already successfully submitted
        if (
          payload.status === PayloadStatus.CONFIRMED ||
          payload.status === PayloadStatus.SUBMITTED
        ) {
          this.logger.warn(
            `Payload ${payloadId} already submitted with tx ${payload.transactionHash}`,
          );
          return {
            payloadId,
            success: true,
            transactionHash: payload.transactionHash || undefined,
            attemptNumber: attempt,
          };
        }

        // Check if already permanently failed
        if (payload.status === PayloadStatus.FAILED) {
          const isRetryable = this.isRetryableError(payload.errorMessage || '');
          if (!isRetryable) {
            return {
              payloadId,
              success: false,
              errorMessage: payload.errorMessage,
              failureType: FailureType.PERMANENT,
              attemptNumber: attempt,
            };
          }
        }

        // Attempt submission
        const result = await this.submitPayload(payload);

        // Clear in-flight status on success
        this.clearInFlight(payloadId);

        return {
          payloadId,
          success: true,
          transactionHash: result.transactionHash,
          attemptNumber: attempt,
        };
      } catch (error: any) {
        lastError = error;
        const failureType = this.categorizeFailure(error);
        const isRetryable = failureType === FailureType.RETRYABLE;

        this.logger.warn(
          `Attempt ${attempt}/${attempts} failed for payload ${payloadId}: ${error.message}`,
        );

        if (!isRetryable || attempt >= attempts) {
          // Permanent failure or max retries reached
          await this.markAsFailed(
            payloadId,
            error.message,
            failureType,
            attempt,
          );
          this.clearInFlight(payloadId);

          return {
            payloadId,
            success: false,
            errorMessage: error.message,
            failureType,
            attemptNumber: attempt,
          };
        }

        // Calculate exponential backoff delay
        const delay = this.calculateRetryDelay(attempt);
        this.logger.log(
          `Retrying payload ${payloadId} in ${delay}ms (attempt ${attempt + 1}/${attempts})`,
        );
        await this.sleep(delay);
      }
    }

    // Should not reach here, but handle edge case
    this.clearInFlight(payloadId);
    return {
      payloadId,
      success: false,
      errorMessage: lastError?.message || 'Unknown error',
      failureType: FailureType.RETRYABLE,
      attemptNumber: attempts,
    };
  }

  /**
   * Get pending payloads that can be retried
   */
  async getRetryablePayloads(limit?: number): Promise<SignedPayload[]> {
    const maxAge = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours

    const payloads = await this.payloadRepository.find({
      where: {
        status: PayloadStatus.FAILED,
      },
      order: { updatedAt: 'ASC' },
      take: limit || this.batchSize,
    });

    // Filter to only retryable failures that haven't exceeded max attempts
    return payloads.filter((p) => {
      const isRetryable = this.isRetryableError(p.errorMessage || '');
      const hasAttemptsLeft = p.submissionAttempts < this.maxRetries;
      const notTooOld = p.updatedAt > maxAge;
      return isRetryable && hasAttemptsLeft && notTooOld;
    });
  }

  /**
   * Retry failed payloads with exponential backoff
   */
  async retryFailedPayloads(
    payloadIds?: string[],
    maxConcurrent?: number,
  ): Promise<BatchSubmissionResult> {
    const startTime = Date.now();
    const batchId = `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    let payloads: SignedPayload[];

    if (payloadIds && payloadIds.length > 0) {
      payloads = await this.payloadRepository.find({
        where: { id: In(payloadIds) },
      });
    } else {
      payloads = await this.getRetryablePayloads();
    }

    if (payloads.length === 0) {
      this.logger.log('No retryable payloads found');
      return {
        batchId,
        results: [],
        totalPayloads: 0,
        successfulPayloads: 0,
        failedPayloads: 0,
        totalTimeMs: Date.now() - startTime,
      };
    }

    this.logger.log(
      `Retrying ${payloads.length} failed payloads in batch ${batchId}`,
    );

    // Process with controlled concurrency
    const maxConcurrentBatches = maxConcurrent || 5;
    const results: SubmissionResult[] = [];

    // Process in chunks to control concurrency
    for (let i = 0; i < payloads.length; i += maxConcurrentBatches) {
      const chunk = payloads.slice(i, i + maxConcurrentBatches);
      const chunkResults = await Promise.all(
        chunk.map((p) => this.processWithRetry(p.id)),
      );
      results.push(...chunkResults);

      // Small delay between chunks to avoid overwhelming the node
      if (i + maxConcurrentBatches < payloads.length) {
        await this.sleep(500);
      }
    }

    const successfulPayloads = results.filter((r) => r.success).length;
    const failedPayloads = results.filter((r) => !r.success).length;

    return {
      batchId,
      results,
      totalPayloads: payloads.length,
      successfulPayloads,
      failedPayloads,
      totalTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Get batch processing statistics
   */
  async getBatchStats(): Promise<{
    pendingPayloads: number;
    inFlightPayloads: number;
    retryableFailures: number;
    permanentFailures: number;
    batchSize: number;
    maxRetries: number;
  }> {
    const [pending, retryable, permanent] = await Promise.all([
      this.payloadRepository.count({
        where: { status: PayloadStatus.PENDING },
      }),
      this.payloadRepository
        .createQueryBuilder('p')
        .where('p.status = :status', { status: PayloadStatus.FAILED })
        .andWhere('p.errorMessage LIKE :pattern', {
          pattern: '%network%timeout%',
        })
        .getCount(),
      this.payloadRepository.count({
        where: { status: PayloadStatus.FAILED },
      }),
    ]);

    return {
      pendingPayloads: pending,
      inFlightPayloads: this.inFlightSubmissions.size,
      retryableFailures: retryable,
      permanentFailures: permanent - retryable,
      batchSize: this.batchSize,
      maxRetries: this.maxRetries,
    };
  }

  // ==================== Private Helper Methods ====================

  /**
   * Validate payloads for batch processing
   */
  private async validatePayloadsForBatch(
    payloadIds: string[],
  ): Promise<SignedPayload[]> {
    if (payloadIds.length === 0) return [];

    const payloads = await this.payloadRepository.find({
      where: { id: In(payloadIds) },
    });

    const validPayloads: SignedPayload[] = [];
    const now = new Date();

    for (const payload of payloads) {
      // Check expiration
      if (payload.expiresAt < now) {
        await this.markAsFailed(
          payload.id,
          'Payload expired',
          FailureType.PERMANENT,
        );
        continue;
      }

      // Check if already submitted
      if (
        payload.status === PayloadStatus.CONFIRMED ||
        payload.status === PayloadStatus.SUBMITTED
      ) {
        this.logger.warn(
          `Payload ${payload.id} already submitted, skipping from batch`,
        );
        continue;
      }

      // Check signature
      if (!payload.signature) {
        await this.markAsFailed(
          payload.id,
          'Payload has no signature',
          FailureType.PERMANENT,
        );
        continue;
      }

      // Check in-flight status
      if (this.isInFlight(payload.id)) {
        this.logger.warn(
          `Payload ${payload.id} is already being processed, skipping from batch`,
        );
        continue;
      }

      validPayloads.push(payload);
      this.markInFlight(payload.id);
    }

    return validPayloads;
  }

  /**
   * Process payloads sequentially (preserves order)
   */
  private async processSequentially(
    payloads: SignedPayload[],
    batchId: string,
  ): Promise<SubmissionResult[]> {
    const results: SubmissionResult[] = [];

    for (const payload of payloads) {
      try {
        const result = await this.submitPayload(payload);
        results.push({
          payloadId: payload.id,
          success: true,
          transactionHash: result.transactionHash,
          attemptNumber: 1,
        });
      } catch (error: any) {
        const failureType = this.categorizeFailure(error);
        await this.markAsFailed(payload.id, error.message, failureType);

        results.push({
          payloadId: payload.id,
          success: false,
          errorMessage: error.message,
          failureType,
          attemptNumber: 1,
        });
      }

      // Small delay between submissions to avoid nonce issues
      await this.sleep(100);
    }

    return results;
  }

  /**
   * Process payloads concurrently (faster but no order guarantee)
   */
  private async processConcurrently(
    payloads: SignedPayload[],
    batchId: string,
  ): Promise<SubmissionResult[]> {
    const results = await Promise.allSettled(
      payloads.map((p) => this.submitPayload(p)),
    );

    return results.map((result, index) => {
      const payload = payloads[index];

      if (result.status === 'fulfilled') {
        return {
          payloadId: payload.id,
          success: true,
          transactionHash: result.value.transactionHash,
          attemptNumber: 1,
        };
      } else {
        const failureType = this.categorizeFailure(result.reason);
        this.markAsFailed(
          payload.id,
          result.reason.message,
          failureType,
        ).catch((e) => {
          this.logger.error(
            `Failed to mark payload ${payload.id} as failed: ${e.message}`,
          );
        });

        return {
          payloadId: payload.id,
          success: false,
          errorMessage: result.reason.message,
          failureType,
          attemptNumber: 1,
        };
      }
    });
  }

  /**
   * Submit a single payload to the blockchain
   * This is a placeholder - actual implementation would use ethers.js
   */
  private async submitPayload(
    payload: SignedPayload,
  ): Promise<{ transactionHash: string }> {
    // In a real implementation, this would:
    // 1. Build the transaction
    // 2. Send it to the blockchain
    // 3. Update the payload status

    // For now, simulate a successful submission
    const transactionHash = `0x${Date.now().toString(16)}${Math.random()
      .toString(16)
      .substr(2, 56)}`;

    // Update payload status
    payload.status = PayloadStatus.SUBMITTED;
    payload.transactionHash = transactionHash;
    payload.submittedAt = new Date();
    payload.submissionAttempts += 1;
    await this.payloadRepository.save(payload);

    this.logger.log(
      `Submitted payload ${payload.id} with tx ${transactionHash}`,
    );

    return { transactionHash };
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateRetryDelay(attempt: number): number {
    const delay =
      this.initialRetryDelayMs *
      Math.pow(this.retryBackoffMultiplier, attempt - 1);
    return Math.min(delay, this.maxRetryDelayMs);
  }

  /**
   * Determine if an error is retryable
   */
  private categorizeFailure(error: Error): FailureType {
    const message = error.message.toLowerCase();

    // Non-retryable (permanent) failures
    const permanentPatterns = [
      'expired',
      'invalid signature',
      'unauthorized',
      'insufficient funds',
      'nonce too low',
      'already submitted',
      'execution reverted',
      'vm exception',
    ];

    for (const pattern of permanentPatterns) {
      if (message.includes(pattern)) {
        return FailureType.PERMANENT;
      }
    }

    // Retryable failures
    const retryablePatterns = [
      'network error',
      'timeout',
      'econnreset',
      'socket hang up',
      'temporary',
      'service unavailable',
      'gateway error',
      'rate limit',
    ];

    for (const pattern of retryablePatterns) {
      if (message.includes(pattern)) {
        return FailureType.RETRYABLE;
      }
    }

    // Default to retryable for unknown errors (conservative approach)
    return FailureType.RETRYABLE;
  }

  /**
   * Check if an error message indicates a retryable failure
   */
  private isRetryableError(errorMessage: string): boolean {
    return this.categorizeFailure({ message: errorMessage } as Error) ===
      FailureType.RETRYABLE;
  }

  /**
   * Mark a payload as failed with appropriate status
   */
  private async markAsFailed(
    payloadId: string,
    errorMessage: string,
    failureType: FailureType,
    attemptNumber: number = 1,
  ): Promise<void> {
    try {
      const payload = await this.payloadRepository.findOne({
        where: { id: payloadId },
      });

      if (payload) {
        payload.status = PayloadStatus.FAILED;
        payload.errorMessage = errorMessage;
        payload.submissionAttempts = attemptNumber;
        await this.payloadRepository.save(payload);
      }

      this.logger.warn(
        `Payload ${payloadId} marked as ${failureType} failure: ${errorMessage}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to mark payload ${payloadId} as failed: ${error}`,
      );
    }
  }

  /**
   * Check if a payload is currently being processed
   */
  private isInFlight(payloadId: string): boolean {
    return this.inFlightSubmissions.get(payloadId) === true;
  }

  /**
   * Mark a payload as in-flight (being processed)
   */
  private markInFlight(payloadId: string): void {
    this.inFlightSubmissions.set(payloadId, true);
  }

  /**
   * Clear in-flight status for a payload
   */
  private clearInFlight(payloadId: string): void {
    this.inFlightSubmissions.delete(payloadId);
  }

  /**
   * Helper function for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
