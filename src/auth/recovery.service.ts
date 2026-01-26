import { Injectable, NotFoundException } from '@nestjs/common';
import { EmailLinkingService } from './email-linking.service';
import { EmailService } from './email.service';
import { ChallengeService } from './challenge.service';

@Injectable()
export class RecoveryService {
  constructor(
    private emailLinkingService: EmailLinkingService,
    private emailService: EmailService,
    private challengeService: ChallengeService,
  ) {}

  /**
   * Request account recovery
   * Sends recovery email with wallet address information
   */
  async requestRecovery(email: string): Promise<{
    message: string;
    previewUrl?: string;
  }> {
    const normalizedEmail = email.toLowerCase();

    // Find user by email
    const user = await this.emailLinkingService.getUserByEmail(normalizedEmail);

    if (!user) {
      throw new NotFoundException(
        'No verified account found with this email address',
      );
    }

    // Send recovery email
    const emailResult = await this.emailService.sendRecoveryEmail(
      normalizedEmail,
      user.walletAddress,
    );

    return {
      message: 'Recovery information sent to your email',
      previewUrl: emailResult.previewUrl,
    };
  }

  /**
   * Verify recovery and get challenge for wallet authentication
   * This allows users to authenticate using their email-linked wallet
   */
  async verifyRecoveryAndGetChallenge(email: string): Promise<{
    message: string;
    walletAddress: string;
  }> {
    const normalizedEmail = email.toLowerCase();

    // Find user by email
    const user = await this.emailLinkingService.getUserByEmail(normalizedEmail);

    if (!user) {
      throw new NotFoundException(
        'No verified account found with this email address',
      );
    }

    // Issue challenge for the wallet
    const challengeMessage = this.challengeService.issueChallengeForAddress(
      user.walletAddress,
    );

    return {
      message: challengeMessage,
      walletAddress: user.walletAddress,
    };
  }
}
