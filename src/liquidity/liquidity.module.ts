import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LiquidityPool } from "./entities/liquidity-pool.entity";
import { LpPosition } from "./entities/lp-position.entity";
import { LiquidityService } from "./liquidity.service";
import { LiquidityController } from "./liquidity.controller";

@Module({
  imports: [TypeOrmModule.forFeature([LiquidityPool, LpPosition])],
  providers: [LiquidityService],
  controllers: [LiquidityController],
  exports: [LiquidityService],
})
export class LiquidityModule {}
