import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ReferralReward } from "./reward.entity";
import { User } from "../user/entities/user.entity";
import { RewardService } from "./reward.service";
import { RewardController } from "./reward.controller";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [TypeOrmModule.forFeature([ReferralReward, User]), AuditModule],
  controllers: [RewardController],
  providers: [RewardService],
  exports: [RewardService],
})
export class ReferralModule {}
