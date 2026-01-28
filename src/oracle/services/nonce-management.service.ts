import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { SubmissionNonce } from '../entities/submission-nonce.entity';
import { getAddress } from 'ethers';

/**
 * Service for managing nonces to prevent replay attacks
 * Each address has a monotonically increasing nonce
 */
@Injectable()
export class NonceManagementService {
  private readonly logger = new Logger(NonceManagementService.name);

  // In-memory cache for nonces to reduce database queries
  private nonceCache = new Map<string, { nonce: bigint; lastFetch: number }>();
  private readonly CACHE_TTL = 60000; // 1 minute cache TTL

  constructor(
    @InjectRepository(SubmissionNonce)
    private nonceRepository: Repository<SubmissionNonce>,
  ) {}

  /**
   * Get the current nonce for an address
   * Returns 0 if address has never submitted before
   */
  async getCurrentNonce(address: string): Promise<string> {
    const checksumAddress = getAddress(address);

    // Check cache first
    const cached = this.nonceCache.get(checksumAddress.toLowerCase());
    if (cached && Date.now() - cached.lastFetch < this.CACHE_TTL) {
      this.logger.debug(
        `Returning cached nonce ${cached.nonce} for ${checksumAddress}`,
      );
      return cached.nonce.toString();
    }

    // Fetch from database
    let nonceEntity = await this.nonceRepository.findOne({
      where: { address: checksumAddress.toLowerCase() },
    });

    if (!nonceEntity) {
      // Create new nonce entry for this address
      nonceEntity = this.nonceRepository.create({
        address: checksumAddress.toLowerCase(),
        nonce: '0',
      });
      await this.nonceRepository.save(nonceEntity);
      this.logger.log(`Created new nonce entry for ${checksumAddress}`);
    }

    // Update cache
    this.nonceCache.set(checksumAddress.toLowerCase(), {
      nonce: BigInt(nonceEntity.nonce),
      lastFetch: Date.now(),
    });

    return nonceEntity.nonce;
  }

  /**
   * Get and increment nonce atomically
   * This ensures no two submissions get the same nonce
   */
  async getAndIncrementNonce(address: string): Promise<string> {
    const checksumAddress = getAddress(address);

    // Use database transaction for atomicity
    const result = await this.nonceRepository.manager.transaction(
      async (transactionalEntityManager) => {
        // Lock the row for update
        let nonceEntity = await transactionalEntityManager.findOne(
          SubmissionNonce,
          {
            where: { address: checksumAddress.toLowerCase() },
            lock: { mode: 'pessimistic_write' },
          },
        );

        if (!nonceEntity) {
          // Create new nonce entry
          nonceEntity = transactionalEntityManager.create(SubmissionNonce, {
            address: checksumAddress.toLowerCase(),
            nonce: '0',
          });
        }

        const currentNonce = nonceEntity.nonce;
        const nextNonce = (BigInt(currentNonce) + BigInt(1)).toString();

        // Increment nonce
        nonceEntity.nonce = nextNonce;
        nonceEntity.lastUsedAt = new Date();

        await transactionalEntityManager.save(SubmissionNonce, nonceEntity);

        return currentNonce;
      },
    );

    // Invalidate cache
    this.nonceCache.delete(checksumAddress.toLowerCase());

    this.logger.log(
      `Incremented nonce for ${checksumAddress}: ${result} -> ${BigInt(result) + BigInt(1)}`,
    );

    return result;
  }

  /**
   * Validate that a nonce is the next expected nonce for an address
   * Useful for validation before accepting a signed payload
   */
  async validateNonce(address: string, nonce: string): Promise<boolean> {
    const checksumAddress = getAddress(address);
    const currentNonce = await this.getCurrentNonce(checksumAddress);

    const isValid = nonce === currentNonce;

    if (!isValid) {
      this.logger.warn(
        `Nonce validation failed for ${checksumAddress}. Expected: ${currentNonce}, Got: ${nonce}`,
      );
    }

    return isValid;
  }

  /**
   * Manually set nonce for an address (admin operation)
   * Use with caution - can cause issues if set incorrectly
   */
  async setNonce(address: string, nonce: string): Promise<void> {
    const checksumAddress = getAddress(address);

    let nonceEntity = await this.nonceRepository.findOne({
      where: { address: checksumAddress.toLowerCase() },
    });

    if (!nonceEntity) {
      nonceEntity = this.nonceRepository.create({
        address: checksumAddress.toLowerCase(),
        nonce: nonce,
      });
    } else {
      nonceEntity.nonce = nonce;
    }

    await this.nonceRepository.save(nonceEntity);

    // Invalidate cache
    this.nonceCache.delete(checksumAddress.toLowerCase());

    this.logger.warn(
      `Manually set nonce for ${checksumAddress} to ${nonce}`,
    );
  }

  /**
   * Reset nonce for an address (admin operation)
   */
  async resetNonce(address: string): Promise<void> {
    await this.setNonce(address, '0');
    this.logger.warn(`Reset nonce for ${address} to 0`);
  }

  /**
   * Get nonce information for multiple addresses
   */
  async getNoncesForAddresses(
    addresses: string[],
  ): Promise<Map<string, string>> {
    const checksumAddresses = addresses.map((addr) => getAddress(addr));

    const nonceEntities = await this.nonceRepository.find({
      where: checksumAddresses.map((addr) => ({
        address: addr.toLowerCase(),
      })),
    });

    const nonceMap = new Map<string, string>();

    checksumAddresses.forEach((addr) => {
      const entity = nonceEntities.find(
        (e) => e.address === addr.toLowerCase(),
      );
      nonceMap.set(addr, entity?.nonce || '0');
    });

    return nonceMap;
  }

  /**
   * Clear stale cache entries
   * Should be called periodically
   */
  clearStaleCache(): void {
    const now = Date.now();
    let cleared = 0;

    for (const [address, cached] of this.nonceCache.entries()) {
      if (now - cached.lastFetch > this.CACHE_TTL) {
        this.nonceCache.delete(address);
        cleared++;
      }
    }

    if (cleared > 0) {
      this.logger.debug(`Cleared ${cleared} stale cache entries`);
    }
  }

  /**
   * Get statistics about nonce usage
   */
  async getNonceStats(): Promise<{
    totalAddresses: number;
    totalNonces: bigint;
    averageNonce: number;
  }> {
    const result = await this.nonceRepository
      .createQueryBuilder('nonce')
      .select('COUNT(*)', 'totalAddresses')
      .addSelect('SUM(CAST(nonce AS BIGINT))', 'totalNonces')
      .getRawOne();

    const totalAddresses = parseInt(result.totalAddresses) || 0;
    const totalNonces = BigInt(result.totalNonces || 0);
    const averageNonce =
      totalAddresses > 0 ? Number(totalNonces) / totalAddresses : 0;

    return {
      totalAddresses,
      totalNonces,
      averageNonce,
    };
  }

  /**
   * Clean up old nonce records (optional maintenance)
   * Remove nonces for addresses that haven't been used in a long time
   */
  async cleanupOldNonces(daysInactive: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

    const result = await this.nonceRepository.delete({
      lastUsedAt: LessThan(cutoffDate),
      nonce: '0', // Only delete unused addresses
    });

    const deletedCount = result.affected || 0;

    if (deletedCount > 0) {
      this.logger.log(
        `Cleaned up ${deletedCount} inactive nonce records older than ${daysInactive} days`,
      );
    }

    return deletedCount;
  }
}
