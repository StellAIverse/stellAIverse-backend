import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Referral, ReferralStatus } from "../entities/referral.entity";
import { AbuseFlag } from "../referral.service";

/**
 * Audit event types for referral system
 */
export enum ReferralAuditEvent {
  REFERRAL_CODE_CREATED = "referral_code_created",
  REFERRAL_CODE_CLAIMED = "referral_code_claimed",
  ABUSE_FLAG_DETECTED = "abuse_flag_detected",
  REFERRAL_SUSPENDED = "referral_suspended",
  REFERRAL_REACTIVATED = "referral_reactivated",
  RATE_LIMIT_EXCEEDED = "rate_limit_exceeded",
  SUSPICIOUS_PATTERN_DETECTED = "suspicious_pattern_detected",
}

/**
 * Referral audit log entity for compliance tracking
 */
@Injectable()
export class ReferralAuditService {
  private readonly logger = new Logger(ReferralAuditService.name);

  constructor(
    @InjectRepository(Referral)
    private readonly referralRepository: Repository<Referral>,
  ) {}

  /**
   * Log a referral code creation event
   */
  async logReferralCodeCreated(
    referralId: string,
    referrerId: string,
    ipAddress: string | null,
    deviceFingerprint: string | null,
    abuseFlags: AbuseFlag[] | null,
  ): Promise<void> {
    this.logger.log({
      event: ReferralAuditEvent.REFERRAL_CODE_CREATED,
      referralId,
      referrerId,
      ipAddress,
      deviceFingerprint,
      abuseFlags: abuseFlags || [],
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log a referral code claimed event
   */
  async logReferralCodeClaimed(
    referralId: string,
    referrerId: string,
    referredId: string,
    ipAddress: string | null,
    deviceFingerprint: string | null,
  ): Promise<void> {
    this.logger.log({
      event: ReferralAuditEvent.REFERRAL_CODE_CLAIMED,
      referralId,
      referrerId,
      referredId,
      ipAddress,
      deviceFingerprint,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log abuse flag detection
   */
  async logAbuseFlagDetected(
    referralId: string,
    userId: string,
    flags: AbuseFlag[],
    context: Record<string, unknown>,
  ): Promise<void> {
    this.logger.warn({
      event: ReferralAuditEvent.ABUSE_FLAG_DETECTED,
      referralId,
      userId,
      flags,
      context,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log referral suspension
   */
  async logReferralSuspended(
    referralId: string,
    adminUserId: string,
    reason: string,
  ): Promise<void> {
    this.logger.log({
      event: ReferralAuditEvent.REFERRAL_SUSPENDED,
      referralId,
      adminUserId,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log referral reactivation
   */
  async logReferralReactivated(
    referralId: string,
    adminUserId: string,
  ): Promise<void> {
    this.logger.log({
      event: ReferralAuditEvent.REFERRAL_REACTIVATED,
      referralId,
      adminUserId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log rate limit exceeded
   */
  async logRateLimitExceeded(
    userId: string,
    ipAddress: string,
    endpoint: string,
  ): Promise<void> {
    this.logger.warn({
      event: ReferralAuditEvent.RATE_LIMIT_EXCEEDED,
      userId,
      ipAddress,
      endpoint,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log suspicious pattern detection
   */
  async logSuspiciousPattern(
    referralId: string,
    userId: string,
    patternType: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    this.logger.warn({
      event: ReferralAuditEvent.SUSPICIOUS_PATTERN_DETECTED,
      referralId,
      userId,
      patternType,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get audit logs for a specific referral
   */
  async getReferralAuditLogs(referralId: string): Promise<Referral | null> {
    // This would query a separate audit log table in production
    // For now, we can retrieve the referral with its abuse flags
    return this.referralRepository.findOne({
      where: { id: referralId },
      select: [
        "id",
        "abuseFlags",
        "securityMetadata",
        "createdAt",
        "updatedAt",
      ],
    });
  }

  /**
   * Get all referrals with abuse flags for compliance reporting
   */
  async getFlaggedReferralsForCompliance(
    startDate: Date,
    endDate: Date,
  ): Promise<Referral[]> {
    return this.referralRepository
      .createQueryBuilder("referral")
      .where('"abuseFlags" IS NOT NULL')
      .andWhere('array_length("abuseFlags", 1) > 0')
      .andWhere('"createdAt" >= :startDate', { startDate })
      .andWhere('"createdAt" <= :endDate', { endDate })
      .orderBy('"createdAt"', "DESC")
      .getMany();
  }

  /**
   * Generate compliance report for a date range
   */
  async generateComplianceReport(
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalReferrals: number;
    claimedReferrals: number;
    flaggedReferrals: number;
    suspendedReferrals: number;
    abuseTypeBreakdown: Record<string, number>;
  }> {
    const [total, claimed, flagged, suspended] = await Promise.all([
      this.referralRepository
        .createQueryBuilder("referral")
        .where('"createdAt" >= :startDate', { startDate })
        .andWhere('"createdAt" <= :endDate', { endDate })
        .getCount(),
      this.referralRepository
        .createQueryBuilder("referral")
        .where("claimed = :claimed", { claimed: true })
        .andWhere('"createdAt" >= :startDate', { startDate })
        .andWhere('"createdAt" <= :endDate', { endDate })
        .getCount(),
      this.referralRepository
        .createQueryBuilder("referral")
        .where('"abuseFlags" IS NOT NULL')
        .andWhere('array_length("abuseFlags", 1) > 0')
        .andWhere('"createdAt" >= :startDate', { startDate })
        .andWhere('"createdAt" <= :endDate', { endDate })
        .getCount(),
      this.referralRepository
        .createQueryBuilder("referral")
        .where("status = :status", { status: ReferralStatus.SUSPENDED })
        .andWhere('"createdAt" >= :startDate', { startDate })
        .andWhere('"createdAt" <= :endDate', { endDate })
        .getCount(),
    ]);

    // Get abuse type breakdown
    const flaggedReferrals = await this.referralRepository
      .createQueryBuilder("referral")
      .select('"abuseFlags"')
      .where('"abuseFlags" IS NOT NULL')
      .andWhere('"createdAt" >= :startDate', { startDate })
      .andWhere('"createdAt" <= :endDate', { endDate })
      .getMany();

    const abuseTypeBreakdown: Record<string, number> = {};
    flaggedReferrals.forEach((ref) => {
      if (ref.abuseFlags) {
        ref.abuseFlags.forEach((flag) => {
          abuseTypeBreakdown[flag] = (abuseTypeBreakdown[flag] || 0) + 1;
        });
      }
    });

    return {
      totalReferrals: total,
      claimedReferrals: claimed,
      flaggedReferrals: flagged,
      suspendedReferrals: suspended,
      abuseTypeBreakdown,
    };
  }
}
