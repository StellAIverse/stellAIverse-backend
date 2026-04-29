import { Injectable, BadRequestException, Logger } from '@nestjs/common';

interface AffiliateAccount {
  userId: string;
  referralCode: string;
  referredBy?: string;
  directReferrals: string[];
  indirectReferrals: string[];
  pendingEarnings: number;
  totalEarnings: number;
  withdrawnEarnings: number;
  withdrawalHistory: Array<{ amount: number; date: Date }>;
  registeredAt: Date;
}

// Tiered commission rates based on referee trading volume
const DIRECT_COMMISSION = 0.05;   // 5% of fees from direct referrals
const INDIRECT_COMMISSION = 0.02; // 2% of fees from indirect referrals

@Injectable()
export class AffiliateService {
  private readonly logger = new Logger(AffiliateService.name);
  private readonly accounts = new Map<string, AffiliateAccount>();
  private readonly codeToUser = new Map<string, string>();

  register(userId: string, referralCode?: string): { referralCode: string; referredBy?: string } {
    if (this.accounts.has(userId)) {
      return { referralCode: this.accounts.get(userId)!.referralCode };
    }

    // Fraud check: prevent self-referral
    if (referralCode) {
      const referrerId = this.codeToUser.get(referralCode);
      if (referrerId === userId) throw new BadRequestException('Self-referral is not allowed');
    }

    const code = this.generateCode(userId);
    const account: AffiliateAccount = {
      userId,
      referralCode: code,
      referredBy: referralCode ? this.codeToUser.get(referralCode) : undefined,
      directReferrals: [],
      indirectReferrals: [],
      pendingEarnings: 0,
      totalEarnings: 0,
      withdrawnEarnings: 0,
      withdrawalHistory: [],
      registeredAt: new Date(),
    };

    this.accounts.set(userId, account);
    this.codeToUser.set(code, userId);

    // Register as referral for the referrer (level 1)
    if (referralCode) {
      const referrerId = this.codeToUser.get(referralCode);
      if (referrerId) {
        const referrer = this.accounts.get(referrerId);
        if (referrer) {
          referrer.directReferrals.push(userId);
          // Level 2: register as indirect for referrer's referrer
          if (referrer.referredBy) {
            const grandReferrer = this.accounts.get(referrer.referredBy);
            if (grandReferrer) grandReferrer.indirectReferrals.push(userId);
          }
        }
      }
    }

    this.logger.log(`User ${userId} registered affiliate account with code ${code}`);
    return { referralCode: code, referredBy: account.referredBy };
  }

  getStats(userId: string): {
    referralCode: string;
    directReferrals: number;
    indirectReferrals: number;
    totalEarnings: number;
    pendingEarnings: number;
    withdrawnEarnings: number;
  } {
    const account = this.getOrCreate(userId);
    return {
      referralCode: account.referralCode,
      directReferrals: account.directReferrals.length,
      indirectReferrals: account.indirectReferrals.length,
      totalEarnings: account.totalEarnings,
      pendingEarnings: account.pendingEarnings,
      withdrawnEarnings: account.withdrawnEarnings,
    };
  }

  getEarnings(userId: string): {
    pending: number;
    total: number;
    withdrawn: number;
    history: Array<{ amount: number; date: Date }>;
    commissionRates: { direct: number; indirect: number };
  } {
    const account = this.getOrCreate(userId);
    return {
      pending: account.pendingEarnings,
      total: account.totalEarnings,
      withdrawn: account.withdrawnEarnings,
      history: account.withdrawalHistory,
      commissionRates: { direct: DIRECT_COMMISSION, indirect: INDIRECT_COMMISSION },
    };
  }

  withdraw(userId: string, amount: number): { success: boolean; withdrawn: number; remaining: number } {
    const account = this.getOrCreate(userId);
    if (amount <= 0) throw new BadRequestException('Amount must be positive');
    if (amount > account.pendingEarnings) {
      throw new BadRequestException(`Insufficient earnings. Available: ${account.pendingEarnings}`);
    }

    account.pendingEarnings -= amount;
    account.withdrawnEarnings += amount;
    account.withdrawalHistory.push({ amount, date: new Date() });
    this.accounts.set(userId, account);

    this.logger.log(`User ${userId} withdrew ${amount} in referral earnings`);
    return { success: true, withdrawn: amount, remaining: account.pendingEarnings };
  }

  /** Called when a referred user generates trading fees */
  recordCommission(referredUserId: string, feeAmount: number): void {
    const account = this.accounts.get(referredUserId);
    if (!account?.referredBy) return;

    const referrer = this.accounts.get(account.referredBy);
    if (referrer) {
      const commission = feeAmount * DIRECT_COMMISSION;
      referrer.pendingEarnings += commission;
      referrer.totalEarnings += commission;

      // Level 2 commission
      if (referrer.referredBy) {
        const grandReferrer = this.accounts.get(referrer.referredBy);
        if (grandReferrer) {
          const indirectCommission = feeAmount * INDIRECT_COMMISSION;
          grandReferrer.pendingEarnings += indirectCommission;
          grandReferrer.totalEarnings += indirectCommission;
        }
      }
    }
  }

  private getOrCreate(userId: string): AffiliateAccount {
    if (!this.accounts.has(userId)) {
      this.register(userId);
    }
    return this.accounts.get(userId)!;
  }

  private generateCode(userId: string): string {
    return `REF_${userId.slice(0, 6).toUpperCase()}_${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  }
}
