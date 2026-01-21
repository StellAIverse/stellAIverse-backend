import { Body, Controller, Post } from '@nestjs/common';
import { ChallengeService } from './challenge.service';
import { WalletAuthService } from './wallet-auth.service';

export class RequestChallengeDto {
  address: string;
}

export class VerifySignatureDto {
  message: string;
  signature: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly challengeService: ChallengeService,
    private readonly walletAuthService: WalletAuthService,
  ) {}

  @Post('challenge')
  requestChallenge(@Body() dto: RequestChallengeDto) {
    const message = this.challengeService.issueChallengeForAddress(
      dto.address,
    );
    return {
      message,
      address: dto.address,
    };
  }

  @Post('verify')
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
}
