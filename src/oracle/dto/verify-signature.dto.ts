import { IsString, IsNotEmpty, IsObject, Matches } from 'class-validator';

/**
 * DTO for verifying a signature off-chain
 */
export class VerifySignatureDto {
  @IsObject()
  @IsNotEmpty()
  payload: Record<string, any>;

  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{130}$/, {
    message: 'Signature must be a valid hex string with 0x prefix (132 chars)',
  })
  signature: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'Expected signer must be a valid Ethereum address',
  })
  expectedSigner: string;
}
