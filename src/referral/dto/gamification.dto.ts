import { IsString, IsEnum, IsNumber, IsBoolean, IsOptional, IsObject } from "class-validator";
import { BadgeCategory, BadgeRarity } from "../gamification/badge.entity";
import { StreakType } from "../gamification/streak.entity";
import { LeaderboardCategory, LeaderboardPeriod } from "../gamification/leaderboard.entity";
import { UnlockType } from "../gamification/progressive-unlock.entity";

export class CreateBadgeDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsEnum(BadgeCategory)
  @IsOptional()
  category?: BadgeCategory;

  @IsEnum(BadgeRarity)
  @IsOptional()
  rarity?: BadgeRarity;

  @IsObject()
  unlockConditions: Record<string, any>;

  @IsNumber()
  @IsOptional()
  points?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateBadgeDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsEnum(BadgeCategory)
  @IsOptional()
  category?: BadgeCategory;

  @IsEnum(BadgeRarity)
  @IsOptional()
  rarity?: BadgeRarity;

  @IsObject()
  @IsOptional()
  unlockConditions?: Record<string, any>;

  @IsNumber()
  @IsOptional()
  points?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateStreakDto {
  @IsEnum(StreakType)
  streakType: StreakType;

  @IsNumber()
  @IsOptional()
  actionValue?: number; // Value to add to streak
}

export class LeaderboardQueryDto {
  @IsEnum(LeaderboardCategory)
  @IsOptional()
  category?: LeaderboardCategory;

  @IsEnum(LeaderboardPeriod)
  @IsOptional()
  period?: LeaderboardPeriod;

  @IsNumber()
  @IsOptional()
  limit?: number;

  @IsNumber()
  @IsOptional()
  offset?: number;
}

export class CreateProgressiveUnlockDto {
  @IsString()
  unlockKey: string;

  @IsString()
  unlockName: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(UnlockType)
  unlockType: UnlockType;

  @IsObject()
  unlockConditions: Record<string, any>;

  @IsOptional()
  unlockRewards?: Record<string, any>;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateProgressDto {
  @IsNumber()
  @IsOptional()
  progressIncrement?: number;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
