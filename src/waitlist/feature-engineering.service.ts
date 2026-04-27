import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WaitlistEntry } from './entities/waitlist-entry.entity';
import { WaitlistEvent, WaitlistEventType } from './entities/waitlist-event.entity';

export interface UserFeatures {
  userId: string;
  // Behavioral
  totalEvents: number;
  recentEvents7d: number;
  recentEvents30d: number;
  avgDaysBetweenEvents: number;
  // Social
  referralCount: number;
  referralDepth: number;
  // Engagement
  engagementScore: number;
  daysSinceJoin: number;
  activityFrequency: number;
  // Normalized [0,1]
  normalizedScore: number;
}

@Injectable()
export class FeatureEngineeringService {
  private readonly logger = new Logger(FeatureEngineeringService.name);

  constructor(
    @InjectRepository(WaitlistEntry)
    private readonly entryRepo: Repository<WaitlistEntry>,
    @InjectRepository(WaitlistEvent)
    private readonly eventRepo: Repository<WaitlistEvent>,
  ) {}

  async extractFeatures(userId: string, waitlistId: string): Promise<UserFeatures> {
    const entry = await this.entryRepo.findOne({ where: { userId, waitlistId } });

    const events = entry
      ? await this.eventRepo.find({ where: { entryId: entry.id } })
      : [];

    const now = new Date();
    const cutoff7d = new Date(now.getTime() - 7 * 86400_000);
    const cutoff30d = new Date(now.getTime() - 30 * 86400_000);

    const totalEvents = events.length;
    const recentEvents7d = events.filter(e => new Date(e.createdAt) >= cutoff7d).length;
    const recentEvents30d = events.filter(e => new Date(e.createdAt) >= cutoff30d).length;
    const avgDaysBetweenEvents = this.calcAvgInterval(events.map(e => new Date(e.createdAt)));

    const referralCount = events.filter(e => e.eventType === WaitlistEventType.PRIORITY_UPDATED).length;
    const referralDepth = entry?.referralId ? 1 : 0;

    const daysSinceJoin = entry
      ? Math.max(1, (now.getTime() - new Date(entry.joinedAt).getTime()) / 86400_000)
      : 365;

    const activityFrequency = totalEvents / daysSinceJoin;
    const engagementScore = this.calcEngagementScore(recentEvents7d, recentEvents30d, referralDepth);

    const raw = engagementScore * 0.4 + activityFrequency * 30 * 0.3 + referralDepth * 5 * 0.3;
    const normalizedScore = Math.min(1, raw / 100);

    return {
      userId,
      totalEvents,
      recentEvents7d,
      recentEvents30d,
      avgDaysBetweenEvents,
      referralCount,
      referralDepth,
      engagementScore,
      daysSinceJoin,
      activityFrequency,
      normalizedScore,
    };
  }

  async extractBatch(userIds: string[], waitlistId: string): Promise<UserFeatures[]> {
    return Promise.all(userIds.map(uid => this.extractFeatures(uid, waitlistId)));
  }

  private calcAvgInterval(dates: Date[]): number {
    if (dates.length < 2) return 0;
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    let total = 0;
    for (let i = 1; i < sorted.length; i++) {
      total += (sorted[i].getTime() - sorted[i - 1].getTime()) / 86400_000;
    }
    return total / (sorted.length - 1);
  }

  private calcEngagementScore(recent7d: number, recent30d: number, referralDepth: number): number {
    return Math.min(100, recent7d * 5 + recent30d * 2 + referralDepth * 10);
  }

  /** Validate and clean features — returns null for invalid entries */
  validateFeatures(f: UserFeatures): UserFeatures | null {
    if (!f.userId) return null;
    return {
      ...f,
      totalEvents: Math.max(0, f.totalEvents),
      recentEvents7d: Math.max(0, f.recentEvents7d),
      recentEvents30d: Math.max(0, f.recentEvents30d),
      normalizedScore: Math.min(1, Math.max(0, f.normalizedScore)),
    };
  }
}
