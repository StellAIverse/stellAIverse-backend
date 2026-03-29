import { IsString, IsNumber, IsOptional, IsBoolean, IsEnum, Min, Max } from 'class-validator';

export enum TraderTier {
  BRONZE = 'bronze',
  SILVER = 'silver',
  GOLD = 'gold',
  PLATINUM = 'platinum',
}

export class CreateTraderProfileDto {
  @IsString()
  userId: string;

  @IsString()
  displayName: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  copyRiskMultiplier?: number;
}

export class FollowTraderDto {
  @IsString()
  followerId: string;

  @IsString()
  traderId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  riskMultiplier?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxCopyAmount?: number;

  @IsBoolean()
  autoCopy: boolean;
}

export class TraderProfileDto {
  userId: string;
  displayName: string;
  bio?: string;
  tier: TraderTier;
  totalFollowers: number;
  totalCopiers: number;
  winRate: number;
  totalReturn: number;
  monthlyReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalTrades: number;
  revenueSharePercentage: number;
  isVerified: boolean;
  joinedAt: Date;
}

export class LeaderboardQueryDto {
  @IsOptional()
  @IsEnum(['winRate', 'totalReturn', 'monthlyReturn', 'followers'])
  sortBy?: 'winRate' | 'totalReturn' | 'monthlyReturn' | 'followers';

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsEnum(TraderTier)
  tier?: TraderTier;
}

export class CopyTradeDto {
  followerId: string;
  traderId: string;
  originalTradeId: string;
  asset: string;
  side: 'buy' | 'sell';
  originalAmount: number;
  copiedAmount: number;
  price: number;
  status: 'pending' | 'executed' | 'failed' | 'skipped';
  skipReason?: string;
  executedAt?: Date;
}

export class SocialInteractionDto {
  @IsString()
  userId: string;

  @IsEnum(['like', 'comment', 'share'])
  type: 'like' | 'comment' | 'share';

  @IsString()
  targetId: string;

  @IsEnum(['trade', 'strategy', 'profile'])
  targetType: 'trade' | 'strategy' | 'profile';

  @IsOptional()
  @IsString()
  content?: string;
}
