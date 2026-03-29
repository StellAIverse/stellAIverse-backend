export interface NFT {
  id: string;
  owner: string;
  metadata: any;
  price?: number;
  isFractionalized: boolean;
}