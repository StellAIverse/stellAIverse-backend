import { Injectable, Logger } from '@nestjs/common';
import {
  InitiateSwapDto,
  SwapStatusDto,
  CrossChainPriceDto,
  SupportedChain,
} from './dto/cross-chain.dto';

@Injectable()
export class CrossChainService {
  private readonly logger = new Logger(CrossChainService.name);

  // In-memory swap tracking (replace with DB in production)
  private readonly swaps = new Map<string, SwapStatusDto>();

  private readonly BRIDGE_FEES: Record<string, number> = {
    [`${SupportedChain.ETHEREUM}-${SupportedChain.POLYGON}`]: 0.001,
    [`${SupportedChain.ETHEREUM}-${SupportedChain.BSC}`]: 0.002,
    [`${SupportedChain.ETHEREUM}-${SupportedChain.ARBITRUM}`]: 0.0005,
    [`${SupportedChain.ETHEREUM}-${SupportedChain.AVALANCHE}`]: 0.0015,
    [`${SupportedChain.POLYGON}-${SupportedChain.BSC}`]: 0.001,
    [`${SupportedChain.POLYGON}-${SupportedChain.ARBITRUM}`]: 0.0008,
    [`${SupportedChain.BSC}-${SupportedChain.AVALANCHE}`]: 0.0012,
  };

  async initiateSwap(dto: InitiateSwapDto): Promise<SwapStatusDto> {
    const swapId = `swap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const bridgeFee = this.getBridgeFee(dto.sourceChain, dto.destinationChain);

    const swap: SwapStatusDto = {
      swapId,
      status: 'pending',
      sourceChain: dto.sourceChain,
      destinationChain: dto.destinationChain,
      estimatedGasFee: bridgeFee * dto.amount,
      estimatedTime: this.estimateBridgeTime(dto.sourceChain, dto.destinationChain),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.swaps.set(swapId, swap);
    this.logger.log(`Initiated cross-chain swap ${swapId}: ${dto.sourceChain} -> ${dto.destinationChain}`);

    // Simulate async bridge processing
    this.processBridgeAsync(swapId, dto);

    return swap;
  }

  async getSwapStatus(swapId: string): Promise<SwapStatusDto | null> {
    return this.swaps.get(swapId) ?? null;
  }

  async getCrossChainPrice(
    sourceChain: SupportedChain,
    destinationChain: SupportedChain,
    sourceToken: string,
    destinationToken: string,
    amount: number,
  ): Promise<CrossChainPriceDto> {
    const bridgeFee = this.getBridgeFee(sourceChain, destinationChain);
    const priceImpact = this.calculatePriceImpact(amount);
    const mockPrice = 1.0 - priceImpact;

    return {
      sourceChain,
      destinationChain,
      sourceToken,
      destinationToken,
      price: mockPrice,
      liquidity: 1_000_000,
      priceImpact,
      bridgeFee: bridgeFee * amount,
      estimatedOutput: amount * mockPrice * (1 - bridgeFee),
    };
  }

  getSupportedChains(): SupportedChain[] {
    return Object.values(SupportedChain);
  }

  getSupportedBridges(): { source: SupportedChain; destination: SupportedChain; fee: number }[] {
    return Object.entries(this.BRIDGE_FEES).map(([key, fee]) => {
      const [source, destination] = key.split('-') as [SupportedChain, SupportedChain];
      return { source, destination, fee };
    });
  }

  private getBridgeFee(source: SupportedChain, destination: SupportedChain): number {
    return (
      this.BRIDGE_FEES[`${source}-${destination}`] ??
      this.BRIDGE_FEES[`${destination}-${source}`] ??
      0.002
    );
  }

  private estimateBridgeTime(source: SupportedChain, destination: SupportedChain): number {
    const times: Partial<Record<SupportedChain, number>> = {
      [SupportedChain.ETHEREUM]: 900,
      [SupportedChain.POLYGON]: 120,
      [SupportedChain.BSC]: 60,
      [SupportedChain.ARBITRUM]: 300,
      [SupportedChain.AVALANCHE]: 180,
    };
    return (times[source] ?? 300) + (times[destination] ?? 300);
  }

  private calculatePriceImpact(amount: number): number {
    // Simplified price impact model
    return Math.min(amount / 10_000_000, 0.05);
  }

  private async processBridgeAsync(swapId: string, dto: InitiateSwapDto): Promise<void> {
    const swap = this.swaps.get(swapId);
    if (!swap) return;

    // Simulate source chain tx
    setTimeout(() => {
      const s = this.swaps.get(swapId);
      if (s) {
        s.status = 'bridging';
        s.sourceTxHash = `0x${Math.random().toString(16).slice(2, 66)}`;
        s.updatedAt = new Date();
      }
    }, 2000);

    // Simulate destination chain settlement
    const settlementTime = this.estimateBridgeTime(dto.sourceChain, dto.destinationChain);
    setTimeout(() => {
      const s = this.swaps.get(swapId);
      if (s) {
        s.status = 'completed';
        s.destinationTxHash = `0x${Math.random().toString(16).slice(2, 66)}`;
        s.updatedAt = new Date();
        this.logger.log(`Swap ${swapId} completed`);
      }
    }, Math.min(settlementTime * 10, 30000)); // Scaled down for demo
  }
}
