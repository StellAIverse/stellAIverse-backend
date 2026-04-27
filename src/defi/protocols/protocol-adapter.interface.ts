export interface ProtocolAdapter {
  name: string;
  supportedChains: string[];

  // Position Management
  getPosition(address: string, token: string): Promise<PositionData>;
  getAllPositions(address: string): Promise<PositionData[]>;
  deposit(
    address: string,
    token: string,
    amount: number,
  ): Promise<TransactionData>;
  withdraw(
    address: string,
    token: string,
    amount: number,
  ): Promise<TransactionData>;

  // Lending/Borrowing
  borrow?(
    address: string,
    token: string,
    amount: number,
  ): Promise<TransactionData>;
  repay?(
    address: string,
    token: string,
    amount: number,
  ): Promise<TransactionData>;
  getCollateralData?(address: string): Promise<CollateralData>;

  // Staking/Farming
  stake?(
    address: string,
    token: string,
    amount: number,
  ): Promise<TransactionData>;
  unstake?(
    address: string,
    token: string,
    amount: number,
  ): Promise<TransactionData>;

  // Rewards
  getRewards(address: string): Promise<RewardData[]>;
  claimRewards(address: string, token?: string): Promise<TransactionData>;

  // Metrics
  getAPY(token: string): Promise<number>;
  getTVL(): Promise<number>;
  getProtocolMetrics(): Promise<ProtocolMetrics>;

  // Risk Assessment
  getRiskMetrics(address: string, token: string): Promise<RiskMetrics>;

  // Gas Optimization
  estimateGas(tx: TransactionData): Promise<GasEstimate>;
  simulateTransaction(tx: TransactionData): Promise<SimulationResult>;

  // Swap Integration
  getSwapRoute?(
    tokenIn: string,
    tokenOut: string,
    amount: number,
  ): Promise<SwapRoute>;
  executeSwap?(route: SwapRoute): Promise<TransactionData>;
}

export interface PositionData {
  token: string;
  balance: number;
  valueUSD: number;
  apy: number;
  rewards?: RewardData[];
  metadata?: Record<string, any>;
}

export interface CollateralData {
  totalCollateral: number;
  totalBorrowed: number;
  availableToBorrow: number;
  ltv: number;
  maxLtv: number;
  liquidationThreshold: number;
  healthFactor: number;
  collateralBreakdown: { token: string; amount: number; value: number }[];
}

export interface RewardData {
  token: string;
  amount: number;
  valueUSD: number;
  apy: number;
  claimable: boolean;
  nextClaimDate?: Date;
}

export interface TransactionData {
  to: string;
  from: string;
  value: string;
  data: string;
  gasLimit?: string;
  gasPrice?: string;
  nonce?: number;
}

export interface GasEstimate {
  gas: number;
  gasPrice: string;
  totalCost: string;
  costUSD: number;
}

export interface SimulationResult {
  success: boolean;
  outputAmount?: number;
  priceImpact?: number;
  slippage?: number;
  error?: string;
}

export interface ProtocolMetrics {
  tvl: number;
  apy: number;
  users: number;
  audits: string[];
  insurance?: boolean;
}

export interface RiskMetrics {
  smartContractRisk: number;
  liquidationRisk: number;
  counterpartyRisk: number;
  priceVolatilityRisk: number;
  composabilityRisk?: number;
}

export interface SwapRoute {
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut: number;
  route: string[];
  priceImpact: number;
  fee: number;
}
