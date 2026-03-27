import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationPriority, NotificationChannel } from './entities/notification.entity';
import { NotificationPreferences } from './entities/notification-preferences.entity';
import { User } from '../user/entities/user.entity';
import { EmailService } from '../auth/email.service';

/**
 * DTO for creating a notification
 */
export interface CreateNotificationDto {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  priority?: NotificationPriority;
  actionUrl?: string;
  channel?: NotificationChannel;
}

/**
 * Main notification service handling both email and in-app notifications
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationPreferences)
    private readonly preferencesRepository: Repository<NotificationPreferences>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Send a notification based on user preferences
   */
  async sendNotification(dto: CreateNotificationDto): Promise<Notification | null> {
    const user = await this.userRepository.findOne({ where: { id: dto.userId } });
    
    if (!user) {
      this.logger.warn(`User ${dto.userId} not found for notification`);
      return null;
    }

    // Get or create user preferences
    let preferences = await this.getPreferences(user.id);

    // Check if notification is allowed
    const allowInApp = preferences.isInAppAllowed(dto.type);
    const allowEmail = preferences.isEmailAllowed(dto.type);

    if (!allowInApp && !allowEmail) {
      this.logger.debug(`Notification ${dto.type} blocked by user preferences for user ${user.id}`);
      return null;
    }

    // Determine channel
    const channel = dto.channel || (allowInApp ? NotificationChannel.IN_APP : NotificationChannel.EMAIL);

    // Create in-app notification if allowed
    let notification: Notification | null = null;
    if (allowInApp || channel === NotificationChannel.BOTH) {
      notification = await this.createInAppNotification({
        ...dto,
        channel: channel === NotificationChannel.BOTH ? NotificationChannel.BOTH : NotificationChannel.IN_APP,
      });
    }

    // Send email if allowed
    if (allowEmail || channel === NotificationChannel.BOTH) {
      await this.sendEmailNotification(user, dto);
      
      if (notification) {
        notification.channel = NotificationChannel.BOTH;
        await this.notificationRepository.save(notification);
      }
    }

    return notification;
  }

  /**
   * Create an in-app notification
   */
  async createInAppNotification(dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepository.create({
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      message: dto.message,
      data: dto.data,
      priority: dto.priority || NotificationPriority.MEDIUM,
      channel: dto.channel || NotificationChannel.IN_APP,
      actionUrl: dto.actionUrl,
    });

    await this.notificationRepository.save(notification);

    this.logger.log(`In-app notification created: ${dto.type} for user ${dto.userId}`);

    return notification;
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(user: User, dto: CreateNotificationDto): Promise<void> {
    try {
      if (!user.email) {
        this.logger.debug(`User ${user.id} has no email address, skipping email notification`);
        return;
      }

      // Use existing email service - extend it later with templates
      const info = await this.emailService.sendMail({
        to: user.email,
        subject: dto.title,
        html: this.renderEmailTemplate(dto),
        text: dto.message,
      });

      this.logger.log(`Email notification sent to ${user.email}: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to send email notification: ${error.message}`, error.stack);
    }
  }

  /**
   * Render email template for notification
   */
  private renderEmailTemplate(dto: CreateNotificationDto): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${this.escapeHtml(dto.title)}</h1>
            </div>
            <div class="content">
              <p>${this.escapeHtml(dto.message)}</p>
              ${dto.actionUrl ? `<p style="text-align: center;"><a href="${dto.actionUrl}" class="button">View Details</a></p>` : ''}
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} StellAIverse. All rights reserved.</p>
              <p>You're receiving this because you enabled notifications for this type.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Get or create user notification preferences
   */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    let preferences = await this.preferencesRepository.findOne({ where: { userId } });

    if (!preferences) {
      preferences = this.preferencesRepository.create({
        userId,
        emailEnabled: true,
        inAppEnabled: true,
        emailNotificationTypes: [],
        inAppNotificationTypes: [],
        referralNotificationsEnabled: true,
        marketingNotificationsEnabled: false,
        systemNotificationsEnabled: true,
      });

      await this.preferencesRepository.save(preferences);
    }

    return preferences;
  }

  /**
   * Update user notification preferences
   */
  async updatePreferences(
    userId: string,
    updates: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const preferences = await this.getPreferences(userId);

    Object.assign(preferences, updates);
    await this.preferencesRepository.save(preferences);

    this.logger.log(`Notification preferences updated for user ${userId}`);

    return preferences;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new Error('Notification not found');
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await this.notificationRepository.save(notification);

    return notification;
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
  }

  /**
   * Get unread notifications for a user
   */
  async getUnreadNotifications(userId: string, limit = 20): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: { userId, isRead: false },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get recent notifications for a user
   */
  async getNotifications(userId: string, limit = 50): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    await this.notificationRepository.delete({ id: notificationId, userId });
  }

  /**
   * Clean up old notifications (older than 90 days)
   */
  async cleanupOldNotifications(daysOld = 90): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.notificationRepository
      .createQueryBuilder('notification')
      .delete()
      .where('notification.createdAt < :cutoffDate', { cutoffDate })
      .andWhere('notification.isRead = :isRead', { isRead: true })
      .execute();

    this.logger.log(`Cleaned up ${result.affected} old notifications`);
  }
}
