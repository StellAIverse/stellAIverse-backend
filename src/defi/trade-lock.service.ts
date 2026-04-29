import { Injectable, Logger, ConflictException, BadRequestException } from '@nestjs/common';

interface TradeRequest {
  idempotencyKey: string;
  userId: string;
  asset: string;
  amount: number;
  side: 'buy' | 'sell';
}

interface TradeResult {
  tradeId: string;
  idempotencyKey: string;
  userId: string;
  asset: string;
  amount: number;
  side: 'buy' | 'sell';
  status: 'completed' | 'failed';
  executedAt: Date;
}

@Injectable()
export class TradeLockService {
  private readonly logger = new Logger(TradeLockService.name);

  /** Active per-user locks to prevent concurrent trades on same user */
  private readonly userLocks = new Map<string, Promise<void>>();

  /** Idempotency cache: key -> result (TTL: 24h) */
  private readonly idempotencyCache = new Map<string, { result: TradeResult; expiresAt: number }>();

  private tradeCounter = 0;

  async executeTrade(request: TradeRequest): Promise<TradeResult> {
    this.validateRequest(request);

    // Check idempotency cache first
    const cached = this.idempotencyCache.get(request.idempotencyKey);
    if (cached) {
      if (Date.now() < cached.expiresAt) {
        this.logger.log(`Returning cached result for idempotency key ${request.idempotencyKey}`);
        return cached.result;
      }
      this.idempotencyCache.delete(request.idempotencyKey);
    }

    // Acquire per-user lock (pessimistic locking)
    return this.withUserLock(request.userId, async () => {
      // Re-check idempotency inside lock to handle concurrent requests
      const cachedInLock = this.idempotencyCache.get(request.idempotencyKey);
      if (cachedInLock && Date.now() < cachedInLock.expiresAt) {
        return cachedInLock.result;
      }

      const result = await this.performTrade(request);

      // Cache result for 24 hours
      this.idempotencyCache.set(request.idempotencyKey, {
        result,
        expiresAt: Date.now() + 86400000,
      });

      return result;
    });
  }

  private async withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    // Wait for any existing lock on this user
    const existingLock = this.userLocks.get(userId);
    if (existingLock) {
      await existingLock;
    }

    let releaseLock!: () => void;
    const lock = new Promise<void>(resolve => { releaseLock = resolve; });
    this.userLocks.set(userId, lock);

    try {
      return await fn();
    } finally {
      releaseLock();
      // Only delete if this is still the current lock
      if (this.userLocks.get(userId) === lock) {
        this.userLocks.delete(userId);
      }
    }
  }

  private async performTrade(request: TradeRequest): Promise<TradeResult> {
    // Simulate atomic trade execution (in production: wrap in DB transaction)
    const tradeId = `trade_${++this.tradeCounter}_${Date.now()}`;
    this.logger.log(`Executing trade ${tradeId} for user ${request.userId}: ${request.side} ${request.amount} ${request.asset}`);

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 10));

    return {
      tradeId,
      idempotencyKey: request.idempotencyKey,
      userId: request.userId,
      asset: request.asset,
      amount: request.amount,
      side: request.side,
      status: 'completed',
      executedAt: new Date(),
    };
  }

  private validateRequest(request: TradeRequest): void {
    if (!request.idempotencyKey) throw new BadRequestException('idempotencyKey is required');
    if (!request.userId) throw new BadRequestException('userId is required');
    if (!request.asset) throw new BadRequestException('asset is required');
    if (request.amount <= 0) throw new BadRequestException('amount must be positive');
    if (!['buy', 'sell'].includes(request.side)) throw new BadRequestException('side must be buy or sell');
  }

  /** Clean up expired idempotency cache entries */
  cleanupExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.idempotencyCache.entries()) {
      if (now >= entry.expiresAt) {
        this.idempotencyCache.delete(key);
      }
    }
  }
}
