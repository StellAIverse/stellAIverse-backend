import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

/**
 * Only `value` and `description` may be mutated.
 * `key` and `isReadonly` are immutable via this endpoint.
 */
export class UpdateParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  value: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;
}

export class CreateParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  key: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  value: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;
}
