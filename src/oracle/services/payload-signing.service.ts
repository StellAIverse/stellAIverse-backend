import { Injectable, Logger } from '@nestjs/common';
import {
  Wallet,
  TypedDataDomain,
  TypedDataField,
  keccak256,
  toUtf8Bytes,
  getAddress,
  verifyTypedData,
} from 'ethers';
import { ConfigService } from '@nestjs/config';

/**
 * EIP-712 Domain for stellAIverse Oracle
 */
export interface OracleDomain extends TypedDataDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

/**
 * EIP-712 Payload structure
 */
export interface OraclePayload {
  payloadType: string;
  payloadHash: string;
  nonce: string;
  expiresAt: string;
  data: string; // JSON stringified data
}

/**
 * Service for signing payloads using EIP-712 structured data signing
 * This ensures signatures are verifiable on-chain
 */
@Injectable()
export class PayloadSigningService {
  private readonly logger = new Logger(PayloadSigningService.name);
  private readonly domain: OracleDomain;

  // EIP-712 type definitions for Oracle payloads
  private readonly types: Record<string, TypedDataField[]> = {
    OraclePayload: [
      { name: 'payloadType', type: 'string' },
      { name: 'payloadHash', type: 'bytes32' },
      { name: 'nonce', type: 'uint256' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'data', type: 'string' },
    ],
  };

  constructor(private configService: ConfigService) {
    // Initialize EIP-712 domain
    this.domain = {
      name: 'StellAIverse Oracle',
      version: '1',
      chainId: parseInt(this.configService.get<string>('CHAIN_ID', '1')),
      verifyingContract: this.configService.get<string>(
        'ORACLE_CONTRACT_ADDRESS',
        '0x0000000000000000000000000000000000000000',
      ),
    };

    this.logger.log(
      `Initialized PayloadSigningService for chain ${this.domain.chainId}`,
    );
  }

  /**
   * Hash payload data using keccak256
   */
  hashPayload(payload: Record<string, any>): string {
    const jsonString = JSON.stringify(payload);
    return keccak256(toUtf8Bytes(jsonString));
  }

  /**
   * Create EIP-712 structured data for a payload
   */
  createStructuredData(
    payloadType: string,
    payloadHash: string,
    nonce: string,
    expiresAt: number,
    data: Record<string, any>,
  ): {
    domain: OracleDomain;
    types: Record<string, TypedDataField[]>;
    value: OraclePayload;
  } {
    const value: OraclePayload = {
      payloadType,
      payloadHash,
      nonce: nonce.toString(),
      expiresAt: expiresAt.toString(),
      data: JSON.stringify(data),
    };

    return {
      domain: this.domain,
      types: this.types,
      value,
    };
  }

  /**
   * Sign a payload using EIP-712 structured data signing
   * @param privateKey - Private key of the signer (with 0x prefix)
   * @param payloadType - Type of the payload
   * @param payloadHash - Keccak256 hash of the payload
   * @param nonce - Nonce for replay protection
   * @param expiresAt - Unix timestamp when payload expires
   * @param data - The actual payload data
   * @returns Signature string and signer address
   */
  async signPayload(
    privateKey: string,
    payloadType: string,
    payloadHash: string,
    nonce: string,
    expiresAt: number,
    data: Record<string, any>,
  ): Promise<{ signature: string; signerAddress: string }> {
    try {
      // Create wallet from private key
      const wallet = new Wallet(privateKey);
      const signerAddress = await wallet.getAddress();

      // Create structured data
      const { domain, types, value } = this.createStructuredData(
        payloadType,
        payloadHash,
        nonce,
        expiresAt,
        data,
      );

      // Sign using EIP-712
      const signature = await wallet.signTypedData(domain, types, value);

      this.logger.log(
        `Signed payload type ${payloadType} with nonce ${nonce} by ${signerAddress}`,
      );

      return {
        signature,
        signerAddress: getAddress(signerAddress), // Checksum address
      };
    } catch (error) {
      this.logger.error(`Failed to sign payload: ${error.message}`, error.stack);
      throw new Error(`Payload signing failed: ${error.message}`);
    }
  }

  /**
   * Verify a signature for a payload (off-chain verification)
   * @param signature - The signature to verify
   * @param payloadType - Type of the payload
   * @param payloadHash - Keccak256 hash of the payload
   * @param nonce - Nonce used in signing
   * @param expiresAt - Expiration timestamp
   * @param data - The payload data
   * @param expectedSigner - Expected signer address
   * @returns true if signature is valid, false otherwise
   */
  verifySignature(
    signature: string,
    payloadType: string,
    payloadHash: string,
    nonce: string,
    expiresAt: number,
    data: Record<string, any>,
    expectedSigner: string,
  ): boolean {
    try {
      const { domain, types, value } = this.createStructuredData(
        payloadType,
        payloadHash,
        nonce,
        expiresAt,
        data,
      );

      // Recover signer address from signature
      const recoveredAddress = verifyTypedData(domain, types, value, signature);

      // Compare with expected signer (case-insensitive)
      const isValid =
        recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();

      if (isValid) {
        this.logger.log(
          `Signature verified successfully for ${expectedSigner}`,
        );
      } else {
        this.logger.warn(
          `Signature verification failed. Expected: ${expectedSigner}, Got: ${recoveredAddress}`,
        );
      }

      return isValid;
    } catch (error) {
      this.logger.error(
        `Signature verification error: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * Get the EIP-712 domain used for signing
   */
  getDomain(): OracleDomain {
    return this.domain;
  }

  /**
   * Get the EIP-712 types definition
   */
  getTypes(): Record<string, TypedDataField[]> {
    return this.types;
  }

  /**
   * Compute the EIP-712 hash for a payload (useful for on-chain verification)
   */
  computeStructuredDataHash(
    payloadType: string,
    payloadHash: string,
    nonce: string,
    expiresAt: number,
    data: Record<string, any>,
  ): string {
    const { domain, types, value } = this.createStructuredData(
      payloadType,
      payloadHash,
      nonce,
      expiresAt,
      data,
    );

    // This would require implementation of EIP-712 hash computation
    // For now, return the payload hash as a placeholder
    // In production, you'd use a proper EIP-712 hash function
    return payloadHash;
  }
}
