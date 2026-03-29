import { Fraction } from "../models/Fraction";

export class FractionService {
  private fractions: Map<string, Fraction> = new Map();

  fractionalize(nftId: string, totalShares: number) {
    const fraction: Fraction = {
      nftId,
      totalShares,
      sharesAvailable: totalShares,
      owners: {},
    };
    this.fractions.set(nftId, fraction);
    return fraction;
  }

  buyShares(nftId: string, user: string, shares: number) {
    const f = this.fractions.get(nftId);
    if (!f || f.sharesAvailable < shares) throw new Error("Not enough shares");

    f.sharesAvailable -= shares;
    f.owners[user] = (f.owners[user] || 0) + shares;

    return f;
  }
}