import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import { ComputeResult } from './entities/compute-result.entity';
import { CreateComputeResultDto } from './dto/create-compute-result.dto';

@Injectable()
export class ComputeService {
  // In-memory storage for now - will be replaced with database storage later
  private computeResults: Map<string, ComputeResult> = new Map();

  /**
   * Normalizes the compute result to ensure deterministic representation
   */
  private normalizeResult(result: string): string {
    try {
      // Attempt to parse as JSON and re-stringify for canonical representation
      const parsed = JSON.parse(result);
      
      // Sort object keys recursively to ensure deterministic order
      const sorted = this.sortObjectKeys(parsed);
      
      // Stringify with sorted keys to create canonical JSON
      return JSON.stringify(sorted);
    } catch (error) {
      // If not valid JSON, return the original string
      // In a production environment, you might want more sophisticated normalization
      return result;
    }
  }

  /**
   * Recursively sort object keys to ensure deterministic ordering
   */
  private sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      return obj;
    }

    const sortedObj: any = {};
    const keys = Object.keys(obj).sort();

    for (const key of keys) {
      sortedObj[key] = this.sortObjectKeys(obj[key]);
    }

    return sortedObj;
  }

  /**
   * Generates a hash of the normalized result
   */
  private generateHash(normalizedResult: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(normalizedResult));
  }

  /**
   * Creates and stores a compute result with normalization and hashing
   */
  createComputeResult(dto: CreateComputeResultDto): ComputeResult {
    const originalResult = dto.originalResult;
    const normalizedResult = this.normalizeResult(originalResult);
    const hash = this.generateHash(normalizedResult);
    const metadata = dto.metadata ? JSON.parse(dto.metadata) : undefined;

    const computeResult = new ComputeResult(
      uuidv4(),
      originalResult,
      normalizedResult,
      hash,
      metadata,
    );

    // Store in memory for now
    this.computeResults.set(computeResult.id, computeResult);

    return computeResult;
  }

  /**
   * Retrieves a compute result by ID
   */
  getComputeResultById(id: string): ComputeResult | undefined {
    return this.computeResults.get(id);
  }

  /**
   * Verifies that a given result produces the same hash as stored
   */
  verifyResult(id: string, result: string): boolean {
    const storedResult = this.getComputeResultById(id);
    if (!storedResult) {
      return false;
    }

    const normalizedInput = this.normalizeResult(result);
    const inputHash = this.generateHash(normalizedInput);

    return storedResult.hash === inputHash;
  }

  /**
   * Gets all compute results
   */
  getAllComputeResults(): ComputeResult[] {
    return Array.from(this.computeResults.values());
  }
}