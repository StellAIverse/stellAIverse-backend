import { IsEnum, IsNotEmpty, IsObject, IsOptional } from 'class-validator';
import { PayloadType } from '../entities/signed-payload.entity';

/**
 * DTO for creating a new payload to be signed
 */
export class CreatePayloadDto {
  @IsEnum(PayloadType)
  @IsNotEmpty()
  payloadType: PayloadType;

  @IsObject()
  @IsNotEmpty()
  payload: Record<string, any>;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
