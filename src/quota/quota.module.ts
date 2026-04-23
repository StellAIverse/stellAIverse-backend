import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { RateLimiterService } from "./rate-limiter.service";
import { QuotaController } from "./quota.controller";
import { PolicyController } from "./policy.controller";
import { PolicyService } from "./policy.service";
import { TypeOrmModule } from "@nestjs/typeorm";
import { QuotaPolicy } from "./policy.entity";
import { DynamicRateLimitScalingService } from "./dynamic-rate-limit-scaling.service";
import { PremiumFeatureBonusService } from "./premium-feature-bonus.service";
import { ReferralModule } from "../referral/referral.module";

@Module({
  imports: [ConfigModule, ReferralModule, TypeOrmModule.forFeature([QuotaPolicy])],
  providers: [
    RateLimiterService,
    PolicyService,
    DynamicRateLimitScalingService,
    PremiumFeatureBonusService,
  ],
  controllers: [QuotaController, PolicyController],
  exports: [
    RateLimiterService,
    PolicyService,
    DynamicRateLimitScalingService,
    PremiumFeatureBonusService,
  ],
})
export class QuotaModule {}
