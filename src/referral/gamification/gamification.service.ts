import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThanOrEqual, LessThanOrEqual } from "typeorm";
import { Badge, UserBadge, BadgeCategory, BadgeRarity } from "./badge.entity";
import { UserStreak, StreakType } from "./streak.entity";
import { LeaderboardEntry, LeaderboardCategory, LeaderboardPeriod } from "./leaderboard.entity";
import { ProgressiveUnlock, UnlockType } from "./progressive-unlock.entity";
import { User } from "../../user/entities/user.entity";
import {
  CreateBadgeDto,
  UpdateBadgeDto,
  UpdateStreakDto,
  LeaderboardQueryDto,
  CreateProgressiveUnlockDto,
  UpdateProgressDto,
} from "../dto/gamification.dto";
import { AuditLogService } from "../../audit/audit-log.service";

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(
    @InjectRepository(Badge)
    private readonly badgeRepository: Repository<Badge>,
    @InjectRepository(UserBadge)
    private readonly userBadgeRepository: Repository<UserBadge>,
    @InjectRepository(UserStreak)
    private readonly userStreakRepository: Repository<UserStreak>,
    @InjectRepository(LeaderboardEntry)
    private readonly leaderboardRepository: Repository<LeaderboardEntry>,
    @InjectRepository(ProgressiveUnlock)
    private readonly progressiveUnlockRepository: Repository<ProgressiveUnlock>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly auditLogService: AuditLogService,
  ) {}

  // ==================== BADGE SYSTEM ====================

  /**
   * Create a new badge
   */
  async createBadge(dto: CreateBadgeDto): Promise<Badge> {
    const badge = this.badgeRepository.create(dto);
    const saved = await this.badgeRepository.save(badge);
    this.logger.log(`Created badge: ${saved.name}`);
    return saved;
  }

  /**
   * Update a badge
   */
  async updateBadge(id: string, dto: UpdateBadgeDto): Promise<Badge> {
    const badge = await this.badgeRepository.findOne({ where: { id } });
    if (!badge) {
      throw new NotFoundException(`Badge with ID ${id} not found`);
    }

    Object.assign(badge, dto);
    return await this.badgeRepository.save(badge);
  }

  /**
   * Check and unlock badges for a user based on their achievements
   */
  async checkAndUnlockBadges(userId: string): Promise<UserBadge[]> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const unlockedBadges: UserBadge[] = [];
    const activeBadges = await this.badgeRepository.find({ where: { isActive: true } });

    for (const badge of activeBadges) {
      // Check if user already has this badge
      const existingUserBadge = await this.userBadgeRepository.findOne({
        where: { userId, badgeId: badge.id },
      });

      if (existingUserBadge && existingUserBadge.isUnlocked) {
        continue; // Already unlocked
      }

      // Check unlock conditions
      const shouldUnlock = await this.evaluateBadgeConditions(userId, badge);

      if (shouldUnlock) {
        if (existingUserBadge) {
          // Update existing badge record
          existingUserBadge.isUnlocked = true;
          existingUserBadge.unlockedAt = new Date();
          existingUserBadge.unlockData = { unlockedAt: new Date() };
          await this.userBadgeRepository.save(existingUserBadge);
          unlockedBadges.push(existingUserBadge);
        } else {
          // Create new badge record
          const userBadge = this.userBadgeRepository.create({
            userId,
            badgeId: badge.id,
            isUnlocked: true,
            unlockedAt: new Date(),
            unlockData: { unlockedAt: new Date() },
          });
          await this.userBadgeRepository.save(userBadge);
          unlockedBadges.push(userBadge);
        }

        // Update badge unlock count
        badge.unlockCount += 1;
        await this.badgeRepository.save(badge);

        this.logger.log(`User ${userId} unlocked badge: ${badge.name}`);

        await this.auditLogService.recordVerification({
          event: "BADGE_UNLOCKED",
          userId,
          badgeId: badge.id,
          badgeName: badge.name,
          timestamp: new Date(),
        });
      }
    }

    return unlockedBadges;
  }

  /**
   * Evaluate badge unlock conditions
   */
  private async evaluateBadgeConditions(userId: string, badge: Badge): Promise<boolean> {
    const conditions = badge.unlockConditions;

    // Example condition evaluations (can be extended based on your needs)
    if (conditions.minReferrals) {
      // Check referral count from referral service
      // This would integrate with your referral system
    }

    if (conditions.minBadges) {
      const userBadgeCount = await this.userBadgeRepository.count({
        where: { userId, isUnlocked: true },
      });
      if (userBadgeCount < conditions.minBadges) {
        return false;
      }
    }

    if (conditions.minStreak) {
      const streak = await this.userStreakRepository.findOne({
        where: { userId, streakType: StreakType.DAILY_LOGIN },
      });
      if (!streak || streak.currentStreak < conditions.minStreak) {
        return false;
      }
    }

    if (conditions.requiredBadges) {
      // Check if user has specific required badges
      const requiredBadgeCount = await this.userBadgeRepository.count({
        where: {
          userId,
          badgeId: conditions.requiredBadges,
          isUnlocked: true,
        },
      });
      if (requiredBadgeCount < conditions.requiredBadges.length) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get user's badges
   */
  async getUserBadges(userId: string, unlockedOnly: boolean = false): Promise<UserBadge[]> {
    const query = this.userBadgeRepository
      .createQueryBuilder("userBadge")
      .leftJoinAndSelect("userBadge.badge", "badge")
      .where("userBadge.userId = :userId", { userId });

    if (unlockedOnly) {
      query.andWhere("userBadge.isUnlocked = true");
    }

    return query.orderBy("userBadge.createdAt", "DESC").getMany();
  }

  // ==================== STREAK TRACKING ====================

  /**
   * Update user streak
   */
  async updateStreak(dto: UpdateStreakDto, userId: string): Promise<UserStreak> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    let streak = await this.userStreakRepository.findOne({
      where: { userId, streakType: dto.streakType },
    });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (!streak) {
      // Create new streak
      streak = this.userStreakRepository.create({
        userId,
        streakType: dto.streakType,
        currentStreak: 1,
        longestStreak: 1,
        lastActionDate: now,
        streakStartDate: now,
        isActive: true,
      });
    } else {
      // Check if streak is broken
      if (streak.lastActionDate) {
        const lastAction = new Date(streak.lastActionDate);
        const lastActionDay = new Date(lastAction.getFullYear(), lastAction.getMonth(), lastAction.getDate());
        const daysDiff = Math.floor((today.getTime() - lastActionDay.getTime()) / (1000 * 60 * 60 * 24));

        if (daysDiff > 1) {
          // Streak broken
          streak.currentStreak = 1;
          streak.streakStartDate = now;
        } else if (daysDiff === 1) {
          // Continue streak
          streak.currentStreak += 1;
          if (streak.currentStreak > streak.longestStreak) {
            streak.longestStreak = streak.currentStreak;
          }
        }
        // If daysDiff === 0, already acted today, don't increment
      }

      streak.lastActionDate = now;
    }

    return await this.userStreakRepository.save(streak);
  }

  /**
   * Get user's streaks
   */
  async getUserStreaks(userId: string): Promise<UserStreak[]> {
    return this.userStreakRepository.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
  }

  // ==================== LEADERBOARDS ====================

  /**
   * Get leaderboard entries
   */
  async getLeaderboard(query: LeaderboardQueryDto): Promise<LeaderboardEntry[]> {
    const { category = LeaderboardCategory.POINTS, period = LeaderboardPeriod.ALL_TIME, limit = 100, offset = 0 } = query;

    const now = new Date();
    let periodStart: Date;

    switch (period) {
      case LeaderboardPeriod.DAILY:
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case LeaderboardPeriod.WEEKLY:
        const dayOfWeek = now.getDay();
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - dayOfWeek);
        periodStart.setHours(0, 0, 0, 0);
        break;
      case LeaderboardPeriod.MONTHLY:
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        periodStart = new Date(2000, 0, 1); // All time
    }

    return this.leaderboardRepository.find({
      where: {
        category,
        period,
        periodStart: MoreThanOrEqual(periodStart),
        isActive: true,
      },
      order: { rank: "ASC" },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Update leaderboard entry for a user
   */
  async updateLeaderboardEntry(
    userId: string,
    username: string,
    category: LeaderboardCategory,
    period: LeaderboardPeriod,
    score: number,
  ): Promise<LeaderboardEntry> {
    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date | null = null;

    switch (period) {
      case LeaderboardPeriod.DAILY:
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodStart.getDate() + 1);
        break;
      case LeaderboardPeriod.WEEKLY:
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - now.getDay());
        periodStart.setHours(0, 0, 0, 0);
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodStart.getDate() + 7);
        break;
      case LeaderboardPeriod.MONTHLY:
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      default:
        periodStart = new Date(2000, 0, 1);
    }

    let entry = await this.leaderboardRepository.findOne({
      where: { userId, category, period, periodStart },
    });

    if (!entry) {
      entry = this.leaderboardRepository.create({
        userId,
        username,
        category,
        period,
        score,
        periodStart,
        periodEnd,
        rank: 0, // Will be calculated
      });
    } else {
      entry.score = score;
    }

    // Calculate rank
    const higherScores = await this.leaderboardRepository.count({
      where: {
        category,
        period,
        periodStart,
        score: MoreThanOrEqual(score),
      },
    });

    entry.rank = higherScores + 1;

    return await this.leaderboardRepository.save(entry);
  }

  /**
   * Get user's rank in a leaderboard
   */
  async getUserRank(userId: string, category: LeaderboardCategory, period: LeaderboardPeriod): Promise<number> {
    const entry = await this.leaderboardRepository.findOne({
      where: { userId, category, period },
    });

    return entry?.rank || 0;
  }

  // ==================== PROGRESSIVE UNLOCKS ====================

  /**
   * Create a progressive unlock
   */
  async createProgressiveUnlock(userId: string, dto: CreateProgressiveUnlockDto): Promise<ProgressiveUnlock> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const unlock = this.progressiveUnlockRepository.create({
      userId,
      ...dto,
    });

    return await this.progressiveUnlockRepository.save(unlock);
  }

  /**
   * Update progress towards an unlock
   */
  async updateUnlockProgress(unlockId: string, dto: UpdateProgressDto): Promise<ProgressiveUnlock> {
    const unlock = await this.progressiveUnlockRepository.findOne({ where: { id: unlockId } });
    if (!unlock) {
      throw new NotFoundException(`Progressive unlock with ID ${unlockId} not found`);
    }

    if (dto.progressIncrement) {
      unlock.progress = Math.min(100, unlock.progress + dto.progressIncrement);
    }

    // Check if unlock conditions are met
    if (unlock.progress >= 100 && !unlock.isUnlocked) {
      unlock.isUnlocked = true;
      unlock.unlockedAt = new Date();

      this.logger.log(`User ${unlock.userId} unlocked: ${unlock.unlockName}`);

      await this.auditLogService.recordVerification({
        event: "PROGRESSIVE_UNLOCK_ACHIEVED",
        userId: unlock.userId,
        unlockId: unlock.id,
        unlockName: unlock.unlockName,
        timestamp: new Date(),
      });
    }

    return await this.progressiveUnlockRepository.save(unlock);
  }

  /**
   * Get user's progressive unlocks
   */
  async getUserUnlocks(userId: string, unlockedOnly: boolean = false): Promise<ProgressiveUnlock[]> {
    const query = this.progressiveUnlockRepository.createQueryBuilder("unlock")
      .where("unlock.userId = :userId", { userId });

    if (unlockedOnly) {
      query.andWhere("unlock.isUnlocked = true");
    }

    return query.orderBy("unlock.createdAt", "DESC").getMany();
  }

  // ==================== SOCIAL FEATURES ====================

  /**
   * Get user's public gamification profile
   */
  async getUserPublicProfile(userId: string): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const badges = await this.getUserBadges(userId, true);
    const streaks = await this.getUserStreaks(userId);

    const totalPoints = badges.reduce((sum, ub) => sum + (ub.badge.points || 0), 0);

    return {
      userId,
      username: user.username,
      totalPoints,
      badgeCount: badges.length,
      longestStreak: Math.max(...streaks.map(s => s.longestStreak), 0),
      badges: badges.map(ub => ({
        name: ub.badge.name,
        description: ub.badge.description,
        icon: ub.badge.icon,
        rarity: ub.badge.rarity,
        unlockedAt: ub.unlockedAt,
      })),
    };
  }
}
