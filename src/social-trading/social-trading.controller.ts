import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { SocialTradingService } from './social-trading.service';
import {
  CreateTraderProfileDto,
  FollowTraderDto,
  SocialInteractionDto,
  LeaderboardQueryDto,
} from './dto/social-trading.dto';

@Controller('social-trading')
@UseGuards(JwtAuthGuard)
export class SocialTradingController {
  constructor(private readonly socialTradingService: SocialTradingService) {}

  @Post('profiles')
  createProfile(@Body() dto: CreateTraderProfileDto) {
    return this.socialTradingService.createProfile(dto);
  }

  @Get('profiles/:userId')
  getProfile(@Param('userId') userId: string) {
    return this.socialTradingService.getProfile(userId);
  }

  @Post('follow')
  followTrader(@Body() dto: FollowTraderDto) {
    return this.socialTradingService.followTrader(dto);
  }

  @Delete('follow/:followerId/:traderId')
  unfollowTrader(
    @Param('followerId') followerId: string,
    @Param('traderId') traderId: string,
  ) {
    return this.socialTradingService.unfollowTrader(followerId, traderId);
  }

  @Get('leaderboard')
  getLeaderboard(@Query() query: LeaderboardQueryDto) {
    return this.socialTradingService.getLeaderboard(query);
  }

  @Get('copy-trades/:userId')
  getCopyTrades(@Param('userId') userId: string) {
    return this.socialTradingService.getCopyTrades(userId);
  }

  @Post('interactions')
  addInteraction(@Body() dto: SocialInteractionDto) {
    return this.socialTradingService.addInteraction(dto);
  }
}
