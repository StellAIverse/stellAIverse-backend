import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ReferralCode } from "./entities/referral-code.entity";
import { Referral } from "./entities/referral.entity";
import { ReferralAbuseEvent } from "./entities/referral-abuse-event.entity";
import { User } from "../user/entities/user.entity";
import { ReferralService } from "./referral.service";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsController } from "./analytics.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReferralCode,
      Referral,
      ReferralAbuseEvent,
      User,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [ReferralService, AnalyticsService],
  exports: [ReferralService, AnalyticsService],
})
export class ReferralModule {}
