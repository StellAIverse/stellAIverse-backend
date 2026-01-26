import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomBytes } from "crypto";
import { User } from "../user/entities/user.entity";
import { EmailVerification } from "./entities/email-verification.entity";
import { EmailService } from "./email.service";

@Injectable()
export class EmailLinkingService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(EmailVerification)
    private emailVerificationRepository: Repository<EmailVerification>,
    private emailService: EmailService,
  ) {}

  /**
   * Initiate email linking process
   * Generates verification token and sends email
   */
  async initiateEmailLinking(
    walletAddress: string,
    email: string,
  ): Promise<{ message: string; previewUrl?: string }> {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestException("Invalid email format");
    }

    // Normalize addresses
    const normalizedWallet = walletAddress.toLowerCase();
    const normalizedEmail = email.toLowerCase();

    // Check if email is already linked to another wallet
    const existingEmailUser = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (
      existingEmailUser &&
      existingEmailUser.walletAddress !== normalizedWallet
    ) {
      throw new ConflictException("Email is already linked to another wallet");
    }

    // Find or create user
    let user = await this.userRepository.findOne({
      where: { walletAddress: normalizedWallet },
    });

    if (!user) {
      user = this.userRepository.create({
        walletAddress: normalizedWallet,
        email: null,
        emailVerified: false,
      });
      await this.userRepository.save(user);
    }

    // Check if email is already verified for this wallet
    if (user.email === normalizedEmail && user.emailVerified) {
      throw new ConflictException("Email is already verified for this wallet");
    }

    // Generate verification token (32 bytes = 64 hex characters)
    const token = randomBytes(32).toString("hex");

    // Delete any existing verification tokens for this wallet
    await this.emailVerificationRepository.delete({
      walletAddress: normalizedWallet,
    });

    // Create new verification record
    const verification = this.emailVerificationRepository.create({
      email: normalizedEmail,
      token,
      walletAddress: normalizedWallet,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    });

    await this.emailVerificationRepository.save(verification);

    // Send verification email
    const emailResult = await this.emailService.sendVerificationEmail(
      normalizedEmail,
      token,
    );

    return {
      message: "Verification email sent. Please check your inbox.",
      previewUrl: emailResult.previewUrl,
    };
  }

  /**
   * Verify email token and link email to wallet
   */
  async verifyEmailAndLink(token: string): Promise<{
    message: string;
    walletAddress: string;
    email: string;
  }> {
    // Find verification record
    const verification = await this.emailVerificationRepository.findOne({
      where: { token },
    });

    if (!verification) {
      throw new NotFoundException("Invalid or expired verification token");
    }

    // Check if token is expired
    if (new Date() > verification.expiresAt) {
      await this.emailVerificationRepository.delete({ token });
      throw new UnauthorizedException("Verification token has expired");
    }

    // Find user
    const user = await this.userRepository.findOne({
      where: { walletAddress: verification.walletAddress },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Update user with verified email
    user.email = verification.email;
    user.emailVerified = true;
    await this.userRepository.save(user);

    // Delete verification record
    await this.emailVerificationRepository.delete({ token });

    return {
      message: "Email successfully verified and linked to wallet",
      walletAddress: user.walletAddress,
      email: user.email,
    };
  }

  /**
   * Get account information for a wallet
   */
  async getAccountInfo(walletAddress: string): Promise<{
    walletAddress: string;
    email: string | null;
    emailVerified: boolean;
  }> {
    const normalizedWallet = walletAddress.toLowerCase();

    const user = await this.userRepository.findOne({
      where: { walletAddress: normalizedWallet },
    });

    if (!user) {
      // Return default info for wallets without linked email
      return {
        walletAddress: normalizedWallet,
        email: null,
        emailVerified: false,
      };
    }

    return {
      walletAddress: user.walletAddress,
      email: user.email,
      emailVerified: user.emailVerified,
    };
  }

  /**
   * Unlink email from wallet
   */
  async unlinkEmail(walletAddress: string): Promise<{ message: string }> {
    const normalizedWallet = walletAddress.toLowerCase();

    const user = await this.userRepository.findOne({
      where: { walletAddress: normalizedWallet },
    });

    if (!user || !user.email) {
      throw new NotFoundException("No email linked to this wallet");
    }

    // Remove email
    user.email = null;
    user.emailVerified = false;
    await this.userRepository.save(user);

    // Delete any pending verifications
    await this.emailVerificationRepository.delete({
      walletAddress: normalizedWallet,
    });

    return {
      message: "Email successfully unlinked from wallet",
    };
  }

  /**
   * Get user by email (for recovery)
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase();
    return this.userRepository.findOne({
      where: { email: normalizedEmail, emailVerified: true },
    });
  }
}
