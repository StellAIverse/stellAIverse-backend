import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHash, scryptSync } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { Wallet, WalletStatus } from './entities/wallet.entity';
import { User } from '../user/entities/user.entity';
import { ChallengeService } from './challenge.service';
import { EmailService } from './email.service';

export interface RecoveryMethod {
  type: 'backup_code' | 'email' | 'social';
  identifier: string;
  verified: boolean;
}

export interface RecoverySession {
  id: string;
  userId: string;
  walletId: string;
  method: RecoveryMethod;
  expiresAt: Date;
  attempts: number;
  verified: boolean;
}

@Injectable()
export class SessionRecoveryService {
  private readonly logger = new Logger(SessionRecoveryService.name);
  private readonly recoverySessions = new Map<string, RecoverySession>();
  private readonly MAX_ATTEMPTS = 3;
  private readonly SESSION_EXPIRY = 15 * 60 * 1000; // 15 minutes
  private readonly RECOVERY_CODE_LENGTH = 12;

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly challengeService: ChallengeService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Generate backup recovery codes for a wallet
   * Returns plaintext codes that user must save securely
   */
  async generateBackupCodes(
    walletId: string,
    userId: string,
  ): Promise<{ codes: string[]; hashedCodes: string[] }> {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId, userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Generate 10 recovery codes
    const codes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < 10; i++) {
      const code = this.generateRecoveryCode();
      const hashedCode = this.hashRecoveryCode(code);
      codes.push(code);
      hashedCodes.push(hashedCode);
    }

    // Store hashed codes in wallet
    wallet.recoveryCodeHash = hashedCodes.join(',');
    wallet.recoveryEnabled = true;
    await this.walletRepository.save(wallet);

    this.logger.log(`Generated backup codes for wallet ${walletId}`);

    return { codes, hashedCodes };
  }

  /**
   * Initiate session recovery using backup code
   */
  async initiateBackupCodeRecovery(
    walletAddress: string,
    backupCode: string,
    clientInfo?: { ip?: string; userAgent?: string },
  ): Promise<{
    sessionId: string;
    message: string;
    challenge: string;
  }> {
    const normalizedAddress = walletAddress.toLowerCase();

    const wallet = await this.walletRepository.findOne({
      where: { address: normalizedAddress, status: WalletStatus.ACTIVE },
      relations: ['user'],
    });

    if (!wallet || !wallet.recoveryEnabled) {
      throw new UnauthorizedException('Recovery not enabled for this wallet');
    }

    // Verify backup code
    const hashedInput = this.hashRecoveryCode(backupCode);
    const storedHashes = wallet.recoveryCodeHash?.split(',') || [];

    if (!storedHashes.includes(hashedInput)) {
      await this.auditRecoveryAttempt(wallet.id, 'backup_code', false, clientInfo);
      throw new UnauthorizedException('Invalid recovery code');
    }

    // Remove used code (one-time use)
    const updatedHashes = storedHashes.filter((h) => h !== hashedInput);
    wallet.recoveryCodeHash = updatedHashes.join(',');
    await this.walletRepository.save(wallet);

    // Create recovery session
    const sessionId = this.generateSessionId();
    const session: RecoverySession = {
      id: sessionId,
      userId: wallet.userId,
      walletId: wallet.id,
      method: { type: 'backup_code', identifier: walletAddress, verified: true },
      expiresAt: new Date(Date.now() + this.SESSION_EXPIRY),
      attempts: 0,
      verified: true,
    };

    this.recoverySessions.set(sessionId, session);

    // Issue challenge for wallet authentication
    const challenge = this.challengeService.issueChallengeForAddress(normalizedAddress);

    await this.auditRecoveryAttempt(wallet.id, 'backup_code', true, clientInfo);

    this.logger.log(`Backup code recovery initiated for wallet ${walletAddress}`);

    return {
      sessionId,
      message: 'Recovery verified. Sign the challenge to complete authentication.',
      challenge,
    };
  }

  /**
   * Initiate session recovery using email
   */
  async initiateEmailRecovery(
    email: string,
    clientInfo?: { ip?: string; userAgent?: string },
  ): Promise<{
    sessionId: string;
    message: string;
  }> {
    const normalizedEmail = email.toLowerCase();

    const user = await this.userRepository.findOne({
      where: { email: normalizedEmail, emailVerified: true },
    });

    if (!user) {
      // Don't reveal if email exists
      throw new UnauthorizedException('Recovery email sent if account exists');
    }

    // Get primary wallet
    const wallet = await this.walletRepository.findOne({
      where: { userId: user.id, isPrimary: true, status: WalletStatus.ACTIVE },
    });

    if (!wallet) {
      throw new UnauthorizedException('No active wallet found for recovery');
    }

    // Create recovery session
    const sessionId = this.generateSessionId();
    const verificationCode = this.generateVerificationCode();

    const session: RecoverySession = {
      id: sessionId,
      userId: user.id,
      walletId: wallet.id,
      method: { type: 'email', identifier: normalizedEmail, verified: false },
      expiresAt: new Date(Date.now() + this.SESSION_EXPIRY),
      attempts: 0,
      verified: false,
    };

    this.recoverySessions.set(sessionId, session);

    // Send recovery email
    await this.emailService.sendRecoveryEmail(normalizedEmail, verificationCode);

    this.logger.log(`Email recovery initiated for user ${user.id}`);

    return {
      sessionId,
      message: 'Recovery email sent if account exists',
    };
  }

  /**
   * Verify email recovery code
   */
  async verifyEmailRecoveryCode(
    sessionId: string,
    code: string,
    clientInfo?: { ip?: string; userAgent?: string },
  ): Promise<{
    verified: boolean;
    message: string;
    challenge?: string;
  }> {
    const session = this.getValidSession(sessionId);

    if (!session) {
      throw new UnauthorizedException('Invalid or expired recovery session');
    }

    if (session.method.type !== 'email') {
      throw new BadRequestException('Invalid recovery method');
    }

    if (session.attempts >= this.MAX_ATTEMPTS) {
      this.recoverySessions.delete(sessionId);
      throw new UnauthorizedException('Too many failed attempts. Please start over.');
    }

    session.attempts++;

    // Verify code (in production, this would check against stored code)
    const isValid = await this.verifyRecoveryCode(session, code);

    if (!isValid) {
      await this.auditRecoveryAttempt(session.walletId, 'email', false, clientInfo);
      throw new UnauthorizedException('Invalid verification code');
    }

    session.verified = true;
    session.method.verified = true;

    // Get wallet for challenge
    const wallet = await this.walletRepository.findOne({
      where: { id: session.walletId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const challenge = this.challengeService.issueChallengeForAddress(wallet.address);

    await this.auditRecoveryAttempt(session.walletId, 'email', true, clientInfo);

    return {
      verified: true,
      message: 'Recovery verified. Sign the challenge to complete authentication.',
      challenge,
    };
  }

  /**
   * Complete recovery and issue new JWT token
   */
  async completeRecovery(
    sessionId: string,
    message: string,
    signature: string,
  ): Promise<{
    token: string;
    walletAddress: string;
    message: string;
  }> {
    const session = this.getValidSession(sessionId);

    if (!session || !session.verified) {
      throw new UnauthorizedException('Recovery session not verified');
    }

    const wallet = await this.walletRepository.findOne({
      where: { id: session.walletId },
      relations: ['user'],
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Verify signature
    const { verifyMessage } = await import('ethers');
    let recoveredAddress: string;

    try {
      recoveredAddress = verifyMessage(message, signature);
    } catch (error) {
      throw new UnauthorizedException('Invalid signature');
    }

    if (recoveredAddress.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new UnauthorizedException('Signature does not match wallet address');
    }

    // Consume challenge
    const challengeId = this.challengeService.extractChallengeId(message);
    const challenge = this.challengeService.consumeChallenge(challengeId);

    if (!challenge) {
      throw new UnauthorizedException('Challenge expired or invalid');
    }

    // Issue new token
    const payload = {
      sub: wallet.userId,
      address: wallet.address,
      email: wallet.user.emailVerified ? wallet.user.email : undefined,
      role: wallet.user.role || 'user',
      iat: Math.floor(Date.now() / 1000),
    };

    const token = this.jwtService.sign(payload);

    // Update wallet last used
    wallet.lastUsedAt = new Date();
    await this.walletRepository.save(wallet);

    // Clear recovery session
    this.recoverySessions.delete(sessionId);

    this.logger.log(`Recovery completed for wallet ${wallet.address}`);

    return {
      token,
      walletAddress: wallet.address,
      message: 'Recovery successful. New session established.',
    };
  }

  /**
   * Cancel recovery session
   */
  async cancelRecovery(sessionId: string): Promise<void> {
    this.recoverySessions.delete(sessionId);
    this.logger.log(`Recovery session ${sessionId} cancelled`);
  }

  /**
   * Get recovery status for a wallet
   */
  async getRecoveryStatus(walletId: string, userId: string): Promise<{
    recoveryEnabled: boolean;
    remainingCodes: number;
    methods: string[];
  }> {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId, userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const remainingCodes = wallet.recoveryCodeHash
      ? wallet.recoveryCodeHash.split(',').length
      : 0;

    const methods: string[] = [];
    if (wallet.recoveryEnabled) {
      methods.push('backup_code');
    }

    // Check if user has verified email
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (user?.emailVerified) {
      methods.push('email');
    }

    return {
      recoveryEnabled: wallet.recoveryEnabled,
      remainingCodes,
      methods,
    };
  }

  /**
   * Generate a random recovery code
   */
  private generateRecoveryCode(): string {
    const bytes = randomBytes(6);
    return bytes.toString('hex').toUpperCase().match(/.{4}/g)!.join('-');
  }

  /**
   * Hash a recovery code for storage
   */
  private hashRecoveryCode(code: string): string {
    const normalized = code.toUpperCase().replace(/-/g, '');
    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Generate a session ID
   */
  private generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Generate a verification code for email recovery
   */
  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Get a valid recovery session
   */
  private getValidSession(sessionId: string): RecoverySession | null {
    const session = this.recoverySessions.get(sessionId);

    if (!session) {
      return null;
    }

    if (Date.now() > session.expiresAt.getTime()) {
      this.recoverySessions.delete(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Verify recovery code (placeholder - implement actual verification)
   */
  private async verifyRecoveryCode(
    session: RecoverySession,
    code: string,
  ): Promise<boolean> {
    // In production, this would verify against a stored code
    // For now, we'll use a simple placeholder
    return code.length === 6 && /^\d+$/.test(code);
  }

  /**
   * Audit recovery attempt
   */
  private async auditRecoveryAttempt(
    walletId: string,
    method: string,
    success: boolean,
    clientInfo?: { ip?: string; userAgent?: string },
  ): Promise<void> {
    this.logger.log(
      `Recovery attempt: wallet=${walletId}, method=${method}, success=${success}, ip=${clientInfo?.ip}`,
    );
    // In production, store this in audit log
  }
}
