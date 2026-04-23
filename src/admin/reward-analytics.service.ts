import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThan } from 'typeorm';
import { RewardCalculation } from '../reward-engine/entities/reward-calculation.entity';
import { ReferralReward } from '../referral/reward.entity';
import { TimeBasedEvent } from '../scheduling/entities/time-based-event.entity';
import { EventParticipation } from '../scheduling/entities/event-participation.entity';

export interface RewardAnalytics {
  totalRewardsDistributed: number;
  totalRewardValue: number;
  rewardsByType: Record<string, number>;
  rewardsByCurrency: Record<string, number>;
  topRewardedUsers: Array<{
    userId: string;
    totalRewards: number;
    totalValue: number;
  }>;
  rewardTrends: Array<{
    date: string;
    count: number;
    value: number;
  }>;
  eventPerformance: Array<{
    eventId: string;
    eventName: string;
    participants: number;
    totalRewards: number;
    averageRewardPerUser: number;
    completionRate: number;
  }>;
  roiMetrics: {
    totalInvestment: number;
    totalReturns: number;
    roi: number;
  };
}

@Injectable()
export class RewardAnalyticsService {
  private readonly logger = new Logger(RewardAnalyticsService.name);

  constructor(
    @InjectRepository(RewardCalculation)
    private readonly calculationRepository: Repository<RewardCalculation>,
    @InjectRepository(ReferralReward)
    private readonly referralRewardRepository: Repository<ReferralReward>,
    @InjectRepository(TimeBasedEvent)
    private readonly eventRepository: Repository<TimeBasedEvent>,
    @InjectRepository(EventParticipation)
    private readonly participationRepository: Repository<EventParticipation>,
  ) {}

  /**
   * Gets comprehensive reward analytics
   */
  async getRewardAnalytics(
    startDate?: Date,
    endDate?: Date,
  ): Promise<RewardAnalytics> {
    const dateFilter = startDate && endDate ? { calculatedAt: Between(startDate, endDate) } : {};

    // Get reward calculations
    const calculations = await this.calculationRepository.find({
      where: {
        processed: true,
        ...dateFilter,
      },
      relations: ['rule'],
    });

    // Get referral rewards
    const referralRewards = await this.referralRewardRepository.find({
      where: {
        status: 'awarded',
        ...dateFilter,
      },
    });

    // Get event data
    const events = await this.eventRepository.find({
      where: dateFilter,
    });

    const participations = await this.participationRepository.find({
      where: dateFilter,
      relations: ['event'],
    });

    return {
      totalRewardsDistributed: calculations.length + referralRewards.length,
      totalRewardValue: this.calculateTotalValue([...calculations, ...referralRewards]),
      rewardsByType: this.groupByType([...calculations, ...referralRewards]),
      rewardsByCurrency: this.groupByCurrency([...calculations, ...referralRewards]),
      topRewardedUsers: await this.getTopRewardedUsers(startDate, endDate),
      rewardTrends: await this.getRewardTrends(startDate, endDate),
      eventPerformance: await this.getEventPerformance(events, participations),
      roiMetrics: await this.calculateROIMetrics(startDate, endDate),
    };
  }

  /**
   * Gets user engagement metrics
   */
  async getUserEngagementMetrics(
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    activeUsers: number;
    newUsers: number;
    returningUsers: number;
    averageSessionDuration: number;
    userRetentionRate: number;
    engagementBySegment: Record<string, number>;
  }> {
    // This would integrate with user activity logs
    // Placeholder implementation
    return {
      activeUsers: 0,
      newUsers: 0,
      returningUsers: 0,
      averageSessionDuration: 0,
      userRetentionRate: 0,
      engagementBySegment: {},
    };
  }

  /**
   * Gets campaign performance metrics
   */
  async getCampaignPerformance(
    campaignId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    campaignId: string;
    campaignName: string;
    startDate: Date;
    endDate: Date;
    totalParticipants: number;
    totalEngagement: number;
    conversionRate: number;
    averageOrderValue: number;
    roi: number;
    costPerAcquisition: number;
  }[]> {
    // Implementation would analyze campaign data
    return [];
  }

  /**
   * Calculates ROI metrics
   */
  private async calculateROIMetrics(
    startDate?: Date,
    endDate?: Date,
  ): Promise<{ totalInvestment: number; totalReturns: number; roi: number }> {
    // This would calculate actual investment vs returns
    // Placeholder with sample data
    const totalInvestment = 10000; // Cost of running reward programs
    const totalReturns = 25000; // Revenue generated from rewarded users

    return {
      totalInvestment,
      totalReturns,
      roi: ((totalReturns - totalInvestment) / totalInvestment) * 100,
    };
  }

  /**
   * Gets top rewarded users
   */
  private async getTopRewardedUsers(
    startDate?: Date,
    endDate?: Date,
  ): Promise<Array<{ userId: string; totalRewards: number; totalValue: number }>> {
    // Aggregate rewards by user
    const dateFilter = startDate && endDate ? { calculatedAt: Between(startDate, endDate) } : {};

    const calculations = await this.calculationRepository
      .createQueryBuilder('calc')
      .select('calc.userId', 'userId')
      .addSelect('COUNT(*)', 'totalRewards')
      .addSelect('SUM(calc.calculatedAmount)', 'totalValue')
      .where('calc.processed = :processed', { processed: true })
      .andWhere(dateFilter)
      .groupBy('calc.userId')
      .orderBy('totalValue', 'DESC')
      .limit(10)
      .getRawMany();

    return calculations.map(row => ({
      userId: row.userId,
      totalRewards: parseInt(row.totalRewards),
      totalValue: parseFloat(row.totalValue) || 0,
    }));
  }

  /**
   * Gets reward trends over time
   */
  private async getRewardTrends(
    startDate?: Date,
    endDate?: Date,
  ): Promise<Array<{ date: string; count: number; value: number }>> {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const end = endDate || new Date();

    const trends = await this.calculationRepository
      .createQueryBuilder('calc')
      .select("DATE(calc.calculatedAt)", 'date')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(calc.calculatedAmount)', 'value')
      .where('calc.processed = :processed', { processed: true })
      .andWhere('calc.calculatedAt BETWEEN :start AND :end', { start, end })
      .groupBy("DATE(calc.calculatedAt)")
      .orderBy('date', 'ASC')
      .getRawMany();

    return trends.map(row => ({
      date: row.date,
      count: parseInt(row.count),
      value: parseFloat(row.value) || 0,
    }));
  }

  /**
   * Gets event performance metrics
   */
  private async getEventPerformance(
    events: TimeBasedEvent[],
    participations: EventParticipation[],
  ): Promise<Array<{
    eventId: string;
    eventName: string;
    participants: number;
    totalRewards: number;
    averageRewardPerUser: number;
    completionRate: number;
  }>> {
    return events.map(event => {
      const eventParticipations = participations.filter(p => p.eventId === event.id);
      const completedParticipations = eventParticipations.filter(p => p.status === 'completed');

      return {
        eventId: event.id,
        eventName: event.name,
        participants: eventParticipations.length,
        totalRewards: event.totalClaims,
        averageRewardPerUser: eventParticipations.length > 0
          ? event.totalRewardsDistributed / eventParticipations.length
          : 0,
        completionRate: eventParticipations.length > 0
          ? (completedParticipations.length / eventParticipations.length) * 100
          : 0,
      };
    });
  }

  /**
   * Helper methods for aggregation
   */
  private calculateTotalValue(rewards: any[]): number {
    return rewards.reduce((total, reward) => {
      const amount = reward.amount || reward.calculatedAmount || 0;
      return total + amount;
    }, 0);
  }

  private groupByType(rewards: any[]): Record<string, number> {
    return rewards.reduce((groups, reward) => {
      const type = reward.rewardType || reward.action?.type || 'unknown';
      groups[type] = (groups[type] || 0) + 1;
      return groups;
    }, {});
  }

  private groupByCurrency(rewards: any[]): Record<string, number> {
    return rewards.reduce((groups, reward) => {
      const currency = reward.currency || reward.action?.currency || 'USD';
      const amount = reward.amount || reward.calculatedAmount || 0;
      groups[currency] = (groups[currency] || 0) + amount;
      return groups;
    }, {});
  }
}