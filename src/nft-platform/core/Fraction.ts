export interface Fraction {
  nftId: string;
  totalShares: number;
  sharesAvailable: number;
  owners: Record<string, number>; // address -> shares
}
