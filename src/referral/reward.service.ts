import { Injectable, Logger, ConflictException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  ReferralReward,
  RewardStatus,
  RewardTrigger,
  RewardType,
} from "./reward.entity";
import { User } from "../user/entities/user.entity";
import { AuditLogService } from "../audit/audit-log.service";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class RewardService {
  private readonly logger = new Logger(RewardService.name);

  constructor(
    @InjectRepository(ReferralReward)
    private readonly rewardRepository: Repository<ReferralReward>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Generates a unique referral code for a user
   */
  async generateUniqueReferralCode(): Promise<string> {
    let code: string;
    let exists = true;
    while (exists) {
      code = Math.random().toString(36).substring(2, 10).toUpperCase();
      const user = await this.userRepository.findOne({
        where: { referralCode: code },
      });
      if (!user) exists = false;
    }
    return code;
  }

  /**
   * Handles a reward trigger event
   */
  async handleTrigger(event: RewardTrigger, refereeId: string) {
    this.logger.log(`Handling trigger ${event} for referee ${refereeId}`);

    // 1. Get referee and referrer
    const referee = await this.userRepository.findOne({
      where: { id: refereeId },
      relations: ["referredBy"],
    });

    if (!referee || !referee.referredById) {
      this.logger.debug(
        `No referrer found for user ${refereeId}, skipping rewards.`,
      );
      return;
    }

    const referrerId = referee.referredById;

    // 2. Prevent duplicate rewards for the same trigger/referee
    const existingReward = await this.rewardRepository.findOne({
      where: { refereeId, triggerEvent: event },
    });

    if (existingReward) {
      this.logger.warn(
        `Reward already exists for ${event} and referee ${refereeId}`,
      );
      return;
    }

    // 3. Calculate rewards
    const rewards = this.calculateRewards(event, referrerId, refereeId);

    // 4. Create and process rewards
    for (const rewardData of rewards) {
      const reward = this.rewardRepository.create({
        ...rewardData,
        status: RewardStatus.PENDING,
      });

      await this.rewardRepository.save(reward);

      // In a real system, we would integrate with a balance service here
      // For now, we'll mark it as AWARDED and log it in the audit trail
      await this.processPayout(reward);
    }
  }

  /**
   * Defines reward logic (configurable parts)
   */
  private calculateRewards(
    event: RewardTrigger,
    referrerId: string,
    refereeId: string,
  ): Partial<ReferralReward>[] {
    const rewards: Partial<ReferralReward>[] = [];

    if (event === RewardTrigger.REGISTRATION) {
      // Reward Referrer: 10 Credits
      rewards.push({
        referrerId,
        refereeId,
        rewardType: RewardType.CREDITS,
        amount: 10,
        triggerEvent: event,
        metadata: { party: "referrer" },
      });

      // Reward Referee: 5 Credits
      rewards.push({
        referrerId,
        refereeId,
        rewardType: RewardType.CREDITS,
        amount: 5,
        triggerEvent: event,
        metadata: { party: "referee" },
      });
    }

    return rewards;
  }

  /**
   * Processes the actual payout (mocked for now)
   */
  private async processPayout(reward: ReferralReward) {
    try {
      // Mock payout logic: Assume it succeeds
      reward.status = RewardStatus.AWARDED;
      await this.rewardRepository.save(reward);

      // Audit Log entry
      await this.auditLogService.recordVerification({
        event: "REFERRAL_REWARD_PAYOUT",
        rewardId: reward.id,
        partyId:
          reward.metadata?.party === "referrer"
            ? reward.referrerId
            : reward.refereeId,
        amount: reward.amount,
        type: reward.rewardType,
        timestamp: new Date(),
      });

      this.logger.log(`Reward ${reward.id} awarded successfully.`);
    } catch (error) {
      this.logger.error(
        `Failed to process payout for reward ${reward.id}`,
        error.stack,
      );
      reward.status = RewardStatus.FAILED;
      await this.rewardRepository.save(reward);
    }
  }

  /**
   * Retrieves rewards for a specific user
   */
  async getRewardsForUser(userId: string): Promise<ReferralReward[]> {
    return this.rewardRepository.find({
      where: [{ referrerId: userId }, { refereeId: userId }],
      order: { createdAt: "DESC" },
    });
  }
}
