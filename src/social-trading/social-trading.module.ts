import { Module } from '@nestjs/common';
import { SocialTradingService } from './social-trading.service';
import { SocialTradingController } from './social-trading.controller';

@Module({
  controllers: [SocialTradingController],
  providers: [SocialTradingService],
  exports: [SocialTradingService],
})
export class SocialTradingModule {}
