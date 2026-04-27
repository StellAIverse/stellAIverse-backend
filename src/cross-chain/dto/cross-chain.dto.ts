import { IsString, IsNumber, IsOptional, IsEnum, Min } from "class-validator";

export enum SupportedChain {
  ETHEREUM = "ethereum",
  POLYGON = "polygon",
  BSC = "bsc",
  ARBITRUM = "arbitrum",
  AVALANCHE = "avalanche",
}

export class InitiateSwapDto {
  @IsEnum(SupportedChain)
  sourceChain: SupportedChain;

  @IsEnum(SupportedChain)
  destinationChain: SupportedChain;

  @IsString()
  sourceToken: string;

  @IsString()
  destinationToken: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  userAddress: string;

  @IsOptional()
  @IsNumber()
  slippageTolerance?: number;
}

export class SwapStatusDto {
  swapId: string;
  status: "pending" | "bridging" | "completed" | "failed";
  sourceChain: SupportedChain;
  destinationChain: SupportedChain;
  sourceTxHash?: string;
  destinationTxHash?: string;
  estimatedGasFee: number;
  estimatedTime: number;
  createdAt: Date;
  updatedAt: Date;
}

export class CrossChainPriceDto {
  sourceChain: SupportedChain;
  destinationChain: SupportedChain;
  sourceToken: string;
  destinationToken: string;
  price: number;
  liquidity: number;
  priceImpact: number;
  bridgeFee: number;
  estimatedOutput: number;
}
