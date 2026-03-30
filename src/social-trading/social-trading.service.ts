import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  CreateTraderProfileDto,
  FollowTraderDto,
  TraderProfileDto,
  TraderTier,
  CopyTradeDto,
  SocialInteractionDto,
  LeaderboardQueryDto,
} from "./dto/social-trading.dto";

interface TraderProfile extends TraderProfileDto {
  followers: Set<string>;
  copiers: Set<string>;
}

interface SocialInteraction {
  id: string;
  userId: string;
  type: "like" | "comment" | "share";
  targetId: string;
  targetType: "trade" | "strategy" | "profile";
  content?: string;
  createdAt: Date;
}

@Injectable()
export class SocialTradingService {
  private readonly logger = new Logger(SocialTradingService.name);

  private readonly profiles = new Map<string, TraderProfile>();
  private readonly copyRelationships = new Map<string, FollowTraderDto>();
  private readonly copyTrades: CopyTradeDto[] = [];
  private readonly interactions: SocialInteraction[] = [];

  createProfile(dto: CreateTraderProfileDto): TraderProfileDto {
    if (this.profiles.has(dto.userId)) {
      throw new BadRequestException(
        `Profile already exists for user ${dto.userId}`,
      );
    }

    const profile: TraderProfile = {
      userId: dto.userId,
      displayName: dto.displayName,
      bio: dto.bio,
      tier: TraderTier.BRONZE,
      totalFollowers: 0,
      totalCopiers: 0,
      winRate: 0,
      totalReturn: 0,
      monthlyReturn: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      totalTrades: 0,
      revenueSharePercentage: 0.1,
      isVerified: false,
      joinedAt: new Date(),
      followers: new Set(),
      copiers: new Set(),
    };

    this.profiles.set(dto.userId, profile);
    this.logger.log(`Trader profile created for ${dto.userId}`);
    return this.toDto(profile);
  }

  getProfile(userId: string): TraderProfileDto {
    const profile = this.profiles.get(userId);
    if (!profile)
      throw new NotFoundException(`Trader profile not found for ${userId}`);
    return this.toDto(profile);
  }

  followTrader(dto: FollowTraderDto): { success: boolean; message: string } {
    const trader = this.profiles.get(dto.traderId);
    if (!trader)
      throw new NotFoundException(`Trader ${dto.traderId} not found`);
    if (dto.followerId === dto.traderId)
      throw new BadRequestException("Cannot follow yourself");

    trader.followers.add(dto.followerId);
    trader.totalFollowers = trader.followers.size;

    if (dto.autoCopy) {
      trader.copiers.add(dto.followerId);
      trader.totalCopiers = trader.copiers.size;
      const key = `${dto.followerId}:${dto.traderId}`;
      this.copyRelationships.set(key, dto);
    }

    this.updateTier(trader);
    this.logger.log(
      `${dto.followerId} followed ${dto.traderId} (autoCopy: ${dto.autoCopy})`,
    );

    return {
      success: true,
      message: `Successfully followed trader ${dto.traderId}`,
    };
  }

  unfollowTrader(followerId: string, traderId: string): { success: boolean } {
    const trader = this.profiles.get(traderId);
    if (!trader) throw new NotFoundException(`Trader ${traderId} not found`);

    trader.followers.delete(followerId);
    trader.copiers.delete(followerId);
    trader.totalFollowers = trader.followers.size;
    trader.totalCopiers = trader.copiers.size;

    const key = `${followerId}:${traderId}`;
    this.copyRelationships.delete(key);

    return { success: true };
  }

  executeCopyTrade(
    traderId: string,
    tradeId: string,
    asset: string,
    side: "buy" | "sell",
    amount: number,
    price: number,
  ): CopyTradeDto[] {
    const trader = this.profiles.get(traderId);
    if (!trader) return [];

    const copiedTrades: CopyTradeDto[] = [];

    for (const copierId of trader.copiers) {
      const key = `${copierId}:${traderId}`;
      const config = this.copyRelationships.get(key);
      if (!config) continue;

      const riskMultiplier = config.riskMultiplier ?? 1;
      const copiedAmount = Math.min(
        amount * riskMultiplier,
        config.maxCopyAmount ?? Infinity,
      );

      const copyTrade: CopyTradeDto = {
        followerId: copierId,
        traderId,
        originalTradeId: tradeId,
        asset,
        side,
        originalAmount: amount,
        copiedAmount,
        price,
        status: "executed",
        executedAt: new Date(),
      };

      this.copyTrades.push(copyTrade);
      copiedTrades.push(copyTrade);
    }

    this.logger.log(
      `Copied trade ${tradeId} to ${copiedTrades.length} followers`,
    );
    return copiedTrades;
  }

  addInteraction(dto: SocialInteractionDto): SocialInteraction {
    const interaction: SocialInteraction = {
      id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ...dto,
      createdAt: new Date(),
    };
    this.interactions.push(interaction);
    return interaction;
  }

  getLeaderboard(query: LeaderboardQueryDto): TraderProfileDto[] {
    const sortBy = query.sortBy ?? "totalReturn";
    const limit = query.limit ?? 50;

    let profiles = Array.from(this.profiles.values());

    if (query.tier) {
      profiles = profiles.filter((p) => p.tier === query.tier);
    }

    profiles.sort((a, b) => (b[sortBy] as number) - (a[sortBy] as number));

    return profiles.slice(0, limit).map(this.toDto);
  }

  getCopyTrades(userId: string): CopyTradeDto[] {
    return this.copyTrades.filter(
      (t) => t.followerId === userId || t.traderId === userId,
    );
  }

  updateTraderStats(
    userId: string,
    stats: Partial<
      Pick<
        TraderProfileDto,
        | "winRate"
        | "totalReturn"
        | "monthlyReturn"
        | "sharpeRatio"
        | "maxDrawdown"
        | "totalTrades"
      >
    >,
  ): TraderProfileDto {
    const profile = this.profiles.get(userId);
    if (!profile) throw new NotFoundException(`Trader ${userId} not found`);

    Object.assign(profile, stats);
    this.updateTier(profile);
    return this.toDto(profile);
  }

  private updateTier(profile: TraderProfile): void {
    if (profile.totalFollowers >= 1000 && profile.winRate >= 0.65) {
      profile.tier = TraderTier.PLATINUM;
      profile.revenueSharePercentage = 0.25;
    } else if (profile.totalFollowers >= 500 && profile.winRate >= 0.6) {
      profile.tier = TraderTier.GOLD;
      profile.revenueSharePercentage = 0.2;
    } else if (profile.totalFollowers >= 100 && profile.winRate >= 0.55) {
      profile.tier = TraderTier.SILVER;
      profile.revenueSharePercentage = 0.15;
    }
  }

  private toDto(profile: TraderProfile): TraderProfileDto {
    const { followers, copiers, ...dto } = profile;
    return dto;
  }
}
