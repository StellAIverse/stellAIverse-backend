import { PayloadStatus, PayloadType } from '../entities/signed-payload.entity';

/**
 * Response DTO for payload operations
 */
export class PayloadResponseDto {
  id: string;
  payloadType: PayloadType;
  signerAddress: string;
  nonce: string;
  payload: Record<string, any>;
  payloadHash: string;
  structuredDataHash: string;
  signature: string | null;
  expiresAt: Date;
  status: PayloadStatus;
  transactionHash: string | null;
  blockNumber: string | null;
  submissionAttempts: number;
  errorMessage: string | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  confirmedAt: Date | null;
}
