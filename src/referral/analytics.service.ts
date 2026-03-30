import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Between } from "typeorm";
import { Referral, ReferralStatus } from "./entities/referral.entity";
import { ReferralAbuseEvent } from "./entities/referral-abuse-event.entity";
import { ReferralCode } from "./entities/referral-code.entity";
import { User } from "../user/entities/user.entity";

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(Referral)
    private readonly referralRepository: Repository<Referral>,
    @InjectRepository(ReferralAbuseEvent)
    private readonly abuseEventRepository: Repository<ReferralAbuseEvent>,
    @InjectRepository(ReferralCode)
    private readonly referralCodeRepository: Repository<ReferralCode>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Get comprehensive referral analytics
   */
  async getReferralMetrics() {
    const totalReferrals = await this.referralRepository.count();
    const completedReferrals = await this.referralRepository.count({
      where: { status: ReferralStatus.COMPLETED },
    });
    const pendingReferrals = await this.referralRepository.count({
      where: { status: ReferralStatus.PENDING },
    });

    const totalUsers = await this.userRepository.count();
    const referralConversionRate =
      totalUsers > 0 ? (totalReferrals / totalUsers) * 100 : 0;

    const topReferrers = await this.referralRepository
      .createQueryBuilder("referral")
      .select("referral.referrerId", "userId")
      .addSelect("COUNT(referral.id)", "referralCount")
      .groupBy("referral.referrerId")
      .orderBy("referralCount", "DESC")
      .limit(10)
      .getRawMany();

    const abuseMetrics = {
      totalAbuseEvents: await this.abuseEventRepository.count(),
      recentAbuseEvents: await this.abuseEventRepository.find({
        order: { createdAt: "DESC" },
        take: 10,
      }),
    };

    const rewardDistribution = await this.referralRepository
      .createQueryBuilder("referral")
      .select("SUM(referral.rewardAmount)", "totalRewards")
      .getRawOne();

    return {
      totalReferrals,
      completedReferrals,
      pendingReferrals,
      referralConversionRate: referralConversionRate.toFixed(2),
      topReferrers,
      abuseMetrics,
      totalRewards: rewardDistribution.totalRewards || 0,
    };
  }

  /**
   * Export referral data as CSV
   */
  async exportReferralDataCsv(): Promise<string> {
    const referrals = await this.referralRepository.find({
      relations: ["referrer", "referredUser"],
    });

    const header = "Referral ID,Referrer,Referee,Status,Reward,Date\n";
    const rows = referrals
      .map((r) => {
        return `${r.id},${r.referrer?.username || r.referrerId},${r.referredUser?.username || r.referredUserId},${r.status},${r.rewardAmount},${r.createdAt.toISOString()}`;
      })
      .join("\n");

    return header + rows;
  }

  /**
   * Export abuse data as JSON
   */
  async exportAbuseDataJson(): Promise<any> {
    return this.abuseEventRepository.find({
      order: { createdAt: "DESC" },
    });
  }
}
