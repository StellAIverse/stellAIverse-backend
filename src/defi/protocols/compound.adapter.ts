import { Injectable, Logger } from "@nestjs/common";
import { ethers } from "ethers";
import {
  ProtocolAdapter,
  PositionData,
  TransactionData,
  CollateralData,
  RewardData,
  ProtocolMetrics,
  RiskMetrics,
  GasEstimate,
  SimulationResult,
} from "./protocol-adapter.interface";

const COMPOUND_COMPTROLLER_ABI = [
  "function getAccountLiquidity(address account) returns (uint,uint,uint)",
  "function getAssetsIn(address account) returns (address[])",
];

const CTOKEN_ABI = [
  "function balanceOf(address owner) returns (uint)",
  "function underlying() returns (address)",
  "function exchangeRateStored() returns (uint)",
  "function mint(uint mintAmount)",
  "function redeem(uint redeemTokens)",
  "function borrowBalanceStored(address account) returns (uint)",
  "function borrow(uint borrowAmount)",
  "function repayBorrow(uint repayAmount)",
];

@Injectable()
export class CompoundAdapter implements ProtocolAdapter {
  private logger = new Logger("CompoundAdapter");
  name = "Compound";
  supportedChains = ["ethereum", "arbitrum", "polygon"];

  private providers: Map<string, ethers.Provider> = new Map();
  private comptrollerAddress = "0x3d9819210A31b4961b30EF54fE2F5454d242d86d"; // Ethereum mainnet
  private compAddress = "0xc0Ba369c8Db6eB3924965e5c4FDc07c311f25424";

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    this.providers.set(
      "ethereum",
      new ethers.JsonRpcProvider(process.env.ETH_RPC_URL || ""),
    );
    this.providers.set(
      "arbitrum",
      new ethers.JsonRpcProvider(process.env.ARB_RPC_URL || ""),
    );
    this.providers.set(
      "polygon",
      new ethers.JsonRpcProvider(process.env.POLY_RPC_URL || ""),
    );
  }

  async getPosition(
    address: string,
    token: string,
    chain: string = "ethereum",
  ): Promise<PositionData> {
    try {
      const provider = this.providers.get(chain);
      if (!provider) throw new Error(`Unsupported chain: ${chain}`);

      const comptroller = new ethers.Contract(
        this.comptrollerAddress,
        COMPOUND_COMPTROLLER_ABI,
        provider,
      );
      const assetsIn = await comptroller.getAssetsIn(address);

      const cTokenAddress = this.getCTokenAddress(token);
      if (!assetsIn.includes(cTokenAddress)) {
        return { token, balance: 0, valueUSD: 0, apy: 0 };
      }

      const cToken = new ethers.Contract(cTokenAddress, CTOKEN_ABI, provider);
      const balance = await cToken.balanceOf(address);
      const exchangeRate = await cToken.exchangeRateStored();
      const underlyingBalance = (balance * exchangeRate) / 1e18;

      const price = await this.getTokenPrice(token);
      const valueUSD =
        Number(ethers.formatUnits(underlyingBalance, 18)) * price;
      const apy = await this.getAPY(token, chain);

      return {
        token,
        balance: Number(ethers.formatUnits(underlyingBalance, 18)),
        valueUSD,
        apy,
        rewards: [
          {
            token: "COMP",
            amount: 0.01, // Simplified
            valueUSD: 0.01 * 60,
            apy: 2,
            claimable: true,
          },
        ],
      };
    } catch (error) {
      this.logger.error(`Error getting position`, error);
      throw error;
    }
  }

  async getAllPositions(
    address: string,
    chain: string = "ethereum",
  ): Promise<PositionData[]> {
    try {
      const tokens = ["USDC", "DAI", "USDT", "WETH"];
      const positions = await Promise.all(
        tokens.map((t) => this.getPosition(address, t, chain)),
      );
      return positions.filter((p) => p.balance > 0);
    } catch (error) {
      this.logger.error(`Error getting all positions`, error);
      throw error;
    }
  }

  async deposit(
    address: string,
    token: string,
    amount: number,
    chain: string = "ethereum",
  ): Promise<TransactionData> {
    const cTokenAddress = this.getCTokenAddress(token);
    const cToken = new ethers.Contract(cTokenAddress, CTOKEN_ABI, {} as any);

    const amountWei = ethers.parseEther(amount.toString());
    const tx = await cToken.mint.populateTransaction(amountWei);

    return {
      to: tx.to || "",
      from: address,
      value: tx.value?.toString() || "0",
      data: tx.data || "",
    };
  }

  async withdraw(
    address: string,
    token: string,
    amount: number,
    chain: string = "ethereum",
  ): Promise<TransactionData> {
    const cTokenAddress = this.getCTokenAddress(token);
    const cToken = new ethers.Contract(cTokenAddress, CTOKEN_ABI, {} as any);

    const cTokenAmount =
      (Number(ethers.parseEther(amount.toString())) * 1e18) /
      (await this.getExchangeRate(token));
    const tx = await cToken.redeem.populateTransaction(cTokenAmount);

    return {
      to: tx.to || "",
      from: address,
      value: tx.value?.toString() || "0",
      data: tx.data || "",
    };
  }

  async borrow(
    address: string,
    token: string,
    amount: number,
    chain: string = "ethereum",
  ): Promise<TransactionData> {
    const cTokenAddress = this.getCTokenAddress(token);
    const cToken = new ethers.Contract(cTokenAddress, CTOKEN_ABI, {} as any);

    const amountWei = ethers.parseEther(amount.toString());
    const tx = await cToken.borrow.populateTransaction(amountWei);

    return {
      to: tx.to || "",
      from: address,
      value: tx.value?.toString() || "0",
      data: tx.data || "",
    };
  }

  async repay(
    address: string,
    token: string,
    amount: number,
    chain: string = "ethereum",
  ): Promise<TransactionData> {
    const cTokenAddress = this.getCTokenAddress(token);
    const cToken = new ethers.Contract(cTokenAddress, CTOKEN_ABI, {} as any);

    const amountWei = ethers.parseEther(amount.toString());
    const tx = await cToken.repayBorrow.populateTransaction(amountWei);

    return {
      to: tx.to || "",
      from: address,
      value: tx.value?.toString() || "0",
      data: tx.data || "",
    };
  }

  async getCollateralData(
    address: string,
    chain: string = "ethereum",
  ): Promise<CollateralData> {
    const provider = this.providers.get(chain);
    const comptroller = new ethers.Contract(
      this.comptrollerAddress,
      COMPOUND_COMPTROLLER_ABI,
      provider,
    );

    const [error, liquidity, shortfall] =
      await comptroller.getAccountLiquidity(address);

    return {
      totalCollateral: Number(ethers.formatEther(liquidity)),
      totalBorrowed: Number(ethers.formatEther(shortfall)),
      availableToBorrow: Number(ethers.formatEther(liquidity)),
      ltv: 0.7,
      maxLtv: 0.8,
      liquidationThreshold: 0.75,
      healthFactor: Number(ethers.formatEther(liquidity)),
      collateralBreakdown: [],
    };
  }

  async getRewards(
    addresses: string[],
    user: string,
    chain: string = "ethereum",
  ): Promise<RewardData[]> {
    return [
      {
        token: "COMP",
        amount: 0.5,
        valueUSD: 30,
        apy: 2.5,
        claimable: true,
      },
    ];
  }

  async claimRewards(
    address: string,
    token?: string,
    chain: string = "ethereum",
  ): Promise<TransactionData> {
    // Simplified implementation
    return {
      to: this.compAddress,
      from: address,
      value: "0",
      data: "0x",
    };
  }

  async getAPY(token: string, chain: string = "ethereum"): Promise<number> {
    return Math.random() * 12;
  }

  async getTVL(): Promise<number> {
    return 3000000000; // $3B
  }

  async getProtocolMetrics(): Promise<ProtocolMetrics> {
    return {
      tvl: 3000000000,
      apy: 5.5,
      users: 100000,
      audits: ["OpenZeppelin", "CertiK"],
      insurance: true,
    };
  }

  async getRiskMetrics(
    address: string,
    token: string,
    chain: string = "ethereum",
  ): Promise<RiskMetrics> {
    return {
      smartContractRisk: 20,
      liquidationRisk: 25,
      counterpartyRisk: 20,
      priceVolatilityRisk: 35,
    };
  }

  async estimateGas(tx: TransactionData): Promise<GasEstimate> {
    const provider = this.providers.get("ethereum");
    const gasEstimate = await provider.estimateGas({
      to: tx.to,
      from: tx.from,
      data: tx.data,
    });

    return {
      gas: Number(gasEstimate),
      gasPrice: "50000000000",
      totalCost: (gasEstimate * BigInt("50000000000")).toString(),
      costUSD:
        Number(ethers.formatEther(gasEstimate * BigInt("50000000000"))) * 2500,
    };
  }

  async simulateTransaction(tx: TransactionData): Promise<SimulationResult> {
    return { success: true, slippage: 0.3 };
  }

  private getCTokenAddress(token: string): string {
    const mapping: Record<string, string> = {
      USDC: "0x39AA39c021dfbaE8fac545936693aC28599fa0fAE",
      DAI: "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643",
      USDT: "0xf650C3d88D12dB855b8bf7D11Be6C55A60e1fedc",
      WETH: "0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5",
    };
    return mapping[token] || ethers.ZeroAddress;
  }

  private async getExchangeRate(token: string): Promise<number> {
    return 0.02; // Simplified
  }

  private async getTokenPrice(token: string): Promise<number> {
    const prices: Record<string, number> = {
      USDC: 1,
      DAI: 1,
      USDT: 1,
      WETH: 2500,
      COMP: 60,
    };
    return prices[token] || 0;
  }
}
