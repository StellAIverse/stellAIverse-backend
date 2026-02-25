import {
  Body,
  Controller,
  Post,
  Get,
  Delete,
  UseGuards,
  Request,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth, ApiProperty } from "@nestjs/swagger";
import { ChallengeService } from "./challenge.service";
import { WalletAuthService } from "./wallet-auth.service";
import { EmailLinkingService } from "./email-linking.service";
import { RecoveryService } from "./recovery.service";
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
import { Roles, Role } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guard/roles.guard";

export class RequestChallengeDto {
  @ApiProperty({
    description: "Ethereum wallet address",
    example: "0x1234567890abcdef1234567890abcdef1234567890",
    pattern: "^0x[a-fA-F0-9]{40}$"
  })
  address: string;
}

export class VerifySignatureDto {
  @ApiProperty({
    description: "Challenge message to sign",
    example: "Sign this message to authenticate with StellAIverse at 2024-02-25T05:30:00.000Z"
  })
  message: string;

  @ApiProperty({
    description: "ECDSA signature of the challenge message",
    example: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
  })
  signature: string;
}

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
  ) {}

  @Post("challenge")
  @ApiOperation({
    summary: "Request Authentication Challenge",
    description: "Request a challenge message to sign for wallet authentication",
    operationId: "requestChallenge"
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
          example: "Sign this message to authenticate with StellAIverse at 2024-02-25T05:30:00.000Z"
        },
        address: {
          type: "string",
          example: "0x1234567890abcdef1234567890abcdef1234567890"
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: "Invalid wallet address format"
  })
  @ApiResponse({
    status: 429,
    description: "Too many requests"
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
    const currentWalletAddress = req.user.address;
    return this.walletAuthService.linkWallet(
      currentWalletAddress,
      dto.walletAddress,
      dto.message,
      dto.signature,
    );
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseGuards(JwtAuthGuard)
  @Post("unlink-wallet")
  async unlinkWallet(@Request() req, @Body() dto: UnlinkWalletDto) {
    const currentWalletAddress = req.user.address;
    return this.walletAuthService.unlinkWallet(
      currentWalletAddress,
      dto.walletAddress,
    );
  }

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post("recover-wallet")
  async recoverWallet(@Body() dto: RecoverWalletDto) {
    return this.walletAuthService.recoverWallet(dto.email, dto.recoveryToken);
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
