import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
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
} from './protocol-adapter.interface';

// Aave contract ABIs (simplified)
const AAVE_LENDING_POOL_ABI = [
  'function deposit(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)',
  'function withdraw(address asset,uint256 amount,address to)',
  'function borrow(address asset,uint256 amount,uint256 interestRateMode,uint16 referralCode,address onBehalfOf)',
  'function repay(address asset,uint256 amount,uint256 rateMode,address onBehalfOf)',
  'function getUserAccountData(address user) returns (tuple)',
  'function getReservesList() returns (address[])',
];

const AAVE_REWARDS_CONTROLLER_ABI = [
  'function getRewardsBalance(address[] calldata assets,address user) returns (uint256)',
  'function claimRewards(address[] calldata assets,uint256 amount,address to) returns (uint256)',
];

@Injectable()
export class AaveAdapter implements ProtocolAdapter {
  private logger = new Logger('AaveAdapter');
  name = 'Aave';
  supportedChains = ['ethereum', 'arbitrum', 'polygon', 'optimism'];

  private providers: Map<string, ethers.Provider> = new Map();
  private lendingPoolAddress = '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9'; // Ethereum mainnet
  private rewardsControllerAddress = '0xd784927Ff2f95ba7a3F00302f7F038858F1b3c6e';

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    this.providers.set('ethereum', new ethers.JsonRpcProvider(process.env.ETH_RPC_URL || ''));
    this.providers.set('arbitrum', new ethers.JsonRpcProvider(process.env.ARB_RPC_URL || ''));
    this.providers.set('polygon', new ethers.JsonRpcProvider(process.env.POLY_RPC_URL || ''));
    this.providers.set('optimism', new ethers.JsonRpcProvider(process.env.OPT_RPC_URL || ''));
  }

  async getPosition(address: string, token: string, chain: string = 'ethereum'): Promise<PositionData> {
    try {
      const provider = this.providers.get(chain);
      if (!provider) throw new Error(`Unsupported chain: ${chain}`);

      const lendingPool = new ethers.Contract(this.lendingPoolAddress, AAVE_LENDING_POOL_ABI, provider);

      // Get user's aToken balance (aETH, aUSDC, etc)
      const aTokenAddress = await this.getATokenAddress(token, chain);
      const erc20 = new ethers.Contract(
        aTokenAddress,
        ['function balanceOf(address) returns (uint256)', 'function decimals() returns (uint8)'],
        provider
      );

      const balance = await erc20.balanceOf(address);
      const decimals = await erc20.decimals();
      const balanceFormatted = Number(ethers.formatUnits(balance, decimals));

      // Get token price
      const priceUSD = await this.getTokenPrice(token);
      const valueUSD = balanceFormatted * priceUSD;

      // Get APY
      const apy = await this.getAPY(token, chain);

      // Get rewards
      const rewards = await this.getRewards([aTokenAddress], address, chain);

      return {
        token,
        balance: balanceFormatted,
        valueUSD,
        apy,
        rewards,
      };
    } catch (error) {
      this.logger.error(`Error getting position for ${address} on ${token}`, error);
      throw error;
    }
  }

  async getAllPositions(address: string, chain: string = 'ethereum'): Promise<PositionData[]> {
    try {
      const provider = this.providers.get(chain);
      if (!provider) throw new Error(`Unsupported chain: ${chain}`);

      const lendingPool = new ethers.Contract(this.lendingPoolAddress, AAVE_LENDING_POOL_ABI, provider);
      const reservesList = await lendingPool.getReservesList();

      const positions = await Promise.all(
        reservesList.map((token) => this.getPosition(address, token, chain))
      );

      return positions.filter((p) => p.balance > 0);
    } catch (error) {
      this.logger.error(`Error getting all positions for ${address}`, error);
      throw error;
    }
  }

  async deposit(address: string, token: string, amount: number, chain: string = 'ethereum'): Promise<TransactionData> {
    try {
      const provider = this.providers.get(chain);
      const signer = provider.getSigner(address);
      const lendingPool = new ethers.Contract(this.lendingPoolAddress, AAVE_LENDING_POOL_ABI, signer);

      const tokenAddress = token === 'ETH' ? ethers.ZeroAddress : token;
      const amountWei = ethers.parseEther(amount.toString());

      const tx = await lendingPool.deposit.populateTransaction(tokenAddress, amountWei, address, 0);

      return {
        to: tx.to || '',
        from: address,
        value: tx.value?.toString() || '0',
        data: tx.data || '',
      };
    } catch (error) {
      this.logger.error(`Error creating deposit transaction`, error);
      throw error;
    }
  }

  async withdraw(address: string, token: string, amount: number, chain: string = 'ethereum'): Promise<TransactionData> {
    try {
      const provider = this.providers.get(chain);
      const signer = provider.getSigner(address);
      const lendingPool = new ethers.Contract(this.lendingPoolAddress, AAVE_LENDING_POOL_ABI, signer);

      const tokenAddress = token === 'ETH' ? ethers.ZeroAddress : token;
      const amountWei = amount === Infinity ? ethers.MaxUint256 : ethers.parseEther(amount.toString());

      const tx = await lendingPool.withdraw.populateTransaction(tokenAddress, amountWei, address);

      return {
        to: tx.to || '',
        from: address,
        value: tx.value?.toString() || '0',
        data: tx.data || '',
      };
    } catch (error) {
      this.logger.error(`Error creating withdraw transaction`, error);
      throw error;
    }
  }

  async borrow(address: string, token: string, amount: number, chain: string = 'ethereum'): Promise<TransactionData> {
    try {
      const provider = this.providers.get(chain);
      const signer = provider.getSigner(address);
      const lendingPool = new ethers.Contract(this.lendingPoolAddress, AAVE_LENDING_POOL_ABI, signer);

      const tokenAddress = token === 'ETH' ? ethers.ZeroAddress : token;
      const amountWei = ethers.parseEther(amount.toString());
      const interestRateMode = 2; // Variable rate

      const tx = await lendingPool.borrow.populateTransaction(tokenAddress, amountWei, interestRateMode, 0, address);

      return {
        to: tx.to || '',
        from: address,
        value: tx.value?.toString() || '0',
        data: tx.data || '',
      };
    } catch (error) {
      this.logger.error(`Error creating borrow transaction`, error);
      throw error;
    }
  }

  async repay(address: string, token: string, amount: number, chain: string = 'ethereum'): Promise<TransactionData> {
    try {
      const provider = this.providers.get(chain);
      const signer = provider.getSigner(address);
      const lendingPool = new ethers.Contract(this.lendingPoolAddress, AAVE_LENDING_POOL_ABI, signer);

      const tokenAddress = token === 'ETH' ? ethers.ZeroAddress : token;
      const amountWei = amount === Infinity ? ethers.MaxUint256 : ethers.parseEther(amount.toString());
      const interestRateMode = 2; // Variable rate

      const tx = await lendingPool.repay.populateTransaction(tokenAddress, amountWei, interestRateMode, address);

      return {
        to: tx.to || '',
        from: address,
        value: tx.value?.toString() || '0',
        data: tx.data || '',
      };
    } catch (error) {
      this.logger.error(`Error creating repay transaction`, error);
      throw error;
    }
  }

  async getCollateralData(address: string, chain: string = 'ethereum'): Promise<CollateralData> {
    try {
      const provider = this.providers.get(chain);
      const lendingPool = new ethers.Contract(this.lendingPoolAddress, AAVE_LENDING_POOL_ABI, provider);

      const accountData = await lendingPool.getUserAccountData(address);
      const [totalCollateral, totalBorrowed, , currentLtv, maxLtv, healthFactor] = accountData;

      return {
        totalCollateral: Number(ethers.formatEther(totalCollateral)),
        totalBorrowed: Number(ethers.formatEther(totalBorrowed)),
        availableToBorrow: Math.max(0, Number(ethers.formatEther(totalCollateral)) - Number(ethers.formatEther(totalBorrowed))),
        ltv: Number(currentLtv),
        maxLtv: Number(maxLtv),
        liquidationThreshold: Number(maxLtv) * 0.8,
        healthFactor: Number(ethers.formatEther(healthFactor)),
        collateralBreakdown: [],
      };
    } catch (error) {
      this.logger.error(`Error getting collateral data`, error);
      throw error;
    }
  }

  async getRewards(addresses: string[], user: string, chain: string = 'ethereum'): Promise<RewardData[]> {
    try {
      if (addresses.length === 0) return [];

      const provider = this.providers.get(chain);
      const rewardsController = new ethers.Contract(this.rewardsControllerAddress, AAVE_REWARDS_CONTROLLER_ABI, provider);

      const rewardsBalance = await rewardsController.getRewardsBalance(addresses, user);
      const rewardsFormatted = Number(ethers.formatEther(rewardsBalance));

      if (rewardsFormatted === 0) return [];

      return [
        {
          token: 'AAVE',
          amount: rewardsFormatted,
          valueUSD: rewardsFormatted * (await this.getTokenPrice('AAVE')),
          apy: 0, // Variable
          claimable: true,
        },
      ];
    } catch (error) {
      this.logger.error(`Error getting rewards`, error);
      return [];
    }
  }

  async claimRewards(address: string, token?: string, chain: string = 'ethereum'): Promise<TransactionData> {
    try {
      const provider = this.providers.get(chain);
      const signer = provider.getSigner(address);
      const rewardsController = new ethers.Contract(this.rewardsControllerAddress, AAVE_REWARDS_CONTROLLER_ABI, signer);

      const positions = await this.getAllPositions(address, chain);
      const aTokens = positions.map((p) => this.getATokenAddress(p.token, chain));

      const tx = await rewardsController.claimRewards.populateTransaction(aTokens, ethers.MaxUint256, address);

      return {
        to: tx.to || '',
        from: address,
        value: tx.value?.toString() || '0',
        data: tx.data || '',
      };
    } catch (error) {
      this.logger.error(`Error creating claim rewards transaction`, error);
      throw error;
    }
  }

  async getAPY(token: string, chain: string = 'ethereum'): Promise<number> {
    // Simplified - in production would fetch from protocol
    return Math.random() * 15; // 0-15% APY
  }

  async getTVL(): Promise<number> {
    return 10000000000; // $10B (simplified)
  }

  async getProtocolMetrics(): Promise<ProtocolMetrics> {
    return {
      tvl: 10000000000,
      apy: 7.5,
      users: 500000,
      audits: ['ConsenSys', 'Trail of Bits', 'OpenZeppelin'],
      insurance: true,
    };
  }

  async getRiskMetrics(address: string, token: string, chain: string = 'ethereum'): Promise<RiskMetrics> {
    const collateral = await this.getCollateralData(address, chain);

    return {
      smartContractRisk: 15, // 15/100
      liquidationRisk: Math.min(100, (collateral.ltv / collateral.maxLtv) * 100),
      counterpartyRisk: 20,
      priceVolatilityRisk: 30,
      composabilityRisk: 25,
    };
  }

  async estimateGas(tx: TransactionData): Promise<GasEstimate> {
    try {
      const provider = this.providers.get('ethereum');
      const gasEstimate = await provider.estimateGas({
        to: tx.to,
        from: tx.from,
        value: tx.value,
        data: tx.data,
      });

      const feeData = await provider.getFeeData();
      const totalCost = (gasEstimate * feeData.gasPrice).toString();

      return {
        gas: Number(gasEstimate),
        gasPrice: feeData.gasPrice?.toString() || '0',
        totalCost,
        costUSD: Number(ethers.formatEther(totalCost)) * 2500, // ETH price ~$2500
      };
    } catch (error) {
      this.logger.error('Error estimating gas', error);
      throw error;
    }
  }

  async simulateTransaction(tx: TransactionData): Promise<SimulationResult> {
    try {
      const provider = this.providers.get('ethereum');

      const result = await provider.call({
        to: tx.to,
        from: tx.from,
        data: tx.data,
        value: tx.value,
      });

      return {
        success: true,
        slippage: 0.5, // 0.5% assumed
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private async getATokenAddress(token: string, chain: string): Promise<string> {
    // In production, would fetch from protocol data provider
    const tokenMap: Record<string, string> = {
      USDC: '0xBcca60bB61934080951369a648Fb03DF4F96eeA3',
      USDT: '0x3Ed3B47Dd13EC9a98b44e6C4C38F4c5b5e9CFaFe',
      DAI: '0x028171bCA77440897B824Ca71D1c56caC55b68A3e',
    };
    return tokenMap[token] || ethers.ZeroAddress;
  }

  private async getTokenPrice(token: string): Promise<number> {
    // Simplified - would integrate with price oracle
    const prices: Record<string, number> = {
      USDC: 1,
      USDT: 1,
      DAI: 1,
      AAVE: 150,
      ETH: 2500,
    };
    return prices[token] || 0;
  }
}
