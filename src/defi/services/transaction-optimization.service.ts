import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  DeFiTransaction,
  TransactionStatus,
} from "../entities/defi-transaction.entity";
import { DeFiPosition } from "../entities/defi-position.entity";
import { ProtocolRegistry } from "../protocols/protocol-registry";
import {
  TransactionData,
  SimulationResult,
  GasEstimate,
} from "../protocols/protocol-adapter.interface";

@Injectable()
export class TransactionOptimizationService {
  private logger = new Logger("TransactionOptimizationService");

  private gasMultipliers = {
    legacy: 1.0,
    eip1559: 0.8, // 20% cheaper on average
    flashbots: 0.6, // MEV protection, cheaper
  };

  private priorityLevels = {
    LOW: 0.5,
    STANDARD: 1.0,
    FAST: 1.5,
    URGENT: 2.0,
  };

  constructor(
    @InjectRepository(DeFiTransaction)
    private transactionRepository: Repository<DeFiTransaction>,
    @InjectRepository(DeFiPosition)
    private positionRepository: Repository<DeFiPosition>,
    private protocolRegistry: ProtocolRegistry,
  ) {}

  /**
   * Simulate a transaction to check for reverts and impacts
   */
  async simulateTransaction(transactionId: string): Promise<SimulationResult> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
    });

    if (!transaction) throw new Error("Transaction not found");

    const position = await this.positionRepository.findOne({
      where: { id: transaction.position_id },
    });

    if (!position) throw new Error("Position not found");

    const adapter = this.protocolRegistry.getAdapter(position.protocol as any);

    const txData: TransactionData = {
      to: position.contract_address,
      from: position.wallet_address,
      value: transaction.amount_in.toString(),
      data: transaction.encoded_data?.data || "",
    };

    try {
      const result = await adapter.simulateTransaction(txData);

      transaction.status = result.success
        ? TransactionStatus.SIMULATED
        : TransactionStatus.FAILED;
      transaction.simulation_results = {
        success: result.success,
        outputAmount: result.outputAmount,
        priceImpact: result.priceImpact,
        slippage: result.slippage,
      };

      if (!result.success) {
        transaction.error_message = result.error;
      }

      await this.transactionRepository.save(transaction);

      return result;
    } catch (error) {
      this.logger.error(
        `Simulation failed for transaction ${transactionId}`,
        error,
      );
      transaction.status = TransactionStatus.FAILED;
      transaction.error_message = error.message;
      await this.transactionRepository.save(transaction);
      throw error;
    }
  }

  /**
   * Estimate gas costs and optimize for network conditions
   */
  async estimateAndOptimizeGas(
    transactionId: string,
    priorityLevel: "LOW" | "STANDARD" | "FAST" | "URGENT" = "STANDARD",
  ): Promise<GasOptimizationResult> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
    });

    if (!transaction) throw new Error("Transaction not found");

    const position = await this.positionRepository.findOne({
      where: { id: transaction.position_id },
    });

    if (!position) throw new Error("Position not found");

    const adapter = this.protocolRegistry.getAdapter(position.protocol as any);

    const txData: TransactionData = {
      to: position.contract_address,
      from: position.wallet_address,
      value: transaction.amount_in.toString(),
      data: transaction.encoded_data?.data || "",
    };

    try {
      const baseEstimate = await adapter.estimateGas(txData);

      // Get network conditions
      const networkConditions = await this.getNetworkConditions(
        transaction.network,
      );

      // Calculate optimized gas parameters
      const priorityMultiplier = this.priorityLevels[priorityLevel] || 1;
      const transmissionMethod = this.selectTransmissionMethod(
        baseEstimate,
        networkConditions,
      );
      const methodMultiplier = this.gasMultipliers[transmissionMethod];

      const optimizedGasPrice =
        parseFloat(baseEstimate.gasPrice) * priorityMultiplier;
      const optimizedCost =
        baseEstimate.gas * optimizedGasPrice * methodMultiplier;

      // Calculate MEV protection upcharge if using flashbots
      let mevProtectionCost = 0;
      if (transmissionMethod === "flashbots") {
        mevProtectionCost = optimizedCost * 0.02; // 2% premium
      }

      const alternatives = [
        {
          method: "legacy",
          gasPrice: parseFloat(baseEstimate.gasPrice),
          totalCost: baseEstimate.gas * parseFloat(baseEstimate.gasPrice),
          estimatedTime: "2-5 minutes",
          riskLevel: "MEDIUM",
        },
        {
          method: "eip1559",
          gasPrice: optimizedGasPrice,
          totalCost: optimizedCost,
          estimatedTime: "30-60 seconds",
          riskLevel: "LOW",
        },
        {
          method: "flashbots",
          gasPrice: optimizedGasPrice,
          totalCost: optimizedCost + mevProtectionCost,
          estimatedTime: "5-15 seconds",
          riskLevel: "VERY_LOW",
          mevProtected: true,
        },
      ];

      // Update transaction with optimization details
      transaction.gas_price_gwei = optimizedGasPrice / 1e9;
      transaction.gas_cost_usd = optimizedCost * networkConditions.ethPriceUSD;
      transaction.encoded_data = transaction.encoded_data || {};
      transaction.encoded_data.gasOptimization = {
        method: transmissionMethod,
        priorityLevel,
        baseGasPrice: baseEstimate.gasPrice,
        optimizedGasPrice,
        estimatedTime: alternatives.find((a) => a.method === transmissionMethod)
          ?.estimatedTime,
      };

      await this.transactionRepository.save(transaction);

      return {
        transactionId,
        baseEstimate,
        optimized: {
          method: transmissionMethod,
          gasPrice: optimizedGasPrice,
          totalCost: optimizedCost + mevProtectionCost,
          costUSD:
            (optimizedCost + mevProtectionCost) * networkConditions.ethPriceUSD,
          estimatedTime: alternatives.find(
            (a) => a.method === transmissionMethod,
          )?.estimatedTime,
        },
        alternatives,
        networkConditions,
        savings: {
          vs_standard:
            baseEstimate.costUSD -
            optimizedCost * networkConditions.ethPriceUSD,
          vs_urgent:
            baseEstimate.costUSD * 1.5 -
            (optimizedCost + mevProtectionCost) * networkConditions.ethPriceUSD,
        },
      };
    } catch (error) {
      this.logger.error(
        `Gas estimation failed for transaction ${transactionId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Bundle multiple transactions for better gas efficiency
   */
  async bundleTransactions(
    transactionIds: string[],
  ): Promise<TransactionBundleResult> {
    const transactions = await this.transactionRepository.find({
      where: { id: { $in: transactionIds } as any },
    });

    if (transactions.length === 0) throw new Error("No transactions found");

    // Calculate individual costs
    let totalCost = 0;
    let individuatCost = 0;
    const breakdown: any[] = [];

    for (const tx of transactions) {
      const cost = tx.gas_cost_usd;
      totalCost += cost;
      individuatCost += cost;

      breakdown.push({
        transactionId: tx.id,
        type: tx.transaction_type,
        cost,
      });
    }

    // Estimate bundled cost
    // Bundles are typically 20% cheaper due to shared overhead
    const bundledCost = totalCost * 0.8;
    const savings = totalCost - bundledCost;

    return {
      transactionCount: transactions.length,
      totalCost: individuatCost,
      bundledCost,
      savings,
      savingsPercent: (savings / individuatCost) * 100,
      breakdown,
      recommendation: savings > 20 ? "RECOMMENDED" : "NOT_RECOMMENDED",
    };
  }

  /**
   * Emergency exit optimization - minimize slippage and gas for quick exit
   */
  async optimizeEmergencyExit(positionId: string): Promise<EmergencyExitPlan> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId },
    });

    if (!position) throw new Error("Position not found");

    const adapter = this.protocolRegistry.getAdapter(position.protocol as any);

    try {
      // Create withdrawal transaction
      const withdrawalTx = await adapter.withdraw(
        position.wallet_address,
        position.token_symbol,
        position.current_amount,
        "ethereum",
      );

      // Estimate gas
      const gasEstimate = await adapter.estimateGas(withdrawalTx);

      // Calculate slippage impact
      const simulaionResult = await adapter.simulateTransaction(withdrawalTx);

      // If position has borrowing, create repayment transaction
      let repaymentTx = null;
      if (position.borrowed_amount && position.borrowed_amount > 0) {
        repaymentTx = await adapter.repay(
          position.wallet_address,
          position.token_symbol,
          position.borrowed_amount,
          "ethereum",
        );
      }

      // Calculate total costs
      const totalGasCost =
        gasEstimate.costUSD + (repaymentTx ? gasEstimate.costUSD : 0);
      const expectedRecovery = position.current_amount - totalGasCost;

      return {
        positionId,
        plan: [
          {
            step: 1,
            action: "Withdraw",
            amount: position.current_amount,
            token: position.token_symbol,
            gasCost: gasEstimate.costUSD,
            slippage: simulaionResult.slippage || 0.5,
          },
          ...(repaymentTx
            ? [
                {
                  step: 2,
                  action: "Repay",
                  amount: position.borrowed_amount,
                  token: position.token_symbol,
                  gasCost: gasEstimate.costUSD,
                  slippage: 0,
                },
              ]
            : []),
        ],
        totalGasCost,
        expectedRecovery,
        timeToExecution: "10-30 seconds",
        riskFactors: [
          "Price movement during execution",
          "Slippage on DEX routes",
          "Network congestion",
        ],
      };
    } catch (error) {
      this.logger.error(
        `Emergency exit optimization failed for position ${positionId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Batch transaction optimization - find patterns and optimize
   */
  async optimizeBatchTransactions(
    userId: string,
  ): Promise<BatchOptimizationResult> {
    const positions = await this.positionRepository.find({
      where: { user_id: userId },
      relations: ["transactions"],
    });

    const pendingTransactions = positions
      .flatMap((p) => p.transactions || [])
      .filter(
        (t) =>
          t.status === TransactionStatus.PENDING ||
          t.status === TransactionStatus.SIMULATED,
      );

    if (pendingTransactions.length === 0) {
      return {
        totalTransactions: 0,
        hasBundlingOpportunity: false,
        recommendations: [],
      };
    }

    // Identify bundling opportunities
    const byNetwork: Record<string, any[]> = {};
    for (const tx of pendingTransactions) {
      if (!byNetwork[tx.network]) byNetwork[tx.network] = [];
      byNetwork[tx.network].push(tx);
    }

    const recommendations: any[] = [];

    for (const network in byNetwork) {
      const txs = byNetwork[network];
      if (txs.length > 1) {
        const bundleResult = await this.bundleTransactions(
          txs.map((t) => t.id),
        );
        if (bundleResult.recommendation === "RECOMMENDED") {
          recommendations.push({
            network,
            bundleCount: txs.length,
            potentialSavings: bundleResult.savings,
            savingsPercent: bundleResult.savingsPercent,
          });
        }
      }
    }

    return {
      totalTransactions: pendingTransactions.length,
      hasBundlingOpportunity: recommendations.length > 0,
      recommendations,
      estimatedTotalSavings: recommendations.reduce(
        (sum, r) => sum + r.potentialSavings,
        0,
      ),
    };
  }

  // Helper methods

  private async getNetworkConditions(
    network: string = "ethereum",
  ): Promise<NetworkConditions> {
    // In production, would fetch from gas price oracle
    return {
      network,
      baseFeePerGas: 30,
      priorityFee: 2,
      standardGasPrice: 50,
      fastGasPrice: 75,
      urgentGasPrice: 150,
      ethPriceUSD: 2500,
      networkCongestion: "moderate",
      avgBlockTime: 12,
    };
  }

  private selectTransmissionMethod(
    estimate: GasEstimate,
    network: NetworkConditions,
  ): "legacy" | "eip1559" | "flashbots" {
    // Use EIP1559 if available and network supports it
    if (network.baseFeePerGas) {
      return "eip1559";
    }

    // Use Flashbots for large transactions or high slippage risk
    if (parseFloat(estimate.totalCost) > 1) {
      return "flashbots";
    }

    return "legacy";
  }
}

export interface GasOptimizationResult {
  transactionId: string;
  baseEstimate: GasEstimate;
  optimized: {
    method: string;
    gasPrice: number;
    totalCost: number;
    costUSD: number;
    estimatedTime: string;
  };
  alternatives: Array<{
    method: string;
    gasPrice: number;
    totalCost: number;
    estimatedTime: string;
    riskLevel: string;
    mevProtected?: boolean;
  }>;
  networkConditions: NetworkConditions;
  savings: {
    vs_standard: number;
    vs_urgent: number;
  };
}

export interface TransactionBundleResult {
  transactionCount: number;
  totalCost: number;
  bundledCost: number;
  savings: number;
  savingsPercent: number;
  breakdown: any[];
  recommendation: "RECOMMENDED" | "NOT_RECOMMENDED";
}

export interface EmergencyExitPlan {
  positionId: string;
  plan: Array<{
    step: number;
    action: string;
    amount: number;
    token: string;
    gasCost: number;
    slippage: number;
  }>;
  totalGasCost: number;
  expectedRecovery: number;
  timeToExecution: string;
  riskFactors: string[];
}

export interface BatchOptimizationResult {
  totalTransactions: number;
  hasBundlingOpportunity: boolean;
  recommendations: any[];
  estimatedTotalSavings: number;
}

export interface NetworkConditions {
  network: string;
  baseFeePerGas: number;
  priorityFee: number;
  standardGasPrice: number;
  fastGasPrice: number;
  urgentGasPrice: number;
  ethPriceUSD: number;
  networkCongestion: "low" | "moderate" | "high";
  avgBlockTime: number;
}
