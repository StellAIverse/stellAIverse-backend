import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, MaxLength } from 'class-validator';

export class QueueProposalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  targetKey: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  proposedValue: string;

  @IsString()
  @IsNotEmpty()
  proposedBy: string;

  /**
   * Optional custom delay in milliseconds. Must be >= MIN_DELAY_MS.
   * Defaults to 86_400_000 (24 hours).
   */
  @IsOptional()
  @IsNumber()
  @Min(1)
  delayMs?: number;
}

export class CancelProposalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  reason: string;
}
