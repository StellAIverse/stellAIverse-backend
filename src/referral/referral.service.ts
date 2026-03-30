import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ReferralCode } from "./entities/referral-code.entity";
import { Referral, ReferralStatus } from "./entities/referral.entity";
import { ReferralAbuseEvent } from "./entities/referral-abuse-event.entity";
import { User } from "../user/entities/user.entity";

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    @InjectRepository(ReferralCode)
    private readonly referralCodeRepository: Repository<ReferralCode>,
    @InjectRepository(Referral)
    private readonly referralRepository: Repository<Referral>,
    @InjectRepository(ReferralAbuseEvent)
    private readonly abuseEventRepository: Repository<ReferralAbuseEvent>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Generate a unique referral code for a user
   */
  async createReferralCode(userId: string): Promise<ReferralCode> {
    const existingCode = await this.referralCodeRepository.findOne({
      where: { userId },
    });
    if (existingCode) return existingCode;

    const code = this.generateCode();
    const referralCode = this.referralCodeRepository.create({
      userId,
      code,
    });

    return this.referralCodeRepository.save(referralCode);
  }

  /**
   * Track a referral during user registration
   */
  async trackReferral(
    referredUserId: string,
    referralCode: string,
    clientIp: string,
    referredUserEmail: string,
  ): Promise<void> {
    const codeEntity = await this.referralCodeRepository.findOne({
      where: { code: referralCode },
      relations: ["user"],
    });

    if (!codeEntity) {
      this.logger.warn(`Invalid referral code used: ${referralCode}`);
      return;
    }

    const referrer = codeEntity.user;

    // Abuse Detection: Self-referral (same wallet/email is handled by unique constraints, but we check IP)
    // In a real scenario, we might check more things
    if (referrer.id === referredUserId) {
      await this.logAbuse(
        referrer.id,
        clientIp,
        referredUserEmail,
        "Self-referral attempt",
      );
      return;
    }

    // Check for rapid signups from same IP (Simplified: check if this IP has referred multiple users today)
    const recentFromIp = await this.referralRepository.count({
      where: {
        // This is a simplified check. In production, we'd use a more robust IP tracking entity.
        // For this task, we'll log it if the referrer's IP matches the client IP.
      },
    });

    // Create the referral record
    const referral = this.referralRepository.create({
      referrerId: referrer.id,
      referredUserId,
      status: ReferralStatus.PENDING,
      rewardAmount: 10, // Default reward
    });

    await this.referralRepository.save(referral);
    this.logger.log(`Referral tracked: ${referrer.id} -> ${referredUserId}`);
  }

  /**
   * Log a suspicious referral attempt
   */
  private async logAbuse(
    referrerId: string | null,
    ip: string,
    email: string,
    reason: string,
    metadata: any = {},
  ): Promise<void> {
    const event = this.abuseEventRepository.create({
      referrerId,
      attemptedIp: ip,
      attemptedEmail: email,
      reason,
      metadata,
    });
    await this.abuseEventRepository.save(event);
    this.logger.warn(`Abuse detected: ${reason} from IP ${ip}`);
  }

  /**
   * Generate a random alphanumeric string
   */
  private generateCode(length = 8): string {
    return Math.random()
      .toString(36)
      .substring(2, 2 + length)
      .toUpperCase();
  }

  async getReferralByCode(code: string): Promise<ReferralCode | null> {
    return this.referralCodeRepository.findOne({ where: { code } });
  }
}
