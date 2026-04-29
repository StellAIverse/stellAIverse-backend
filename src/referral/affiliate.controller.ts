import { Controller, Post, Get, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AffiliateService } from './affiliate.service';

@Controller('referral')
@UseGuards(JwtAuthGuard)
export class AffiliateController {
  constructor(private readonly affiliateService: AffiliateService) {}

  /** POST /api/referral/register - Register with a referral code */
  @Post('register')
  register(@Req() req: any, @Body() body: { referralCode?: string }) {
    return this.affiliateService.register(req.user.id, body.referralCode);
  }

  /** GET /api/referral/stats - Get user's referral stats */
  @Get('stats')
  getStats(@Req() req: any) {
    return this.affiliateService.getStats(req.user.id);
  }

  /** GET /api/referral/earnings - Get user's referral earnings */
  @Get('earnings')
  getEarnings(@Req() req: any) {
    return this.affiliateService.getEarnings(req.user.id);
  }

  /** POST /api/referral/withdraw - Withdraw referral earnings */
  @Post('withdraw')
  withdraw(@Req() req: any, @Body() body: { amount: number }) {
    return this.affiliateService.withdraw(req.user.id, body.amount);
  }
}
