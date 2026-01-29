import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  JsonRpcProvider,
  Wallet,
  Contract,
  TransactionReceipt,
  TransactionResponse,
  Interface,
  formatEther,
} from 'ethers';
import {
  SignedPayload,
  PayloadStatus,
} from '../entities/signed-payload.entity';

/**
 * Minimal ABI for Oracle contract submission
 * In production, this would be imported from contract artifacts
 */
const ORACLE_CONTRACT_ABI = [
  'function submitPayload(string payloadType, bytes32 payloadHash, uint256 nonce, uint256 expiresAt, string data, bytes signature) external returns (bool)',
  'function verifyPayload(string payloadType, bytes32 payloadHash, uint256 nonce, uint256 expiresAt, string data, bytes signature, address expectedSigner) external view returns (bool)',
  'event PayloadSubmitted(address indexed submitter, bytes32 indexed payloadHash, uint256 nonce, string payloadType)',
];

/**
 * Service for submitting verified payloads on-chain
 * Handles transaction submission, monitoring, and retry logic
 */
@Injectable()
export class SubmitterService {
  private readonly logger = new Logger(SubmitterService.name);
  private readonly provider: JsonRpcProvider;
  private readonly submitterWallet: Wallet;
  private readonly oracleContract: Contract;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly gasLimitMultiplier: number;

  constructor(
    private configService: ConfigService,
    @InjectRepository(SignedPayload)
    private payloadRepository: Repository<SignedPayload>,
  ) {
    // Initialize provider
    const rpcUrl = this.configService.get<string>('ETH_RPC_URL');
    if (!rpcUrl) {
      throw new Error('ETH_RPC_URL not configured');
    }
    this.provider = new JsonRpcProvider(rpcUrl);

    // Initialize submitter wallet
    const privateKey = this.configService.get<string>('SUBMITTER_PRIVATE_KEY');
    if (!privateKey) {
      throw new Error('SUBMITTER_PRIVATE_KEY not configured');
    }
    this.submitterWallet = new Wallet(privateKey, this.provider);

    // Initialize oracle contract
    const contractAddress = this.configService.get<string>(
      'ORACLE_CONTRACT_ADDRESS',
    );
    if (!contractAddress) {
      throw new Error('ORACLE_CONTRACT_ADDRESS not configured');
    }
    this.oracleContract = new Contract(
      contractAddress,
      ORACLE_CONTRACT_ABI,
      this.submitterWallet,
    );

    // Configuration
    this.maxRetries = parseInt(
      this.configService.get<string>('SUBMITTER_MAX_RETRIES', '3'),
    );
    this.retryDelay = parseInt(
      this.configService.get<string>('SUBMITTER_RETRY_DELAY', '5000'),
    );
    this.gasLimitMultiplier = parseFloat(
      this.configService.get<string>('SUBMITTER_GAS_LIMIT_MULTIPLIER', '1.2'),
    );

    this.logger.log(
      `Initialized SubmitterService with wallet ${this.submitterWallet.address} on chain ${this.configService.get<string>('CHAIN_ID')}`,
    );
  }

  /**
   * Submit a signed payload on-chain
   */
  async submitPayload(payloadId: string): Promise<{
    transactionHash: string;
    payload: SignedPayload;
  }> {
    // Fetch payload from database
    const payload = await this.payloadRepository.findOne({
      where: { id: payloadId },
    });

    if (!payload) {
      throw new BadRequestException(`Payload ${payloadId} not found`);
    }

    if (payload.status !== PayloadStatus.PENDING) {
      throw new BadRequestException(
        `Payload ${payloadId} is not in PENDING status (current: ${payload.status})`,
      );
    }

    if (!payload.signature) {
      throw new BadRequestException(`Payload ${payloadId} is not signed`);
    }

    // Check expiration
    if (new Date() > payload.expiresAt) {
      payload.status = PayloadStatus.FAILED;
      payload.errorMessage = 'Payload expired before submission';
      await this.payloadRepository.save(payload);
      throw new BadRequestException('Payload has expired');
    }

    try {
      // Estimate gas
      const gasEstimate = await this.estimateGas(payload);
      const gasLimit = BigInt(
        Math.ceil(Number(gasEstimate) * this.gasLimitMultiplier),
      );

      this.logger.log(
        `Submitting payload ${payloadId} with gas limit ${gasLimit}`,
      );

      // Submit transaction
      const tx = await this.oracleContract.submitPayload(
        payload.payloadType,
        payload.payloadHash,
        payload.nonce,
        Math.floor(payload.expiresAt.getTime() / 1000),
        JSON.stringify(payload.payload),
        payload.signature,
        {
          gasLimit,
        },
      );

      // Update payload status
      payload.transactionHash = tx.hash;
      payload.status = PayloadStatus.SUBMITTED;
      payload.submittedAt = new Date();
      payload.submissionAttempts += 1;
      await this.payloadRepository.save(payload);

      this.logger.log(
        `Payload ${payloadId} submitted with tx hash ${tx.hash}`,
      );

      // Start monitoring in background (don't await)
      this.monitorTransaction(payloadId, tx.hash).catch((error) => {
        this.logger.error(
          `Error monitoring transaction ${tx.hash}: ${error.message}`,
        );
      });

      return {
        transactionHash: tx.hash,
        payload,
      };
    } catch (error) {
      // Update payload with error
      payload.submissionAttempts += 1;
      payload.errorMessage = error.message;

      if (payload.submissionAttempts >= this.maxRetries) {
        payload.status = PayloadStatus.FAILED;
        this.logger.error(
          `Payload ${payloadId} failed after ${payload.submissionAttempts} attempts`,
        );
      }

      await this.payloadRepository.save(payload);
      throw error;
    }
  }

  /**
   * Estimate gas for payload submission
   */
  private async estimateGas(payload: SignedPayload): Promise<bigint> {
    try {
      const gasEstimate = await this.oracleContract.submitPayload.estimateGas(
        payload.payloadType,
        payload.payloadHash,
        payload.nonce,
        Math.floor(payload.expiresAt.getTime() / 1000),
        JSON.stringify(payload.payload),
        payload.signature,
      );

      return gasEstimate;
    } catch (error) {
      this.logger.warn(
        `Gas estimation failed: ${error.message}. Using default gas limit.`,
      );
      // Return a reasonable default
      return BigInt(300000);
    }
  }

  /**
   * Monitor a transaction until it's confirmed or fails
   */
  private async monitorTransaction(
    payloadId: string,
    txHash: string,
  ): Promise<void> {
    this.logger.log(`Monitoring transaction ${txHash} for payload ${payloadId}`);

    try {
      // Wait for transaction confirmation
      const receipt = await this.provider.waitForTransaction(txHash, 1); // 1 confirmation

      if (!receipt) {
        throw new Error('Transaction receipt is null');
      }

      // Update payload with confirmation
      const payload = await this.payloadRepository.findOne({
        where: { id: payloadId },
      });

      if (!payload) {
        this.logger.error(`Payload ${payloadId} not found during monitoring`);
        return;
      }

      if (receipt.status === 1) {
        // Transaction succeeded
        payload.status = PayloadStatus.CONFIRMED;
        payload.blockNumber = receipt.blockNumber.toString();
        payload.confirmedAt = new Date();
        payload.errorMessage = null;

        this.logger.log(
          `Payload ${payloadId} confirmed in block ${receipt.blockNumber}`,
        );
      } else {
        // Transaction failed
        payload.status = PayloadStatus.FAILED;
        payload.errorMessage = 'Transaction reverted on-chain';

        this.logger.error(
          `Payload ${payloadId} transaction reverted in block ${receipt.blockNumber}`,
        );
      }

      await this.payloadRepository.save(payload);
    } catch (error) {
      this.logger.error(
        `Error monitoring transaction ${txHash}: ${error.message}`,
        error.stack,
      );

      // Update payload with error
      const payload = await this.payloadRepository.findOne({
        where: { id: payloadId },
      });

      if (payload) {
        payload.status = PayloadStatus.FAILED;
        payload.errorMessage = `Transaction monitoring failed: ${error.message}`;
        await this.payloadRepository.save(payload);
      }
    }
  }

  /**
   * Retry a failed submission
   */
  async retrySubmission(payloadId: string): Promise<{
    transactionHash: string;
    payload: SignedPayload;
  }> {
    const payload = await this.payloadRepository.findOne({
      where: { id: payloadId },
    });

    if (!payload) {
      throw new BadRequestException(`Payload ${payloadId} not found`);
    }

    if (payload.submissionAttempts >= this.maxRetries) {
      throw new BadRequestException(
        `Payload has exceeded maximum retry attempts (${this.maxRetries})`,
      );
    }

    // Reset status to pending for retry
    payload.status = PayloadStatus.PENDING;
    payload.errorMessage = null;
    await this.payloadRepository.save(payload);

    return this.submitPayload(payloadId);
  }

  /**
   * Verify a payload on-chain (view function call)
   */
  async verifyPayloadOnChain(
    payload: SignedPayload,
    expectedSigner: string,
  ): Promise<boolean> {
    try {
      const isValid = await this.oracleContract.verifyPayload(
        payload.payloadType,
        payload.payloadHash,
        payload.nonce,
        Math.floor(payload.expiresAt.getTime() / 1000),
        JSON.stringify(payload.payload),
        payload.signature,
        expectedSigner,
      );

      this.logger.log(
        `On-chain verification result for payload ${payload.id}: ${isValid}`,
      );

      return isValid;
    } catch (error) {
      this.logger.error(
        `On-chain verification failed: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(
    txHash: string,
  ): Promise<TransactionReceipt | null> {
    return this.provider.getTransactionReceipt(txHash);
  }

  /**
   * Get submitter wallet balance
   */
  async getSubmitterBalance(): Promise<string> {
    const balance = await this.provider.getBalance(
      this.submitterWallet.address,
    );
    return formatEther(balance);
  }

  /**
   * Get current gas price
   */
  async getCurrentGasPrice(): Promise<bigint> {
    const feeData = await this.provider.getFeeData();
    return feeData.gasPrice || BigInt(0);
  }

  /**
   * Batch submit multiple payloads (more gas efficient)
   */
  async batchSubmitPayloads(
    payloadIds: string[],
  ): Promise<
    Array<{ payloadId: string; transactionHash: string; success: boolean }>
  > {
    const results = [];

    for (const payloadId of payloadIds) {
      try {
        const result = await this.submitPayload(payloadId);
        results.push({
          payloadId,
          transactionHash: result.transactionHash,
          success: true,
        });

        // Add delay between submissions to avoid nonce issues
        await this.sleep(1000);
      } catch (error) {
        this.logger.error(
          `Failed to submit payload ${payloadId}: ${error.message}`,
        );
        results.push({
          payloadId,
          transactionHash: '',
          success: false,
        });
      }
    }

    return results;
  }

  /**
   * Helper function for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get submission statistics
   */
  async getSubmissionStats(): Promise<{
    pending: number;
    submitted: number;
    confirmed: number;
    failed: number;
    totalAttempts: number;
  }> {
    const [pending, submitted, confirmed, failed, totalAttempts] =
      await Promise.all([
        this.payloadRepository.count({
          where: { status: PayloadStatus.PENDING },
        }),
        this.payloadRepository.count({
          where: { status: PayloadStatus.SUBMITTED },
        }),
        this.payloadRepository.count({
          where: { status: PayloadStatus.CONFIRMED },
        }),
        this.payloadRepository.count({
          where: { status: PayloadStatus.FAILED },
        }),
        this.payloadRepository
          .createQueryBuilder('payload')
          .select('SUM(payload.submissionAttempts)', 'total')
          .getRawOne()
          .then((result) => parseInt(result.total) || 0),
      ]);

    return {
      pending,
      submitted,
      confirmed,
      failed,
      totalAttempts,
    };
  }
}
