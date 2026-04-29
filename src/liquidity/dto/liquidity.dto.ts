import { IsString, IsNumber, IsOptional, Min, Max } from "class-validator";

export class AddLiquidityDto {
  @IsString()
  userId: string;

  @IsNumber()
  @Min(0)
  amountA: number;

  @IsNumber()
  @Min(0)
  amountB: number;

  /** Maximum slippage in basis points (e.g. 50 = 0.5%) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000)
  slippageBps?: number;
}

export class RemoveLiquidityDto {
  @IsString()
  userId: string;

  @IsNumber()
  @Min(0)
  lpTokens: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000)
  slippageBps?: number;
}
