import { Injectable, Logger, BadRequestException, NotFoundException, OnModuleInit } from '@nestjs/common';

export interface StakingPosition {
  id: string;
  userId: string;
  amount: number;
  durationDays: number;
  apy: number;
  startDate: Date;
  endDate: Date;
  accruedRewards: number;
  compounding: boolean;
  status: 'active' | 'unstaked' | 'claimed';
}

const DURATION_TIERS: Record<number, number> = {
  30: 0.05,
  60: 0.12,
  90: 0.20,
  365: 0.50,
};

const EARLY_UNSTAKE_PENALTY = 0.10;

@Injectable()
export class StakingService implements OnModuleInit {
  private readonly logger = new Logger(StakingService.name);
  private readonly positions = new Map<string, StakingPosition>();
  private positionCounter = 0;

  onModuleInit(): void {
    // Run daily reward distribution every 24 hours
    setInterval(() => this.distributeRewards(), 86400000);
  }

  stake(userId: string, amount: number, durationDays: number, compounding = false): StakingPosition {
    const apy = DURATION_TIERS[durationDays];
    if (!apy) {
      throw new BadRequestException(`Invalid duration. Allowed: ${Object.keys(DURATION_TIERS).join(', ')} days`);
    }
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    const id = `stake_${++this.positionCounter}_${Date.now()}`;
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + durationDays * 86400000);

    const position: StakingPosition = {
      id, userId, amount, durationDays, apy, startDate, endDate,
      accruedRewards: 0, compounding, status: 'active',
    };

    this.positions.set(id, position);
    this.logger.log(`User ${userId} staked ${amount} for ${durationDays} days at ${apy * 100}% APY`);
    return position;
  }

  unstake(userId: string, positionId: string): { returned: number; penalty: number; rewards: number } {
    const position = this.getPositionForUser(userId, positionId);
    if (position.status !== 'active') throw new BadRequestException('Position is not active');

    const now = new Date();
    const isEarly = now < position.endDate;
    const rewards = this.calculateRewards(position);
    const penalty = isEarly ? position.amount * EARLY_UNSTAKE_PENALTY : 0;
    const returned = position.amount - penalty + rewards;

    position.status = 'unstaked';
    position.accruedRewards = rewards;
    this.positions.set(positionId, position);

    this.logger.log(`User ${userId} unstaked position ${positionId}. Early: ${isEarly}, Penalty: ${penalty}`);
    return { returned, penalty, rewards };
  }

  claimRewards(userId: string, positionId: string): { claimed: number } {
    const position = this.getPositionForUser(userId, positionId);
    if (position.status !== 'active') throw new BadRequestException('Position is not active');

    const rewards = this.calculateRewards(position);
    position.accruedRewards = 0;
    position.startDate = new Date(); // reset accrual period after claim

    if (position.compounding) {
      position.amount += rewards;
    }

    this.positions.set(positionId, position);
    this.logger.log(`User ${userId} claimed ${rewards} rewards from position ${positionId}`);
    return { claimed: rewards };
  }

  getPositions(userId: string): StakingPosition[] {
    return Array.from(this.positions.values()).filter(p => p.userId === userId);
  }

  getStats(): {
    totalStaked: number;
    totalPositions: number;
    activePositions: number;
    totalRewardsDistributed: number;
    tierBreakdown: Record<string, number>;
  } {
    const all = Array.from(this.positions.values());
    const active = all.filter(p => p.status === 'active');
    const tierBreakdown: Record<string, number> = {};

    for (const days of Object.keys(DURATION_TIERS)) {
      tierBreakdown[`${days}d`] = active.filter(p => p.durationDays === +days).reduce((s, p) => s + p.amount, 0);
    }

    return {
      totalStaked: active.reduce((s, p) => s + p.amount, 0),
      totalPositions: all.length,
      activePositions: active.length,
      totalRewardsDistributed: all.reduce((s, p) => s + p.accruedRewards, 0),
      tierBreakdown,
    };
  }

  distributeRewards(): void {
    const active = Array.from(this.positions.values()).filter(p => p.status === 'active');
    for (const position of active) {
      const dailyReward = (position.amount * position.apy) / 365;
      if (position.compounding) {
        position.amount += dailyReward;
      } else {
        position.accruedRewards += dailyReward;
      }
      this.positions.set(position.id, position);
    }
    this.logger.log(`Daily rewards distributed to ${active.length} positions`);
  }

  private calculateRewards(position: StakingPosition): number {
    const now = new Date();
    const elapsed = (now.getTime() - position.startDate.getTime()) / (365 * 86400000);
    return position.amount * position.apy * elapsed + position.accruedRewards;
  }

  private getPositionForUser(userId: string, positionId: string): StakingPosition {
    const position = this.positions.get(positionId);
    if (!position) throw new NotFoundException('Position not found');
    if (position.userId !== userId) throw new BadRequestException('Position does not belong to user');
    return position;
  }
}
