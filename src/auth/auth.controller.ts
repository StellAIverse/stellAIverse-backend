import {
  Body,
  Controller,
  Post,
  Get,
  Delete,
  UseGuards,
  Request,
  Param,
  Query,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiProperty,
} from "@nestjs/swagger";
import { ChallengeService } from "./challenge.service";
import { WalletAuthService } from "./wallet-auth.service";
import { EmailLinkingService } from "./email-linking.service";
import { RecoveryService } from "./recovery.service";
import { SessionRecoveryService } from "./session-recovery.service";
import { DelegationService, DelegationPermission } from "./delegation.service";
import { JwtAuthGuard } from "./jwt.guard";
import { AuthService } from "./auth.service";
import { RegisterDto, LoginDto } from "./dto/auth.dto";
import { LinkEmailDto } from "./dto/link-email.dto";
import { VerifyEmailDto } from "./dto/verify-email.dto";
import { RequestRecoveryDto } from "./dto/request-recovery.dto";
import { LinkWalletDto } from "./dto/link-wallet.dto";
import { UnlinkWalletDto } from "./dto/unlink-wallet.dto";
import { RecoverWalletDto } from "./dto/recover-wallet.dto";
import { Throttle } from "@nestjs/throttler";
import { SensitiveRateLimit } from "../common/decorators/rate-limit.decorator";
import { Roles, Role } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guard/roles.guard";

export class RequestChallengeDto {
  @ApiProperty({
    description: "Ethereum wallet address",
    example: "0x1234567890abcdef1234567890abcdef1234567890",
    pattern: "^0x[a-fA-F0-9]{40}$",
  })
  address: string;
}

export class VerifySignatureDto {
  @ApiProperty({
    description: "Challenge message to sign",
    example:
      "Sign this message to authenticate with StellAIverse at 2024-02-25T05:30:00.000Z",
  })
  message: string;

  @ApiProperty({
    description: "ECDSA signature of the challenge message",
    example:
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  })
  signature: string;
}

// Auth endpoints are high-value targets — enforce strict per-user/IP limit: 5 req/min
@SensitiveRateLimit('auth')
@ApiTags("Authentication")
@Throttle({ default: { ttl: 60000, limit: 10 } })
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly challengeService: ChallengeService,
    private readonly walletAuthService: WalletAuthService,
    private readonly emailLinkingService: EmailLinkingService,
    private readonly recoveryService: RecoveryService,
    private readonly sessionRecoveryService: SessionRecoveryService,
    private readonly delegationService: DelegationService,
  ) {}

  @Post("challenge")
  @ApiOperation({
    summary: "Request Authentication Challenge",
    description:
      "Request a challenge message to sign for wallet authentication",
    operationId: "requestChallenge",
  })
  @ApiBody({ type: RequestChallengeDto })
  @ApiResponse({
    status: 200,
    description: "Challenge issued successfully",
    schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          example:
            "Sign this message to authenticate with StellAIverse at 2024-02-25T05:30:00.000Z",
        },
        address: {
          type: "string",
          example: "0x1234567890abcdef1234567890abcdef1234567890",
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "Invalid wallet address format",
  })
  @ApiResponse({
    status: 429,
    description: "Too many requests",
  })
  requestChallenge(@Body() dto: RequestChallengeDto) {
    const message = this.challengeService.issueChallengeForAddress(dto.address);
    return {
      message,
      address: dto.address,
    };
  }

  // Wallet Authentication Endpoints

  @Post("verify")
  async verifySignature(@Body() dto: VerifySignatureDto) {
    const result = await this.walletAuthService.verifySignatureAndIssueToken(
      dto.message,
      dto.signature,
    );
    return {
      token: result.token,
      address: result.address,
    };
  }

  // Email Linking Endpoints

  @UseGuards(JwtAuthGuard)
  @Post("link-email")
  async linkEmail(@Request() req, @Body() dto: LinkEmailDto) {
    const walletAddress = req.user.address;
    return this.emailLinkingService.initiateEmailLinking(
      walletAddress,
      dto.email,
    );
  }

  @Post("verify-email")
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.emailLinkingService.verifyEmailAndLink(dto.token);
  }

  @UseGuards(JwtAuthGuard)
  @Get("account-info")
  async getAccountInfo(@Request() req) {
    const walletAddress = req.user.address;
    return this.emailLinkingService.getAccountInfo(walletAddress);
  }

  @UseGuards(JwtAuthGuard)
  @Delete("unlink-email")
  async unlinkEmail(@Request() req) {
    const walletAddress = req.user.address;
    return this.emailLinkingService.unlinkEmail(walletAddress);
  }

  // Recovery Endpoints

  @Post("recovery/request")
  async requestRecovery(@Body() dto: RequestRecoveryDto) {
    return this.recoveryService.requestRecovery(dto.email);
  }

  @Post("recovery/verify")
  async verifyRecovery(@Body() dto: RequestRecoveryDto) {
    return this.recoveryService.verifyRecoveryAndGetChallenge(dto.email);
  }

  // Wallet Management Endpoints

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseGuards(JwtAuthGuard)
  @Post("link-wallet")
  async linkWallet(@Request() req, @Body() dto: LinkWalletDto) {
    const userId = req.user.sub || req.user.id;
    return this.walletAuthService.linkWallet(
      userId,
      dto.walletAddress,
      dto.message,
      dto.signature,
      dto.walletName,
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseGuards(JwtAuthGuard)
  @Post("unlink-wallet")
  async unlinkWallet(@Request() req, @Body() dto: UnlinkWalletDto) {
    const userId = req.user.sub || req.user.id;
    return this.walletAuthService.unlinkWallet(userId, dto.walletId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("wallets")
  async getUserWallets(@Request() req) {
    const userId = req.user.sub || req.user.id;
    return this.walletAuthService.getUserWallets(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("wallets/:walletId")
  async getWallet(@Param("walletId") walletId: string, @Request() req) {
    const userId = req.user.sub || req.user.id;
    return this.walletAuthService.getWallet(walletId, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("wallets/:walletId/set-primary")
  async setPrimaryWallet(@Param("walletId") walletId: string, @Request() req) {
    const userId = req.user.sub || req.user.id;
    return this.walletAuthService.setPrimaryWallet(walletId, userId);
  }

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post("recover-wallet")
  async recoverWallet(@Body() dto: RecoverWalletDto) {
    return this.walletAuthService.recoverWallet(dto.email, dto.recoveryToken);
  }

  // Advanced Session Recovery Endpoints

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post("recovery/backup-code/initiate")
  async initiateBackupCodeRecovery(
    @Body() dto: { walletAddress: string; backupCode: string },
    @Request() req,
  ) {
    return this.sessionRecoveryService.initiateBackupCodeRecovery(
      dto.walletAddress,
      dto.backupCode,
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
  }

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post("recovery/email/initiate")
  async initiateEmailRecovery(@Body() dto: { email: string }, @Request() req) {
    return this.sessionRecoveryService.initiateEmailRecovery(dto.email, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post("recovery/email/verify")
  async verifyEmailRecoveryCode(
    @Body() dto: { sessionId: string; code: string },
    @Request() req,
  ) {
    return this.sessionRecoveryService.verifyEmailRecoveryCode(
      dto.sessionId,
      dto.code,
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
  }

  @Post("recovery/complete")
  async completeRecovery(
    @Body() dto: { sessionId: string; message: string; signature: string },
  ) {
    return this.sessionRecoveryService.completeRecovery(
      dto.sessionId,
      dto.message,
      dto.signature,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get("recovery/status/:walletId")
  async getRecoveryStatus(@Param("walletId") walletId: string, @Request() req) {
    const userId = req.user.sub || req.user.id;
    return this.sessionRecoveryService.getRecoveryStatus(walletId, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("recovery/backup-code/generate")
  async generateBackupCodes(@Body() dto: { walletId: string }, @Request() req) {
    const userId = req.user.sub || req.user.id;
    return this.sessionRecoveryService.generateBackupCodes(
      dto.walletId,
      userId,
    );
  }

  // Delegation Endpoints

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post("delegation/request")
  async requestDelegation(
    @Body()
    dto: {
      delegatorWalletId: string;
      delegateAddress: string;
      permissions: DelegationPermission[];
      expiresAt: string;
    },
    @Request() req,
  ) {
    const userId = req.user.sub || req.user.id;
    return this.delegationService.requestDelegation(
      userId,
      {
        delegatorWalletId: dto.delegatorWalletId,
        delegateAddress: dto.delegateAddress,
        permissions: dto.permissions,
        expiresAt: new Date(dto.expiresAt),
      },
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post("delegation/complete")
  async completeDelegation(
    @Body() dto: { delegateWalletId: string; signature: string },
    @Request() req,
  ) {
    const userId = req.user.sub || req.user.id;
    return this.delegationService.completeDelegation(
      userId,
      dto.delegateWalletId,
      dto.signature,
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post("delegation/:delegationId/revoke")
  async revokeDelegation(
    @Param("delegationId") delegationId: string,
    @Request() req,
  ) {
    const userId = req.user.sub || req.user.id;
    return this.delegationService.revokeDelegation(userId, delegationId, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get("delegations")
  async getUserDelegations(@Request() req) {
    const userId = req.user.sub || req.user.id;
    return this.delegationService.getUserDelegations(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("delegations/wallet/:walletId")
  async getWalletDelegations(
    @Param("walletId") walletId: string,
    @Request() req,
  ) {
    const userId = req.user.sub || req.user.id;
    return this.delegationService.getWalletDelegations(walletId, userId);
  }

  // Admin Endpoints (RBAC protected)

  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get("admin/users")
  async listUsers() {
    // Example admin-only endpoint
    return { message: "Admin access granted. User listing would go here." };
  }

  @Roles(Role.ADMIN, Role.OPERATOR)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get("admin/stats")
  async getStats() {
    // Example operator/admin endpoint
    return { message: "Stats access granted for admin/operator roles." };
  }
}
