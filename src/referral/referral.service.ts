import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThanOrEqual, MoreThanOrEqual, In } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidv4 } from "uuid";
import { Referral, ReferralStatus } from "./entities/referral.entity";
import { CreateReferralDto, ClaimReferralDto } from "./dto/referral.dto";

/**
 * Abuse detection flags for tracking suspicious activity
 */
export enum AbuseFlag {
  MULTIPLE_ACCOUNTS_SAME_IP = "multiple_accounts_same_ip",
  MULTIPLE_ACCOUNTS_SAME_DEVICE = "multiple_accounts_same_device",
  BOT_SIGNATURE_DETECTED = "bot_signature_detected",
  HIGH_REFERRAL_RATE = "high_referral_rate",
  SUSPICIOUS_REFERRAL_PATTERN = "suspicious_referral_pattern",
  VPN_PROXY_DETECTED = "vpn_proxy_detected",
  RAPID_REGISTRATION = "rapid_registration",
}

/**
 * Security configuration interface
 */
interface SecurityConfig {
  maxReferralsPerUser: number;
  maxClaimsPerIP: number;
  maxClaimsPerDevice: number;
  referralCodeExpiryDays: number;
  suspiciousIPThreshold: number;
  suspiciousDeviceThreshold: number;
  rateLimitWindowMs: number;
  rateLimitMaxAttempts: number;
  enableBotDetection: boolean;
  enableVPNDetection: boolean;
}

/**
 * Service for managing referrals with comprehensive security controls
 * Includes abuse prevention, rate limiting, and compliance features
 */
@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);
  private securityConfig: SecurityConfig;

  constructor(
    @InjectRepository(Referral)
    private readonly referralRepository: Repository<Referral>,
    private readonly configService: ConfigService,
  ) {
    // Initialize security configuration from environment
    this.securityConfig = {
      maxReferralsPerUser:
        this.configService.get<number>("REFERRAL_MAX_PER_USER") || 10,
      maxClaimsPerIP:
        this.configService.get<number>("REFERRAL_MAX_CLAIMS_PER_IP") || 5,
      maxClaimsPerDevice:
        this.configService.get<number>("REFERRAL_MAX_CLAIMS_PER_DEVICE") || 3,
      referralCodeExpiryDays:
        this.configService.get<number>("REFERRAL_CODE_EXPIRY_DAYS") || 365,
      suspiciousIPThreshold:
        this.configService.get<number>("REFERRAL_SUSPICIOUS_IP_THRESHOLD") || 3,
      suspiciousDeviceThreshold:
        this.configService.get<number>(
          "REFERRAL_SUSPICIOUS_DEVICE_THRESHOLD",
        ) || 2,
      rateLimitWindowMs:
        this.configService.get<number>("REFERRAL_RATE_LIMIT_WINDOW_MS") ||
        3600000, // 1 hour
      rateLimitMaxAttempts:
        this.configService.get<number>("REFERRAL_RATE_LIMIT_MAX_ATTEMPTS") ||
        10,
      enableBotDetection:
        this.configService.get<boolean>("REFERRAL_ENABLE_BOT_DETECTION") ||
        true,
      enableVPNDetection:
        this.configService.get<boolean>("REFERRAL_ENABLE_VPN_DETECTION") ||
        false,
    };
  }

  /**
   * Generate a unique referral code
   */
  private generateReferralCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 12; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Check for rate limiting on referral code creation
   */
  async checkRateLimit(
    ipAddress: string,
    deviceFingerprint?: string,
  ): Promise<boolean> {
    const windowStart = new Date(
      Date.now() - this.securityConfig.rateLimitWindowMs,
    );

    // Check IP-based rate limiting
    const ipCount = await this.referralRepository.count({
      where: {
        ipAddress,
        createdAt: MoreThanOrEqual(windowStart),
      },
    });

    if (ipCount >= this.securityConfig.rateLimitMaxAttempts) {
      this.logger.warn(`Rate limit exceeded for IP: ${ipAddress}`);
      throw new ForbiddenException(
        "Too many referral codes created. Please try again later.",
      );
    }

    // Check device-based rate limiting if fingerprint is provided
    if (deviceFingerprint) {
      const deviceCount = await this.referralRepository.count({
        where: {
          deviceFingerprint,
          createdAt: MoreThanOrEqual(windowStart),
        },
      });

      if (deviceCount >= this.securityConfig.rateLimitMaxAttempts / 2) {
        this.logger.warn(
          `Rate limit exceeded for device: ${deviceFingerprint}`,
        );
        throw new ForbiddenException(
          "Too many referral codes from this device. Please try again later.",
        );
      }
    }

    return true;
  }

  /**
   * Detect suspicious patterns and return abuse flags
   */
  async detectSuspiciousPatterns(
    ipAddress: string,
    deviceFingerprint?: string,
    userAgent?: string,
  ): Promise<AbuseFlag[]> {
    const flags: AbuseFlag[] = [];
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours

    // Check for multiple accounts from same IP
    const accountsFromIP = await this.referralRepository
      .createQueryBuilder("referral")
      .select('COUNT(DISTINCT "referredId")', "count")
      .where('"ipAddress" = :ip', { ip: ipAddress })
      .andWhere('"referredId" IS NOT NULL')
      .andWhere('"createdAt" >= :start', { start: windowStart })
      .getRawOne();

    if (
      accountsFromIP &&
      parseInt(accountsFromIP.count) >=
        this.securityConfig.suspiciousIPThreshold
    ) {
      flags.push(AbuseFlag.MULTIPLE_ACCOUNTS_SAME_IP);
    }

    // Check for multiple accounts from same device
    if (deviceFingerprint) {
      const accountsFromDevice = await this.referralRepository
        .createQueryBuilder("referral")
        .select('COUNT(DISTINCT "referredId")', "count")
        .where('"deviceFingerprint" = :fp', { fp: deviceFingerprint })
        .andWhere('"referredId" IS NOT NULL')
        .andWhere('"createdAt" >= :start', { start: windowStart })
        .getRawOne();

      if (
        accountsFromDevice &&
        parseInt(accountsFromDevice.count) >=
          this.securityConfig.suspiciousDeviceThreshold
      ) {
        flags.push(AbuseFlag.MULTIPLE_ACCOUNTS_SAME_DEVICE);
      }
    }

    // Check for bot signatures in user agent
    if (userAgent && this.securityConfig.enableBotDetection) {
      const botPatterns = [
        /bot/i,
        /crawler/i,
        /spider/i,
        /scrapy/i,
        /headless/i,
        /puppeteer/i,
        /selenium/i,
        /automated/i,
        /script/i,
      ];

      if (botPatterns.some((pattern) => pattern.test(userAgent))) {
        flags.push(AbuseFlag.BOT_SIGNATURE_DETECTED);
      }
    }

    // Check for rapid registration patterns
    const recentReferrals = await this.referralRepository.count({
      where: {
        ipAddress,
        createdAt: MoreThanOrEqual(new Date(Date.now() - 60 * 1000)), // Last minute
      },
    });

    if (recentReferrals >= 5) {
      flags.push(AbuseFlag.RAPID_REGISTRATION);
    }

    // TODO: Add VPN/Proxy detection if enableVPNDetection is true
    // This would require integration with a VPN detection service

    return flags;
  }

  /**
   * Create a new referral code with security checks
   */
  async createReferralCode(
    dto: CreateReferralDto,
    userId: string,
  ): Promise<Referral> {
    // Check rate limits first
    await this.checkRateLimit(
      dto.ipAddress || "unknown",
      dto.deviceFingerprint,
    );

    // Check if user already has too many referral codes
    const existingCount = await this.referralRepository.count({
      where: { referrerId: userId },
    });

    if (existingCount >= this.securityConfig.maxReferralsPerUser) {
      throw new ForbiddenException(
        "You have reached the maximum number of referral codes.",
      );
    }

    // Detect suspicious patterns
    const abuseFlags = await this.detectSuspiciousPatterns(
      dto.ipAddress || "unknown",
      dto.deviceFingerprint,
      dto.userAgent,
    );

    // Generate unique referral code
    let referralCode = this.generateReferralCode();
    let codeExists = await this.referralRepository.findOne({
      where: { referralCode },
    });
    let attempts = 0;
    while (codeExists && attempts < 10) {
      referralCode = this.generateReferralCode();
      codeExists = await this.referralRepository.findOne({
        where: { referralCode },
      });
      attempts++;
    }

    if (codeExists) {
      throw new BadRequestException(
        "Unable to generate unique referral code. Please try again.",
      );
    }

    // Create the referral entity
    const referral = this.referralRepository.create({
      referralCode,
      referrerId: userId,
      ipAddress: dto.ipAddress || null,
      deviceFingerprint: dto.deviceFingerprint || null,
      status: ReferralStatus.ACTIVE,
      expiresAt: new Date(
        Date.now() +
          this.securityConfig.referralCodeExpiryDays * 24 * 60 * 60 * 1000,
      ),
      abuseFlags: abuseFlags.length > 0 ? abuseFlags : null,
      securityMetadata: {
        createdFromIP: dto.ipAddress || null,
        createdFromDevice: dto.deviceFingerprint || null,
        userAgent: dto.userAgent || null,
        abuseFlagsDetected: abuseFlags,
      },
    });

    const saved = await this.referralRepository.save(referral);

    // Log security event if suspicious patterns were detected
    if (abuseFlags.length > 0) {
      this.logger.warn(
        `Abuse flags detected for user ${userId}: ${abuseFlags.join(", ")}`,
      );
    }

    return saved;
  }

  /**
   * Claim a referral code with security validation
   */
  async claimReferralCode(
    dto: ClaimReferralDto,
    userId: string,
  ): Promise<Referral> {
    // Find the referral code
    const referral = await this.referralRepository.findOne({
      where: { referralCode: dto.referralCode.toUpperCase() },
    });

    if (!referral) {
      throw new NotFoundException("Invalid referral code.");
    }

    // Check if referral is still active
    if (referral.status !== ReferralStatus.ACTIVE) {
      throw new ForbiddenException(`This referral code is ${referral.status}.`);
    }

    // Check if code has expired
    if (referral.expiresAt && referral.expiresAt < new Date()) {
      throw new ForbiddenException("This referral code has expired.");
    }

    // Check if already claimed by this user
    if (referral.referredId === userId) {
      throw new BadRequestException(
        "You have already claimed this referral code.",
      );
    }

    // Check if already claimed by someone else
    if (referral.referredId) {
      throw new BadRequestException(
        "This referral code has already been claimed.",
      );
    }

    // Check rate limit for claiming
    await this.checkRateLimit(
      dto.ipAddress || "unknown",
      dto.deviceFingerprint,
    );

    // Detect suspicious patterns for the referred user
    const abuseFlags = await this.detectSuspiciousPatterns(
      dto.ipAddress || "unknown",
      dto.deviceFingerprint,
      dto.userAgent,
    );

    // Check for IP-based claim limit
    if (dto.ipAddress) {
      const existingClaims = await this.referralRepository
        .createQueryBuilder("referral")
        .where('"referredIpAddress" = :ip', { ip: dto.ipAddress })
        .andWhere('"referredId" IS NOT NULL')
        .getCount();

      if (existingClaims >= this.securityConfig.maxClaimsPerIP) {
        throw new ForbiddenException(
          "Too many referrals from this IP address.",
        );
      }
    }

    // Check for device-based claim limit
    if (dto.deviceFingerprint) {
      const existingDeviceClaims = await this.referralRepository
        .createQueryBuilder("referral")
        .where('"referredDeviceFingerprint" = :fp', {
          fp: dto.deviceFingerprint,
        })
        .andWhere('"referredId" IS NOT NULL')
        .getCount();

      if (existingDeviceClaims >= this.securityConfig.maxClaimsPerDevice) {
        throw new ForbiddenException("Too many referrals from this device.");
      }
    }

    // Update referral with referred user info
    referral.referredId = userId;
    referral.claimed = true;
    referral.claimedAt = new Date();
    referral.referredIpAddress = dto.ipAddress || null;
    referral.referredDeviceFingerprint = dto.deviceFingerprint || null;
    referral.referredUserAgent = dto.userAgent || null;

    // Update referrer's successful referrals count
    await this.referralRepository.increment(
      { id: referral.id },
      "successfulReferrals",
      1,
    );

    // Update abuse flags if any detected
    if (abuseFlags.length > 0) {
      const existingFlags = referral.abuseFlags || [];
      referral.abuseFlags = [...existingFlags, ...abuseFlags];
      this.logger.warn(
        `Abuse flags detected for referred user ${userId}: ${abuseFlags.join(", ")}`,
      );
    }

    const updated = await this.referralRepository.save(referral);

    return updated;
  }

  /**
   * Get referral codes for a user
   */
  async getUserReferrals(userId: string): Promise<Referral[]> {
    return this.referralRepository.find({
      where: { referrerId: userId },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Get a specific referral by ID
   */
  async getReferralById(id: string): Promise<Referral> {
    const referral = await this.referralRepository.findOne({ where: { id } });
    if (!referral) {
      throw new NotFoundException("Referral not found.");
    }
    return referral;
  }

  /**
   * Get referral by code
   */
  async getReferralByCode(code: string): Promise<Referral> {
    const referral = await this.referralRepository.findOne({
      where: { referralCode: code.toUpperCase() },
    });
    if (!referral) {
      throw new NotFoundException("Referral code not found.");
    }
    return referral;
  }

  /**
   * Suspend a referral (admin action)
   */
  async suspendReferral(
    id: string,
    reason: string,
    adminUserId: string,
  ): Promise<Referral> {
    const referral = await this.getReferralById(id);

    if (referral.status === ReferralStatus.SUSPENDED) {
      throw new BadRequestException("Referral is already suspended.");
    }

    referral.status = ReferralStatus.SUSPENDED;
    referral.suspensionReason = reason;
    referral.suspendedBy = adminUserId;
    referral.suspendedAt = new Date();

    return this.referralRepository.save(referral);
  }

  /**
   * Reactivate a suspended referral (admin action)
   */
  async reactivateReferral(id: string): Promise<Referral> {
    const referral = await this.getReferralById(id);

    if (referral.status !== ReferralStatus.SUSPENDED) {
      throw new BadRequestException(
        "Only suspended referrals can be reactivated.",
      );
    }

    referral.status = ReferralStatus.ACTIVE;
    referral.suspensionReason = null;
    referral.suspendedBy = null;
    referral.suspendedAt = null;

    return this.referralRepository.save(referral);
  }

  /**
   * Get referrals with abuse flags for admin review
   */
  async getFlaggedReferrals(
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: Referral[]; total: number }> {
    const [data, total] = await this.referralRepository
      .createQueryBuilder("referral")
      .where('"abuseFlags" IS NOT NULL')
      .andWhere('array_length("abuseFlags", 1) > 0')
      .orderBy('"createdAt"', "DESC")
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  /**
   * Get referral statistics
   */
  async getReferralStats(): Promise<{
    total: number;
    active: number;
    claimed: number;
    suspended: number;
    flagged: number;
  }> {
    const [total, active, claimed, suspended, flagged] = await Promise.all([
      this.referralRepository.count(),
      this.referralRepository.count({
        where: { status: ReferralStatus.ACTIVE },
      }),
      this.referralRepository.count({ where: { claimed: true } }),
      this.referralRepository.count({
        where: { status: ReferralStatus.SUSPENDED },
      }),
      this.referralRepository
        .createQueryBuilder("referral")
        .where('"abuseFlags" IS NOT NULL')
        .andWhere('array_length("abuseFlags", 1) > 0')
        .getCount(),
    ]);

    return { total, active, claimed, suspended, flagged };
  }
}
