import { IsString, IsOptional, IsUUID, IsIP, MaxLength } from 'class-validator';

/**
 * DTO for creating a new referral code
 */
export class CreateReferralDto {
  /**
   * User ID of the referrer (can be inferred from authenticated user)
   */
  @IsUUID()
  @IsOptional()
  referrerId?: string;

  /**
   * IP address of the request (for security tracking)
   */
  @IsIP()
  @IsOptional()
  ipAddress?: string;

  /**
   * Device fingerprint for abuse detection
   */
  @IsString()
  @MaxLength(255)
  @IsOptional()
  deviceFingerprint?: string;

  /**
   * User agent string for device tracking
   */
  @IsString()
  @MaxLength(500)
  @IsOptional()
  userAgent?: string;
}

/**
 * DTO for claiming/using a referral code
 */
export class ClaimReferralDto {
  /**
   * The referral code to claim
   */
  @IsString()
  @MaxLength(16)
  referralCode: string;

  /**
   * IP address of the referred user
   */
  @IsIP()
  @IsOptional()
  ipAddress?: string;

  /**
   * Device fingerprint of the referred user
   */
  @IsString()
  @MaxLength(255)
  @IsOptional()
  deviceFingerprint?: string;

  /**
   * User agent string
   */
  @IsString()
  @MaxLength(500)
  @IsOptional()
  userAgent?: string;
}

/**
 * DTO for querying referrals
 */
export class QueryReferralDto {
  @IsString()
  @IsOptional()
  status?: string;

  @IsUUID()
  @IsOptional()
  referrerId?: string;

  @IsUUID()
  @IsOptional()
  referredId?: string;

  @IsString()
  @IsOptional()
  referralCode?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}

/**
 * DTO for updating referral status (admin)
 */
export class UpdateReferralStatusDto {
  /**
   * New status for the referral
   */
  @IsString()
  status: string;

  /**
   * Reason for the status change (required for suspension)
   */
  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;
}