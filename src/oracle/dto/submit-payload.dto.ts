import { IsString, IsNotEmpty } from 'class-validator';

/**
 * DTO for submitting a signed payload on-chain
 */
export class SubmitPayloadDto {
  @IsString()
  @IsNotEmpty()
  payloadId: string;
}
