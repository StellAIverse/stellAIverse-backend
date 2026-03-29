import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CrossChainService } from './cross-chain.service';
import { InitiateSwapDto, SupportedChain } from './dto/cross-chain.dto';

@Controller('cross-chain')
@UseGuards(JwtAuthGuard)
export class CrossChainController {
  constructor(private readonly crossChainService: CrossChainService) {}

  @Post('swap')
  initiateSwap(@Body() dto: InitiateSwapDto) {
    return this.crossChainService.initiateSwap(dto);
  }

  @Get('swap/:swapId')
  getSwapStatus(@Param('swapId') swapId: string) {
    return this.crossChainService.getSwapStatus(swapId);
  }

  @Get('price')
  getCrossChainPrice(
    @Query('sourceChain') sourceChain: SupportedChain,
    @Query('destinationChain') destinationChain: SupportedChain,
    @Query('sourceToken') sourceToken: string,
    @Query('destinationToken') destinationToken: string,
    @Query('amount') amount: string,
  ) {
    return this.crossChainService.getCrossChainPrice(
      sourceChain,
      destinationChain,
      sourceToken,
      destinationToken,
      parseFloat(amount),
    );
  }

  @Get('chains')
  getSupportedChains() {
    return { chains: this.crossChainService.getSupportedChains() };
  }

  @Get('bridges')
  getSupportedBridges() {
    return { bridges: this.crossChainService.getSupportedBridges() };
  }
}
