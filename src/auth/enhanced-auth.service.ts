import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcrypt";
import { JwtService } from "@nestjs/jwt";
import * as speakeasy from "speakeasy";
import * as qrcode from "qrcode";
import { User } from "../../user/entities/user.entity";
import { RefreshToken, TwoFactorAuth, TwoFactorType, TwoFactorStatus } from "../entities/auth.entity";
import { RegisterDto, LoginDto } from "../dto/auth.dto";
import { RefreshTokenDto, TwoFactorSetupDto, TwoFactorVerifyDto } from "../dto/kyc.dto";
import { EmailService } from "./email.service";

@Injectable()
export class EnhancedAuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(TwoFactorAuth)
    private readonly twoFactorRepository: Repository<TwoFactorAuth>,
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => EmailService))
    private readonly emailService: EmailService,
  ) {}

  async register(
    registerDto: RegisterDto,
    ipAddress: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: Partial<User>; requiresTwoFactor?: boolean }> {
    const { email, password, username } = registerDto;

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: [{ email }, { username }],
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new ConflictException("Email already registered");
      }
      if (existingUser.username === username) {
        throw new ConflictException("Username already taken");
      }
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = this.userRepository.create({
      email,
      password: hashedPassword,
      username,
      walletAddress: `email_${email}`, // Generate a pseudo wallet address for email users
      emailVerified: false,
      isActive: true,
    });

    await this.userRepository.save(user);

    // Generate tokens
    const tokens = await this.generateTokens(user, ipAddress, userAgent);

    // Check if 2FA is required
    const twoFactorEnabled = await this.isTwoFactorEnabled(user.id);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        kycStatus: user.kycStatus,
      },
      requiresTwoFactor: twoFactorEnabled,
    };
  }

  async login(
    loginDto: LoginDto,
    ipAddress: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: Partial<User>; requiresTwoFactor?: boolean }> {
    const { email, password } = loginDto;

    // Find user by email
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (!user.isActive) {
      throw new UnauthorizedException("Account is deactivated");
    }

    // Check if user has a password (traditional auth user)
    if (!user.password) {
      throw new BadRequestException(
        "This account uses wallet authentication. Please use wallet login.",
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Update last login
    await this.userRepository.update(user.id, { lastLoginAt: new Date() });

    // Generate tokens
    const tokens = await this.generateTokens(user, ipAddress, userAgent);

    // Check if 2FA is required
    const twoFactorEnabled = await this.isTwoFactorEnabled(user.id);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        kycStatus: user.kycStatus,
      },
      requiresTwoFactor: twoFactorEnabled,
    };
  }

  async refreshToken(
    refreshTokenDto: RefreshTokenDto,
    ipAddress: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const { refreshToken } = refreshTokenDto;

    // Find and validate refresh token
    const tokenEntity = await this.refreshTokenRepository.findOne({
      where: { token: refreshToken, revoked: false },
      relations: ["user"],
    });

    if (!tokenEntity || tokenEntity.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    // Generate new tokens
    const newTokens = await this.generateTokens(tokenEntity.user, ipAddress, userAgent);

    // Revoke old refresh token
    await this.refreshTokenRepository.update(tokenEntity.id, {
      revoked: true,
      revokedAt: new Date(),
      replacedByToken: newTokens.refreshToken,
    });

    return {
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
    };
  }

  async setupTwoFactor(
    userId: string,
    setupDto: TwoFactorSetupDto,
  ): Promise<{ secret: string; qrCodeUrl: string; backupCodes: string[] }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Check if 2FA is already enabled
    const existing2FA = await this.twoFactorRepository.findOne({
      where: { userId, isEnabled: true },
    });

    if (existing2FA) {
      throw new BadRequestException("Two-factor authentication is already enabled");
    }

    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `StellAIverse (${user.email})`,
      issuer: "StellAIverse",
    });

    // Generate QR code
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    // Save 2FA setup
    const twoFactor = this.twoFactorRepository.create({
      userId,
      type: TwoFactorType.TOTP,
      status: TwoFactorStatus.PENDING,
      secret: secret.base32,
      backupCodes: JSON.stringify(backupCodes),
      isEnabled: false,
    });

    await this.twoFactorRepository.save(twoFactor);

    return {
      secret: secret.base32,
      qrCodeUrl,
      backupCodes,
    };
  }

  async verifyTwoFactorSetup(
    userId: string,
    code: string,
  ): Promise<{ success: boolean }> {
    const twoFactor = await this.twoFactorRepository.findOne({
      where: { userId, status: TwoFactorStatus.PENDING },
    });

    if (!twoFactor) {
      throw new NotFoundException("Two-factor authentication setup not found");
    }

    // Verify TOTP code
    const verified = speakeasy.totp.verify({
      secret: twoFactor.secret,
      encoding: "base32",
      token: code,
      window: 2, // Allow 2 time steps (30 seconds) tolerance
    });

    if (verified) {
      await this.twoFactorRepository.update(twoFactor.id, {
        status: TwoFactorStatus.VERIFIED,
        isEnabled: true,
        verifiedAt: new Date(),
      });
    }

    return { success: verified };
  }

  async verifyTwoFactorLogin(
    userId: string,
    verifyDto: TwoFactorVerifyDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const twoFactor = await this.twoFactorRepository.findOne({
      where: { userId, isEnabled: true },
    });

    if (!twoFactor) {
      throw new BadRequestException("Two-factor authentication not enabled");
    }

    let verified = false;

    if (verifyDto.code) {
      // Verify TOTP code
      verified = speakeasy.totp.verify({
        secret: twoFactor.secret,
        encoding: "base32",
        token: verifyDto.code,
        window: 2,
      });
    } else if (verifyDto.backupCode) {
      // Verify backup code
      const backupCodes = JSON.parse(twoFactor.backupCodes || "[]");
      const codeIndex = backupCodes.indexOf(verifyDto.backupCode);

      if (codeIndex !== -1) {
        verified = true;
        // Remove used backup code
        backupCodes.splice(codeIndex, 1);
        await this.twoFactorRepository.update(twoFactor.id, {
          backupCodes: JSON.stringify(backupCodes),
        });
      }
    }

    if (!verified) {
      throw new UnauthorizedException("Invalid two-factor authentication code");
    }

    // Update last used
    await this.twoFactorRepository.update(twoFactor.id, {
      lastUsedAt: new Date(),
    });

    // Get user and generate final tokens
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const tokens = await this.generateTokens(user, "127.0.0.1", "2FA Verification");

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async disableTwoFactor(userId: string, password: string): Promise<{ success: boolean }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.password) {
      throw new NotFoundException("User not found");
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid password");
    }

    // Disable 2FA
    await this.twoFactorRepository.update(
      { userId },
      { isEnabled: false, status: TwoFactorStatus.DISABLED },
    );

    return { success: true };
  }

  private async generateTokens(
    user: User,
    ipAddress: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Generate access token
    const payload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload, { expiresIn: "15m" });

    // Generate refresh token
    const refreshTokenValue = this.generateRefreshToken();
    const refreshTokenEntity = this.refreshTokenRepository.create({
      userId: user.id,
      token: refreshTokenValue,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      ipAddress,
      userAgent,
    });

    await this.refreshTokenRepository.save(refreshTokenEntity);

    return {
      accessToken,
      refreshToken: refreshTokenValue,
    };
  }

  private generateRefreshToken(): string {
    return require("crypto").randomBytes(64).toString("hex");
  }

  private generateBackupCodes(): string[] {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      codes.push(require("crypto").randomBytes(4).toString("hex").toUpperCase());
    }
    return codes;
  }

  private async isTwoFactorEnabled(userId: string): Promise<boolean> {
    const twoFactor = await this.twoFactorRepository.findOne({
      where: { userId, isEnabled: true },
    });
    return !!twoFactor;
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, revoked: false },
      { revoked: true, revokedAt: new Date() },
    );
  }

  async validateUser(userId: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }
}</content>
<parameter name="filePath">/workspaces/stellAIverse-backend/src/auth/enhanced-auth.service.ts