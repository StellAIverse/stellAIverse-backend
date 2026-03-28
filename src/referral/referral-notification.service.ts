import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Referral, ReferralStatus } from './entities/referral.entity';
import { ReferralEvent, ReferralEventType } from './entities/referral-event.entity';
import { User } from '../user/entities/user.entity';
import { NotificationService } from '../notification/notification.service';
import { EmailService } from '../auth/email.service';
import { ReferralEmailTemplates } from './email-templates/referral-invite.template';
import { NotificationPriority, NotificationChannel } from '../notification/entities/notification.entity';

/**
 * DTO for sending referral invitation
 */
export interface SendReferralInviteDto {
  referrerId: string;
  refereeEmail: string;
  message?: string;
  metadata?: Record<string, any>;
}

/**
 * Main referral service handling notifications and tracking
 */
@Injectable()
export class ReferralNotificationService {
  private readonly logger = new Logger(ReferralNotificationService.name);

  constructor(
    @InjectRepository(Referral)
    private readonly referralRepository: Repository<Referral>,
    @InjectRepository(ReferralEvent)
    private readonly eventRepository: Repository<ReferralEvent>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
    private readonly emailTemplates: ReferralEmailTemplates,
  ) {}

  /**
   * Send referral invitation with email and in-app notifications
   */
  async sendReferralInvite(dto: SendReferralInviteDto): Promise<Referral> {
    const referrer = await this.userRepository.findOne({ where: { id: dto.referrerId } });
    
    if (!referrer) {
      throw new Error('Referrer not found');
    }

    // Generate unique referral code
    const referralCode = this.generateReferralCode();
    const referralUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/signup?ref=${referralCode}`;

    // Create referral record
    const referral = this.referralRepository.create({
      referrerId: dto.referrerId,
      refereeEmail: dto.refereeEmail.toLowerCase(),
      referralCode,
      status: ReferralStatus.PENDING,
      message: dto.message,
      metadata: dto.metadata,
    });

    await this.referralRepository.save(referral);

    // Log invite sent event
    await this.logReferralEvent(referral.id, ReferralEventType.INVITE_SENT, {
      refereeEmail: dto.refereeEmail,
      referrerName: referrer.username || referrer.email,
    });

    // Send email to referee
    await this.sendReferralInviteEmail({
      referrerName: referrer.username || referrer.email || 'A user',
      refereeEmail: dto.refereeEmail,
      referralCode,
      referralUrl,
      message: dto.message,
    });

    // Send in-app notification to referrer
    await this.notificationService.sendNotification({
      userId: dto.referrerId,
      type: 'referral.invite_sent',
      title: 'Invitation Sent! 🎉',
      message: `Your referral invitation has been sent to ${dto.refereeEmail}`,
      data: { referralId: referral.id, referralCode },
      priority: NotificationPriority.MEDIUM,
      channel: NotificationChannel.IN_APP,
    });

    this.logger.log(`Referral invitation sent to ${dto.refereeEmail} from user ${dto.referrerId}`);

    return referral;
  }

  /**
   * Notify on referee registration
   */
  async notifyRegistration(referral: Referral, refereeUser: User): Promise<void> {
    // Update referral status
    referral.status = ReferralStatus.REGISTERED;
    referral.refereeId = refereeUser.id;
    referral.registeredAt = new Date();
    await this.referralRepository.save(referral);

    // Log registration event
    await this.logReferralEvent(referral.id, ReferralEventType.REGISTRATION_COMPLETED, {
      refereeId: refereeUser.id,
      refereeEmail: refereeUser.email,
    });

    // Notify referrer (in-app + email)
    const referrer = await this.userRepository.findOne({ where: { id: referral.referrerId } });
    if (referrer) {
      await this.notificationService.sendNotification({
        userId: referral.referrerId,
        type: 'referral.registration_completed',
        title: 'Referral Registered! 🎊',
        message: `${refereeUser.username || refereeUser.email || 'Someone'} has joined StellAIverse using your referral!`,
        data: { referralId: referral.id, refereeId: refereeUser.id },
        priority: NotificationPriority.HIGH,
        channel: NotificationChannel.BOTH,
        actionUrl: '/referrals',
      });
    }

    // Notify referee (welcome)
    await this.notificationService.sendNotification({
      userId: refereeUser.id,
      type: 'referral.welcome',
      title: 'Welcome to StellAIverse! 🚀',
      message: "You've been referred by " + (referrer?.username || 'someone') + ". Start exploring AI agents now!",
      data: { referralId: referral.id, referrerId: referral.referrerId },
      priority: NotificationPriority.HIGH,
      channel: NotificationChannel.BOTH,
      actionUrl: '/agents',
    });

    this.logger.log(`Referral registration notified for ${referral.refereeEmail}`);
  }

  /**
   * Notify on reward earned
   */
  async notifyRewardEarned(referral: Referral, rewardDetails: {
    amount: number;
    currency: string;
    description: string;
  }): Promise<void> {
    // Update referral status
    referral.status = ReferralStatus.REWARDED;
    referral.rewardedAt = new Date();
    await this.referralRepository.save(referral);

    // Log reward event
    await this.logReferralEvent(referral.id, ReferralEventType.REWARD_EARNED, rewardDetails);

    // Notify referrer
    await this.notificationService.sendNotification({
      userId: referral.referrerId,
      type: 'referral.reward_earned',
      title: `Reward Earned! 💰`,
      message: `You've earned ${rewardDetails.amount} ${rewardDetails.currency} from your referral! ${rewardDetails.description}`,
      data: { referralId: referral.id, ...rewardDetails },
      priority: NotificationPriority.HIGH,
      channel: NotificationChannel.BOTH,
      actionUrl: '/rewards',
    });

    this.logger.log(`Reward notified for referral ${referral.id}`);
  }

  /**
   * Notify on milestone reached
   */
  async notifyMilestone(referral: Referral, milestone: {
    type: string;
    value: number;
    description: string;
  }): Promise<void> {
    // Log milestone event
    await this.logReferralEvent(referral.id, ReferralEventType.MILESTONE_REACHED, milestone);

    // Notify referrer
    await this.notificationService.sendNotification({
      userId: referral.referrerId,
      type: 'referral.milestone_reached',
      title: 'Milestone Reached! 🏆',
      message: `Your referral has reached a milestone: ${milestone.description}`,
      data: { referralId: referral.id, milestone },
      priority: NotificationPriority.MEDIUM,
      channel: NotificationChannel.IN_APP,
    });

    this.logger.log(`Milestone notified for referral ${referral.id}`);
  }

  /**
   * Send referral invite email
   */
  private async sendReferralInviteEmail(data: {
    referrerName: string;
    refereeEmail: string;
    referralCode: string;
    referralUrl: string;
    message?: string;
  }): Promise<void> {
    try {
      const html = this.emailTemplates.generateReferralInviteEmail(data);
      const text = this.emailTemplates.generateReferralInviteEmailText(data);

      await this.emailService.sendMail({
        to: data.refereeEmail,
        subject: `You're invited to join StellAIverse by ${data.referrerName}!`,
        html,
        text,
      });

      this.logger.log(`Referral invite email sent to ${data.refereeEmail}`);
    } catch (error) {
      this.logger.error(`Failed to send referral email: ${error.message}`, error.stack);
    }
  }

  /**
   * Log a referral event
   */
  private async logReferralEvent(
    referralId: string,
    eventType: ReferralEventType,
    data?: Record<string, any>,
  ): Promise<void> {
    const event = this.eventRepository.create({
      referralId,
      eventType,
      data,
    });

    await this.eventRepository.save(event);
  }

  /**
   * Generate unique referral code
   */
  private generateReferralCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Get referral by code
   */
  async getReferralByCode(code: string): Promise<Referral | null> {
    return this.referralRepository.findOne({
      where: { referralCode: code },
      relations: ['referrer', 'referee'],
    });
  }

  /**
   * Get user's referrals
   */
  async getUserReferrals(userId: string): Promise<Referral[]> {
    return this.referralRepository.find({
      where: { referrerId: userId },
      relations: ['referee'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get referral statistics for a user
   */
  async getReferralStats(userId: string): Promise<{
    totalReferrals: number;
    pendingReferrals: number;
    registeredReferrals: number;
    rewardedReferrals: number;
    totalRewards: number;
  }> {
    const referrals = await this.referralRepository.find({
      where: { referrerId: userId },
    });

    const stats = {
      totalReferrals: referrals.length,
      pendingReferrals: referrals.filter(r => r.status === ReferralStatus.PENDING).length,
      registeredReferrals: referrals.filter(r => r.status === ReferralStatus.REGISTERED).length,
      rewardedReferrals: referrals.filter(r => r.status === ReferralStatus.REWARDED).length,
      totalRewards: 0, // Would calculate from actual rewards
    };

    return stats;
  }
}
