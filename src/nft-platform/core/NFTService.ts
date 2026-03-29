import { NFT } from "../models/NFT";

export class NFTService {
  private nfts: Map<string, NFT> = new Map();

  createNFT(nft: NFT) {
    this.nfts.set(nft.id, nft);
    return nft;
  }

  getNFT(id: string) {
    return this.nfts.get(id);
  }

  listNFTs() {
    return Array.from(this.nfts.values());
  }
}