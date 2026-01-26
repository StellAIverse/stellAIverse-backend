import {
  Body,
  Controller,
  Post,
  Get,
  Delete,
  UseGuards,
  Request,
} from "@nestjs/common";
import { ChallengeService } from "./challenge.service";
import { WalletAuthService } from "./wallet-auth.service";
import { EmailLinkingService } from "./email-linking.service";
import { RecoveryService } from "./recovery.service";
import { JwtAuthGuard } from "./jwt.guard";
import { LinkEmailDto } from "./dto/link-email.dto";
import { VerifyEmailDto } from "./dto/verify-email.dto";
import { RequestRecoveryDto } from "./dto/request-recovery.dto";

export class RequestChallengeDto {
  address: string;
}

export class VerifySignatureDto {
  message: string;
  signature: string;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly challengeService: ChallengeService,
    private readonly walletAuthService: WalletAuthService,
    private readonly emailLinkingService: EmailLinkingService,
    private readonly recoveryService: RecoveryService,
  ) {}

  @Post("challenge")
  requestChallenge(@Body() dto: RequestChallengeDto) {
    const message = this.challengeService.issueChallengeForAddress(dto.address);
    return {
      message,
      address: dto.address,
    };
  }

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
}
