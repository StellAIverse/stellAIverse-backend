import { Injectable } from "@nestjs/common";

@Injectable()
export class PriorityScoringService {
  /**
   * Compute a priority score for a waitlist user.
   *
   * Weights:
   *   40% wallet activity
   *   30% referrals
   *   30% social score
   *
   * Result is clamped to [0, 100].
   */
  computeScore(
    _userId: string,
    referrals: number,
    walletActivity: number,
    socialScore: number
  ): number {
    const raw =
      0.4 * walletActivity + 0.3 * referrals + 0.3 * socialScore;
    return Math.min(100, Math.max(0, raw));
  }
}
