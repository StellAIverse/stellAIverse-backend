import { Controller, Post, Body, Req, UseGuards, Headers } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { TradeLockService } from './trade-lock.service';

@Controller('trading')
@UseGuards(JwtAuthGuard)
export class TradeController {
  constructor(private readonly tradeLockService: TradeLockService) {}

  /**
   * Execute a trade with idempotency key and per-user locking to prevent race conditions.
   * Clients must provide a unique Idempotency-Key header per trade request.
   */
  @Post('execute')
  async executeTrade(
    @Req() req: any,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: { asset: string; amount: number; side: 'buy' | 'sell' },
  ) {
    return this.tradeLockService.executeTrade({
      idempotencyKey: idempotencyKey || `${req.user.id}_${Date.now()}`,
      userId: req.user.id,
      asset: body.asset,
      amount: body.amount,
      side: body.side,
    });
  }
}
