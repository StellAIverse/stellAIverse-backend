import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { verifyMessage } from "ethers";
import {
  AuthStrategy,
  AuthResult,
  AuthPayload,
  WalletCredentials,
} from "../interfaces/auth-strategy.interface";
import { ChallengeService } from "../../challenge.service";
import { User } from "../../../user/entities/user.entity";

/**
 * Wallet-based authentication strategy
 * Uses Ethereum wallet signatures for authentication
 */
@Injectable()
export class WalletStrategy implements AuthStrategy {
  readonly name = "wallet";
  private readonly logger = new Logger(WalletStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly challengeService: ChallengeService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Check if wallet strategy is enabled
   */
  get isEnabled(): boolean {
    return this.configService.get<boolean>("AUTH_WALLET_ENABLED", true);
  }

  /**
   * Authenticate using wallet signature
   * @param credentials - Wallet credentials containing message and signature
   * @returns Authentication result with JWT token
   */
  async authenticate(credentials: unknown): Promise<AuthResult> {
    const { message, signature } = credentials as WalletCredentials;

    if (!message || !signature) {
      throw new BadRequestException("Message and signature are required");
    }

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
      type: "wallet",
    };

    const token = this.jwtService.sign(payload);

    this.logger.log(`Wallet authenticated: ${recoveredAddress.toLowerCase()}`);

    return {
      token,
      user: {
        address: recoveredAddress.toLowerCase(),
        email: user?.emailVerified ? user.email : undefined,
        role: user?.role || "user",
        type: "wallet",
      },
    };
  }

  /**
   * Validate a JWT token
   * @param token - The JWT token to validate
   * @returns The decoded payload or null if invalid
   */
  async validateToken(token: string): Promise<AuthPayload | null> {
    try {
      return this.jwtService.verify(token) as AuthPayload;
    } catch (error) {
      this.logger.warn("Token validation failed", error);
      return null;
    }
  }
}
