import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RiskManagementService } from './risk-management.service';
import { RiskConfigDto, PositionSizeDto } from './dto/risk.dto';

@Controller('risk')
@UseGuards(JwtAuthGuard)
export class RiskManagementController {
  constructor(private readonly riskService: RiskManagementService) {}

  @Post('config')
  setRiskConfig(@Body() dto: RiskConfigDto) {
    this.riskService.setRiskConfig(dto);
    return { success: true, message: 'Risk configuration updated' };
  }

  @Get('config/:userId')
  getRiskConfig(@Param('userId') userId: string) {
    const config = this.riskService.getRiskConfig(userId);
    return config ?? { message: 'No risk config found' };
  }

  @Post('portfolio/:userId/analyze')
  async analyzePortfolio(
    @Param('userId') userId: string,
    @Body() body: { positions: Array<{ asset: string; value: number; weight: number; volatility: number; entryPrice: number; currentPrice: number }> },
  ) {
    return this.riskService.calculatePortfolioRisk(userId, body.positions);
  }

  @Post('position-size')
  calculatePositionSize(@Body() dto: PositionSizeDto) {
    return this.riskService.calculatePositionSize(dto);
  }

  @Get('stop-loss/:userId/:asset')
  checkStopLoss(
    @Param('userId') userId: string,
    @Param('asset') asset: string,
    @Query('entryPrice') entryPrice: string,
    @Query('currentPrice') currentPrice: string,
  ) {
    const triggered = this.riskService.checkStopLoss(userId, asset, +entryPrice, +currentPrice);
    return { triggered, asset, userId };
  }

  @Get('take-profit/:userId/:asset')
  checkTakeProfit(
    @Param('userId') userId: string,
    @Param('asset') asset: string,
    @Query('entryPrice') entryPrice: string,
    @Query('currentPrice') currentPrice: string,
  ) {
    const triggered = this.riskService.checkTakeProfit(userId, asset, +entryPrice, +currentPrice);
    return { triggered, asset, userId };
  }
}
