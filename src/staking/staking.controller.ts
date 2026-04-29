import { Controller, Post, Get, Body, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { StakingService } from './staking.service';

@Controller('staking')
@UseGuards(JwtAuthGuard)
export class StakingController {
  constructor(private readonly stakingService: StakingService) {}

  @Post('stake')
  stake(
    @Req() req: any,
    @Body() body: { amount: number; durationDays: number; compounding?: boolean },
  ) {
    return this.stakingService.stake(req.user.id, body.amount, body.durationDays, body.compounding);
  }

  @Post('unstake')
  unstake(@Req() req: any, @Body() body: { positionId: string }) {
    return this.stakingService.unstake(req.user.id, body.positionId);
  }

  @Post('claim-rewards')
  claimRewards(@Req() req: any, @Body() body: { positionId: string }) {
    return this.stakingService.claimRewards(req.user.id, body.positionId);
  }

  @Get('positions/:userId')
  getPositions(@Param('userId') userId: string) {
    return this.stakingService.getPositions(userId);
  }

  @Get('stats')
  getStats() {
    return this.stakingService.getStats();
  }
}
