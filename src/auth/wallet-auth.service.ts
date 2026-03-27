import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { verifyMessage } from "ethers";
import { ChallengeService } from "./challenge.service";
import { User } from "../user/entities/user.entity";
import { Wallet, WalletStatus, WalletType } from "./entities/wallet.entity";

export interface AuthPayload {
  address: string;
  email?: string;
  role?: string;
  roles?: string[];
  iat: number;
}

@Injectable()
export class WalletAuthService {
  private readonly logger = new Logger(WalletAuthService.name);

  constructor(
    private challengeService: ChallengeService,
    private jwtService: JwtService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
  ) {}

  /**
   * Verify a signed message and return JWT token if valid
   */
  async verifySignatureAndIssueToken(
    message: string,
    signature: string,
  ): Promise<{ token: string; address: string }> {
    // Extract challenge ID from message
    const challengeId = this.challengeService.extractChallengeId(message);
    if (!challengeId) {
      throw new UnauthorizedException("Invalid challenge message format");
    }

    // Get and consume the challenge
    const challenge = this.challengeService.consumeChallenge(challengeId);
    if (!challenge) {
      throw new UnauthorizedException(
        "Challenge not found or expired. Please request a new challenge.",
      );
    }

    // Verify the signature
    let recoveredAddress: string;
    try {
      recoveredAddress = verifyMessage(message, signature);
    } catch (error) {
      throw new UnauthorizedException("Invalid signature");
    }

    // Verify the recovered address matches the challenge address
    if (recoveredAddress.toLowerCase() !== challenge.address) {
      throw new UnauthorizedException(
        "Signature does not match challenge address",
      );
    }

    // Fetch user to get email if linked
    const user = await this.userRepository.findOne({
      where: { walletAddress: recoveredAddress.toLowerCase() },
    });

    // Issue JWT token with email and role if available
    const payload: AuthPayload = {
      address: recoveredAddress.toLowerCase(),
      email: user?.emailVerified ? user.email : undefined,
      role: user?.role || "user",
      iat: Math.floor(Date.now() / 1000),
    };

    const token = this.jwtService.sign(payload);

    return {
      token,
      address: recoveredAddress.toLowerCase(),
    };
  }

  /**
   * Validate JWT token and return payload
   */
  validateToken(token: string): AuthPayload {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException("Invalid token");
    }
  }

  /**
   * Link a new wallet to an existing user account (Multi-wallet support)
   * Requires authentication and signature verification
   */
  async linkWallet(
    currentUserId: string,
    newWalletAddress: string,
    message: string,
    signature: string,
    walletName?: string,
    clientInfo?: { ip?: string; userAgent?: string },
  ): Promise<{ message: string; walletId: string; walletAddress: string; type: WalletType }> {
    // Normalize address
    const normalizedNew = newWalletAddress.toLowerCase();

    // Verify the signature for the new wallet
    const challengeId = this.challengeService.extractChallengeId(message);
    if (!challengeId) {
      throw new UnauthorizedException("Invalid challenge message format");
    }

    const challenge = this.challengeService.consumeChallenge(challengeId);
    if (!challenge) {
      throw new UnauthorizedException(
        "Challenge not found or expired. Please request a new challenge.",
      );
    }

    let recoveredAddress: string;
    try {
      recoveredAddress = verifyMessage(message, signature);
    } catch (error) {
      throw new UnauthorizedException("Invalid signature");
    }

    if (recoveredAddress.toLowerCase() !== normalizedNew) {
      throw new UnauthorizedException(
        "Signature does not match the new wallet address",
      );
    }

    // Check if wallet is already linked to any user
    const existingWallet = await this.walletRepository.findOne({
      where: { address: normalizedNew },
    });

    if (existingWallet) {
      if (existingWallet.userId === currentUserId) {
        throw new ConflictException("This wallet is already linked to your account");
      }
      throw new ConflictException(
        "This wallet address is already linked to another account",
      );
    }

    // Get user's existing wallets to determine type
    const existingWallets = await this.walletRepository.find({
      where: { userId: currentUserId },
    });

    const isFirstWallet = existingWallets.length === 0;
    const walletType = isFirstWallet ? WalletType.PRIMARY : WalletType.SECONDARY;

    // Create new wallet record
    const wallet = this.walletRepository.create({
      address: normalizedNew,
      userId: currentUserId,
      type: walletType,
      status: WalletStatus.ACTIVE,
      isPrimary: isFirstWallet,
      name: walletName || `Wallet ${existingWallets.length + 1}`,
      verificationSignature: signature,
      verificationChallenge: message,
      verifiedAt: new Date(),
      linkedIp: clientInfo?.ip,
      linkedUserAgent: clientInfo?.userAgent,
    });

    await this.walletRepository.save(wallet);

    // If this is the first wallet, update user's primary wallet address
    if (isFirstWallet) {
      await this.userRepository.update(
        { id: currentUserId },
        { walletAddress: normalizedNew },
      );
    }

    this.logger.log(`Wallet linked: ${normalizedNew} for user ${currentUserId}`);

    return {
      message: "Wallet successfully linked",
      walletId: wallet.id,
      walletAddress: normalizedNew,
      type: wallet.type,
    };
  }

  /**
   * Get all wallets for a user
   */
  async getUserWallets(userId: string): Promise<Wallet[]> {
    return this.walletRepository.find({
      where: { userId },
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
  }

  /**
   * Get a specific wallet for a user
   */
  async getWallet(walletId: string, userId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId, userId },
    });

    if (!wallet) {
      throw new NotFoundException("Wallet not found");
    }

    return wallet;
  }

  /**
   * Set a wallet as primary
   */
  async setPrimaryWallet(
    walletId: string,
    userId: string,
  ): Promise<{ message: string; walletId: string }> {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId, userId },
    });

    if (!wallet) {
      throw new NotFoundException("Wallet not found");
    }

    if (wallet.status !== WalletStatus.ACTIVE) {
      throw new BadRequestException("Wallet must be active to set as primary");
    }

    // Unset current primary
    await this.walletRepository.update(
      { userId, isPrimary: true },
      { isPrimary: false },
    );

    // Set new primary
    wallet.isPrimary = true;
    wallet.type = WalletType.PRIMARY;
    await this.walletRepository.save(wallet);

    // Update user's primary wallet address
    await this.userRepository.update(
      { id: userId },
      { walletAddress: wallet.address },
    );

    return {
      message: "Primary wallet updated",
      walletId: wallet.id,
    };
  }

  /**
   * Unlink a wallet from user account (Multi-wallet support)
   * Requires authentication and prevents unlinking the last wallet without recovery setup
   */
  async unlinkWallet(
    userId: string,
    walletId: string,
  ): Promise<{ message: string; walletId: string }> {
    // Get wallet to unlink
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId, userId },
    });

    if (!wallet) {
      throw new NotFoundException("Wallet not found");
    }

    // Get user's active wallets
    const activeWallets = await this.walletRepository.find({
      where: { userId, status: WalletStatus.ACTIVE },
    });

    // Prevent unlinking the last active wallet without recovery setup
    if (activeWallets.length === 1) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user?.emailVerified) {
        throw new BadRequestException(
          "Cannot unlink your only wallet without verified email for recovery",
        );
      }
    }

    // Mark wallet as unlinked
    wallet.status = WalletStatus.UNLINKED;
    await this.walletRepository.save(wallet);

    // If this was the primary wallet, set a new primary
    if (wallet.isPrimary) {
      const remainingWallet = await this.walletRepository.findOne({
        where: { userId, status: WalletStatus.ACTIVE, id: walletId },
        order: { createdAt: 'ASC' },
      });

      if (remainingWallet) {
        remainingWallet.isPrimary = true;
        remainingWallet.type = WalletType.PRIMARY;
        await this.walletRepository.save(remainingWallet);

        await this.userRepository.update(
          { id: userId },
          { walletAddress: remainingWallet.address },
        );
      }
    }

    this.logger.log(`Wallet unlinked: ${wallet.address} for user ${userId}`);

    return {
      message: "Wallet successfully unlinked",
      walletId: wallet.id,
    };
  }

  /**
   * Recover wallet access using verified email
   * Issues a new challenge for wallet authentication
   */
  async recoverWallet(
    email: string,
    recoveryToken: string,
  ): Promise<{ message: string; walletAddress: string; challenge: string }> {
    const normalizedEmail = email.toLowerCase();

    // Find user by email
    const user = await this.userRepository.findOne({
      where: { email: normalizedEmail, emailVerified: true },
    });

    if (!user) {
      throw new BadRequestException(
        "No verified account found with this email",
      );
    }

    // In production, verify the recovery token
    // For now, we'll issue a challenge for the wallet
    const challengeMessage = this.challengeService.issueChallengeForAddress(
      user.walletAddress,
    );

    return {
      message: "Recovery initiated. Sign the challenge with your wallet.",
      walletAddress: user.walletAddress,
      challenge: challengeMessage,
    };
  }
}
