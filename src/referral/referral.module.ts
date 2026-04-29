import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ReferralReward } from "./reward.entity";
import { BonusConfiguration } from "./bonus-configuration.entity";
import { BonusCalculation } from "./bonus-calculation.entity";
import { User } from "../user/entities/user.entity";
import { RewardService } from "./reward.service";
import { RewardController } from "./reward.controller";
import { BonusCalculationService } from "./bonus-calculation.service";
import { BonusCalculationController } from "./bonus-calculation.controller";
import { AuditModule } from "../audit/audit.module";
import { AffiliateController } from "./affiliate.controller";
import { AffiliateService } from "./affiliate.service";

@Module({
  imports: [TypeOrmModule.forFeature([ReferralReward, BonusConfiguration, BonusCalculation, User]), AuditModule],
  controllers: [RewardController, BonusCalculationController, AffiliateController],
  providers: [RewardService, BonusCalculationService, AffiliateService],
  exports: [RewardService, BonusCalculationService, AffiliateService],
})
export class ReferralModule {}
