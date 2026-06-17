import {
  Injectable,
  Logger,
  ConflictException,
} from "@nestjs/common";
import {
  InsufficientBalanceException,
  PortfolioNotFoundException,
} from "../exceptions/portfolio.exceptions";
import { DataSource, EntityManager } from "typeorm";
import BigNumber from "bignumber.js";
import { Portfolio } from "../entities/portfolio.entity";
import { PortfolioAsset } from "../entities/portfolio-asset.entity";

// Configure BigNumber for financial precision (no exponential notation, 18 dp)
BigNumber.config({ DECIMAL_PLACES: 18, ROUNDING_MODE: BigNumber.ROUND_HALF_EVEN });

export interface TradeOperation {
  portfolioId: string;
  userId: string;
  ticker: string;
  name: string;
  quantity: number;
  price: number;
  idempotencyKey: string;
}

/**
 * Handles trade operations with DB transactions and optimistic locking
 * to prevent race conditions and double-spending.
 */
@Injectable()
export class TradingTransactionService {
  private readonly logger = new Logger(TradingTransactionService.name);
  /** In-memory idempotency store. Replace with Redis in production. */
  private readonly processedKeys = new Set<string>();

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Execute a trade within a serializable transaction with optimistic locking.
   * Idempotency key prevents duplicate trade execution.
   */
  async executeTrade(op: TradeOperation): Promise<PortfolioAsset> {
    // Idempotency check
    if (this.processedKeys.has(op.idempotencyKey)) {
      throw new ConflictException(
        `Trade with idempotency key ${op.idempotencyKey} already processed`,
      );
    }

    return this.dataSource.transaction(
      "SERIALIZABLE",
      async (manager: EntityManager) => {
        // Lock the portfolio row for update (pessimistic write lock)
        const portfolio = await manager
          .getRepository(Portfolio)
          .createQueryBuilder("portfolio")
          .setLock("pessimistic_write")
          .where("portfolio.id = :id AND portfolio.userId = :userId", {
            id: op.portfolioId,
            userId: op.userId,
          })
          .getOne();

        if (!portfolio) {
          throw new PortfolioNotFoundException(op.portfolioId);
        }

        // Find or create asset within the same transaction
        let asset = await manager.getRepository(PortfolioAsset).findOne({
          where: { portfolioId: op.portfolioId, ticker: op.ticker },
        });

        if (!asset) {
          asset = manager.getRepository(PortfolioAsset).create({
            portfolioId: op.portfolioId,
            ticker: op.ticker,
            name: op.name,
            quantity: 0,
            value: 0,
            allocationPercentage: 0,
            costBasis: op.price,
            costBasisPerShare: op.price,
          });
        }

        // Validate quantity
        if (op.quantity < 0 && Math.abs(op.quantity) > asset.quantity) {
          throw new InsufficientBalanceException(op.ticker);
        }

        const bnQuantity = new BigNumber(op.quantity);
        const bnPrice = new BigNumber(op.price);
        const bnCurrentQty = new BigNumber(asset.quantity);

        if (bnQuantity.isNegative() && bnQuantity.abs().isGreaterThan(bnCurrentQty)) {
          throw new InsufficientBalanceException(op.ticker);
        }

        const newQty = bnCurrentQty.plus(bnQuantity);
        asset.quantity = newQty.toNumber();
        asset.currentPrice = bnPrice.toNumber();
        asset.value = newQty.multipliedBy(bnPrice).toNumber();
        asset.lastPriceUpdate = new Date();

        const saved = await manager.getRepository(PortfolioAsset).save(asset);

        // Mark idempotency key as processed
        this.processedKeys.add(op.idempotencyKey);

        this.logger.log(
          `Trade executed: portfolio=${op.portfolioId} ticker=${op.ticker} qty=${op.quantity} key=${op.idempotencyKey}`,
        );

        return saved;
      },
    );
  }
}
