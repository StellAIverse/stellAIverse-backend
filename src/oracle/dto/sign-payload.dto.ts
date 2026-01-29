import { IsString, IsNotEmpty, Matches } from 'class-validator';

/**
 * DTO for signing a payload with a private key
 */
export class SignPayloadDto {
  @IsString()
  @IsNotEmpty()
  payloadId: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{64}$/, {
    message: 'Private key must be a valid hex string with 0x prefix',
  })
  privateKey: string;
}
