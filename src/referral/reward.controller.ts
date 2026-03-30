import { Controller, Get, UseGuards } from "@nestjs/common";
import { RewardService } from "./reward.service";
import { ReferralReward } from "./reward.entity";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("referral-rewards")
@UseGuards(JwtAuthGuard)
export class RewardController {
  constructor(private readonly rewardService: RewardService) {}

  @Get()
  async getMyRewards(
    @CurrentUser("id") userId: string,
  ): Promise<ReferralReward[]> {
    return this.rewardService.getRewardsForUser(userId);
  }
}
