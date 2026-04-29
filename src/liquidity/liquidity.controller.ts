import { Controller, Get, Post, Param, Body } from "@nestjs/common";
import { LiquidityService } from "./liquidity.service";
import { AddLiquidityDto, RemoveLiquidityDto } from "./dto/liquidity.dto";

@Controller("api/pools")
export class LiquidityController {
  constructor(private readonly liquidityService: LiquidityService) {}

  @Get()
  getPools() {
    return this.liquidityService.getPools();
  }

  @Get(":poolId/stats")
  getPoolStats(@Param("poolId") poolId: string) {
    return this.liquidityService.getPoolStats(poolId);
  }

  @Post(":poolId/add-liquidity")
  addLiquidity(@Param("poolId") poolId: string, @Body() dto: AddLiquidityDto) {
    return this.liquidityService.addLiquidity(poolId, dto);
  }

  @Post(":poolId/remove-liquidity")
  removeLiquidity(
    @Param("poolId") poolId: string,
    @Body() dto: RemoveLiquidityDto,
  ) {
    return this.liquidityService.removeLiquidity(poolId, dto);
  }

  @Get("users/:userId/lp-positions")
  getUserPositions(@Param("userId") userId: string) {
    return this.liquidityService.getUserPositions(userId);
  }
}
