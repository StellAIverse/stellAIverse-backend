import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  SignedPayload,
  PayloadStatus,
  PayloadType,
} from '../entities/signed-payload.entity';
import { PayloadSigningService } from './payload-signing.service';
import { NonceManagementService } from './nonce-management.service';
import { SubmitterService } from './submitter.service';
import { CreatePayloadDto } from '../dto/create-payload.dto';
import { PayloadResponseDto } from '../dto/payload-response.dto';

/**
 * Main Oracle service that coordinates payload creation, signing, and submission
 */
@Injectable()
export class OracleService {
  private readonly logger = new Logger(OracleService.name);
  private readonly defaultExpirationMinutes = 30; // Default payload expiration

  constructor(
    @InjectRepository(SignedPayload)
    private payloadRepository: Repository<SignedPayload>,
    private payloadSigningService: PayloadSigningService,
    private nonceManagementService: NonceManagementService,
    private submitterService: SubmitterService,
  ) {}

  /**
   * Create a new payload to be signed
   * @param signerAddress - Address that will sign this payload
   * @param createPayloadDto - Payload details
   * @returns Created payload entity
   */
  async createPayload(
    signerAddress: string,
    createPayloadDto: CreatePayloadDto,
  ): Promise<PayloadResponseDto> {
    // Get next nonce for this address
    const nonce = await this.nonceManagementService.getAndIncrementNonce(
      signerAddress,
    );

    // Calculate payload hash
    const payloadHash =
      this.payloadSigningService.hashPayload(createPayloadDto.payload);

    // Set expiration time
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.defaultExpirationMinutes);

    // Create structured data hash (for EIP-712)
    const structuredDataHash =
      this.payloadSigningService.computeStructuredDataHash(
        createPayloadDto.payloadType,
        payloadHash,
        nonce,
        Math.floor(expiresAt.getTime() / 1000),
        createPayloadDto.payload,
      );

    // Create payload entity
    const payload = this.payloadRepository.create({
      payloadType: createPayloadDto.payloadType,
      signerAddress: signerAddress.toLowerCase(),
      nonce,
      payload: createPayloadDto.payload,
      payloadHash,
      structuredDataHash,
      signature: '', // Will be set when signed
      expiresAt,
      status: PayloadStatus.PENDING,
      metadata: createPayloadDto.metadata || null,
      submissionAttempts: 0,
    });

    const savedPayload = await this.payloadRepository.save(payload);

    this.logger.log(
      `Created payload ${savedPayload.id} for ${signerAddress} with nonce ${nonce}`,
    );

    return this.mapToResponseDto(savedPayload);
  }

  /**
   * Sign a payload with a private key
   * @param payloadId - ID of the payload to sign
   * @param privateKey - Private key to sign with (must match the signer address)
   * @returns Updated payload with signature
   */
  async signPayload(
    payloadId: string,
    privateKey: string,
  ): Promise<PayloadResponseDto> {
    const payload = await this.payloadRepository.findOne({
      where: { id: payloadId },
    });

    if (!payload) {
      throw new NotFoundException(`Payload ${payloadId} not found`);
    }

    if (payload.signature) {
      throw new BadRequestException(`Payload ${payloadId} is already signed`);
    }

    if (new Date() > payload.expiresAt) {
      throw new BadRequestException(`Payload ${payloadId} has expired`);
    }

    // Sign the payload
    const { signature, signerAddress } =
      await this.payloadSigningService.signPayload(
        privateKey,
        payload.payloadType,
        payload.payloadHash,
        payload.nonce,
        Math.floor(payload.expiresAt.getTime() / 1000),
        payload.payload,
      );

    // Verify the signer matches the expected address
    if (signerAddress.toLowerCase() !== payload.signerAddress.toLowerCase()) {
      throw new BadRequestException(
        `Signer address ${signerAddress} does not match expected address ${payload.signerAddress}`,
      );
    }

    // Update payload with signature
    payload.signature = signature;
    const updatedPayload = await this.payloadRepository.save(payload);

    this.logger.log(`Signed payload ${payloadId} with address ${signerAddress}`);

    return this.mapToResponseDto(updatedPayload);
  }

  /**
   * Submit a signed payload on-chain
   * @param payloadId - ID of the payload to submit
   * @returns Submission result with transaction hash
   */
  async submitPayload(payloadId: string): Promise<{
    transactionHash: string;
    payload: PayloadResponseDto;
  }> {
    const result = await this.submitterService.submitPayload(payloadId);

    return {
      transactionHash: result.transactionHash,
      payload: this.mapToResponseDto(result.payload),
    };
  }

  /**
   * Verify a signature off-chain
   */
  async verifySignature(
    payloadId: string,
    expectedSigner: string,
  ): Promise<boolean> {
    const payload = await this.payloadRepository.findOne({
      where: { id: payloadId },
    });

    if (!payload) {
      throw new NotFoundException(`Payload ${payloadId} not found`);
    }

    if (!payload.signature) {
      throw new BadRequestException(`Payload ${payloadId} is not signed`);
    }

    return this.payloadSigningService.verifySignature(
      payload.signature,
      payload.payloadType,
      payload.payloadHash,
      payload.nonce,
      Math.floor(payload.expiresAt.getTime() / 1000),
      payload.payload,
      expectedSigner,
    );
  }

  /**
   * Get a payload by ID
   */
  async getPayload(payloadId: string): Promise<PayloadResponseDto> {
    const payload = await this.payloadRepository.findOne({
      where: { id: payloadId },
    });

    if (!payload) {
      throw new NotFoundException(`Payload ${payloadId} not found`);
    }

    return this.mapToResponseDto(payload);
  }

  /**
   * Get payloads for an address
   */
  async getPayloadsForAddress(
    address: string,
    status?: PayloadStatus,
    limit: number = 50,
  ): Promise<PayloadResponseDto[]> {
    const whereClause: any = {
      signerAddress: address.toLowerCase(),
    };

    if (status) {
      whereClause.status = status;
    }

    const payloads = await this.payloadRepository.find({
      where: whereClause,
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return payloads.map((p) => this.mapToResponseDto(p));
  }

  /**
   * Get pending payloads ready for submission
   */
  async getPendingPayloads(limit: number = 100): Promise<PayloadResponseDto[]> {
    const payloads = await this.payloadRepository.find({
      where: {
        status: PayloadStatus.PENDING,
        signature: In([null, '']), // Has signature
      },
      order: { createdAt: 'ASC' },
      take: limit,
    });

    // Filter out expired payloads
    const now = new Date();
    const validPayloads = payloads.filter((p) => p.expiresAt > now && p.signature);

    return validPayloads.map((p) => this.mapToResponseDto(p));
  }

  /**
   * Get current nonce for an address
   */
  async getCurrentNonce(address: string): Promise<string> {
    return this.nonceManagementService.getCurrentNonce(address);
  }

  /**
   * Retry a failed submission
   */
  async retrySubmission(payloadId: string): Promise<{
    transactionHash: string;
    payload: PayloadResponseDto;
  }> {
    const result = await this.submitterService.retrySubmission(payloadId);

    return {
      transactionHash: result.transactionHash,
      payload: this.mapToResponseDto(result.payload),
    };
  }

  /**
   * Get submission statistics
   */
  async getStatistics(): Promise<{
    payloads: {
      pending: number;
      submitted: number;
      confirmed: number;
      failed: number;
    };
    nonces: {
      totalAddresses: number;
      totalNonces: bigint;
      averageNonce: number;
    };
    submissions: {
      pending: number;
      submitted: number;
      confirmed: number;
      failed: number;
      totalAttempts: number;
    };
  }> {
    const [payloadStats, nonceStats, submissionStats] = await Promise.all([
      this.getPayloadStats(),
      this.nonceManagementService.getNonceStats(),
      this.submitterService.getSubmissionStats(),
    ]);

    return {
      payloads: payloadStats,
      nonces: nonceStats,
      submissions: submissionStats,
    };
  }

  /**
   * Get payload statistics
   */
  private async getPayloadStats(): Promise<{
    pending: number;
    submitted: number;
    confirmed: number;
    failed: number;
  }> {
    const [pending, submitted, confirmed, failed] = await Promise.all([
      this.payloadRepository.count({ where: { status: PayloadStatus.PENDING } }),
      this.payloadRepository.count({
        where: { status: PayloadStatus.SUBMITTED },
      }),
      this.payloadRepository.count({
        where: { status: PayloadStatus.CONFIRMED },
      }),
      this.payloadRepository.count({ where: { status: PayloadStatus.FAILED } }),
    ]);

    return { pending, submitted, confirmed, failed };
  }

  /**
   * Clean up expired payloads
   */
  async cleanupExpiredPayloads(): Promise<number> {
    const now = new Date();

    const expiredPayloads = await this.payloadRepository.find({
      where: {
        status: PayloadStatus.PENDING,
      },
    });

    const toUpdate = expiredPayloads.filter((p) => p.expiresAt < now);

    for (const payload of toUpdate) {
      payload.status = PayloadStatus.FAILED;
      payload.errorMessage = 'Payload expired';
    }

    if (toUpdate.length > 0) {
      await this.payloadRepository.save(toUpdate);
      this.logger.log(`Marked ${toUpdate.length} expired payloads as failed`);
    }

    return toUpdate.length;
  }

  /**
   * Map entity to response DTO
   */
  private mapToResponseDto(payload: SignedPayload): PayloadResponseDto {
    return {
      id: payload.id,
      payloadType: payload.payloadType,
      signerAddress: payload.signerAddress,
      nonce: payload.nonce,
      payload: payload.payload,
      payloadHash: payload.payloadHash,
      structuredDataHash: payload.structuredDataHash,
      signature: payload.signature || null,
      expiresAt: payload.expiresAt,
      status: payload.status,
      transactionHash: payload.transactionHash,
      blockNumber: payload.blockNumber,
      submissionAttempts: payload.submissionAttempts,
      errorMessage: payload.errorMessage,
      metadata: payload.metadata,
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
      submittedAt: payload.submittedAt,
      confirmedAt: payload.confirmedAt,
    };
  }
}
