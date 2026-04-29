import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LiquidityPool } from "./entities/liquidity-pool.entity";
import { LpPosition } from "./entities/lp-position.entity";
import { AddLiquidityDto, RemoveLiquidityDto } from "./dto/liquidity.dto";

@Injectable()
export class LiquidityService {
  constructor(
    @InjectRepository(LiquidityPool)
    private poolRepo: Repository<LiquidityPool>,
    @InjectRepository(LpPosition)
    private positionRepo: Repository<LpPosition>,
  ) {}

  async getPools(): Promise<LiquidityPool[]> {
    return this.poolRepo.find();
  }

  async getPool(poolId: string): Promise<LiquidityPool> {
    const pool = await this.poolRepo.findOne({ where: { id: poolId } });
    if (!pool) throw new NotFoundException(`Pool ${poolId} not found`);
    return pool;
  }

  async getPoolStats(poolId: string) {
    const pool = await this.getPool(poolId);
    const rA = parseFloat(pool.reserveA);
    const rB = parseFloat(pool.reserveB);
    const totalLp = parseFloat(pool.totalLpTokens);

    const tvl = rA + rB;
    const price = rA > 0 ? rB / rA : 0;

    return {
      poolId,
      tokenA: pool.tokenA,
      tokenB: pool.tokenB,
      reserveA: rA,
      reserveB: rB,
      totalLpTokens: totalLp,
      tvl,
      price,
      feeBps: pool.feeBps,
    };
  }

  async getUserPositions(userId: string) {
    return this.positionRepo.find({ where: { userId } });
  }

  /**
   * Add liquidity using constant-product AMM (x * y = k).
   * First provider sets the price; subsequent providers must match ratio.
   */
  async addLiquidity(poolId: string, dto: AddLiquidityDto) {
    const pool = await this.getPool(poolId);
    const rA = parseFloat(pool.reserveA);
    const rB = parseFloat(pool.reserveB);
    const totalLp = parseFloat(pool.totalLpTokens);

    const amountA = dto.amountA;
    let amountB = dto.amountB;
    let lpMinted: number;

    if (totalLp === 0) {
      // First liquidity provider — set initial price
      lpMinted = Math.sqrt(amountA * amountB);
    } else {
      // Enforce ratio; adjust amountB to match pool ratio
      const ratio = rA / rB;
      const expectedB = amountA / ratio;
      const slippage = dto.slippageBps ?? 50;
      const minB = expectedB * (1 - slippage / 10000);
      const maxB = expectedB * (1 + slippage / 10000);

      if (amountB < minB || amountB > maxB) {
        throw new BadRequestException(
          `amountB ${amountB} outside slippage range [${minB.toFixed(4)}, ${maxB.toFixed(4)}]`,
        );
      }
      amountB = expectedB;
      lpMinted = (amountA / rA) * totalLp;
    }

    pool.reserveA = (rA + amountA).toString();
    pool.reserveB = (rB + amountB).toString();
    pool.totalLpTokens = (totalLp + lpMinted).toString();
    await this.poolRepo.save(pool);

    // Update user position
    let position = await this.positionRepo.findOne({
      where: { userId: dto.userId, poolId },
    });
    if (!position) {
      position = this.positionRepo.create({
        userId: dto.userId,
        poolId,
        lpTokens: "0",
      });
    }
    position.lpTokens = (parseFloat(position.lpTokens) + lpMinted).toString();
    await this.positionRepo.save(position);

    return { lpMinted, amountA, amountB };
  }

  /**
   * Remove liquidity proportional to LP tokens burned.
   */
  async removeLiquidity(poolId: string, dto: RemoveLiquidityDto) {
    const pool = await this.getPool(poolId);
    const position = await this.positionRepo.findOne({
      where: { userId: dto.userId, poolId },
    });

    if (!position || parseFloat(position.lpTokens) < dto.lpTokens) {
      throw new BadRequestException("Insufficient LP tokens");
    }

    const rA = parseFloat(pool.reserveA);
    const rB = parseFloat(pool.reserveB);
    const totalLp = parseFloat(pool.totalLpTokens);
    const share = dto.lpTokens / totalLp;

    const returnA = rA * share;
    const returnB = rB * share;

    pool.reserveA = (rA - returnA).toString();
    pool.reserveB = (rB - returnB).toString();
    pool.totalLpTokens = (totalLp - dto.lpTokens).toString();
    await this.poolRepo.save(pool);

    position.lpTokens = (
      parseFloat(position.lpTokens) - dto.lpTokens
    ).toString();
    await this.positionRepo.save(position);

    return { returnA, returnB, lpBurned: dto.lpTokens };
  }

  /** Calculate impermanent loss for a position given current prices */
  calculateImpermanentLoss(initialPrice: number, currentPrice: number): number {
    const priceRatio = currentPrice / initialPrice;
    const holdValue = 1 + priceRatio;
    const lpValue = 2 * Math.sqrt(priceRatio);
    return (lpValue / holdValue - 1) * 100;
  }
}
