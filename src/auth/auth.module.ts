import { Module, OnModuleInit } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { AuthController } from "./auth.controller";
import { EnhancedAuthController, KycController } from "./enhanced-auth.controller";
import { AuthService } from "./auth.service";
import { EnhancedAuthService } from "./enhanced-auth.service";
import { ChallengeService } from "./challenge.service";
import { JwtStrategy } from "./jwt.strategy";
import { JwtAuthGuard } from "./jwt.guard";
import { WalletAuthService } from "./wallet-auth.service";
import { EmailService } from "./email.service";
import { EmailLinkingService } from "./email-linking.service";
import { RecoveryService } from "./recovery.service";
import { SessionRecoveryService } from "./session-recovery.service";
import { DelegationService } from "./delegation.service";
import { StrategyAuthService } from "./strategy-auth.service";
import { StrategyRegistry } from "./strategies/strategy.registry";
import { WalletStrategy } from "./strategies/wallet/wallet.strategy";
import { TraditionalStrategy } from "./strategies/traditional/traditional.strategy";
import { OAuthStrategy } from "./strategies/oauth/oauth.strategy";
import { ApiKeyStrategy } from "./strategies/api-key/api-key.strategy";
import { StrategyAuthGuard } from "./guards/strategy-auth.guard";
import { User } from "../user/entities/user.entity";
import { EmailVerification } from "./entities/email-verification.entity";
import { Wallet } from "./entities/wallet.entity";
import { RefreshToken, TwoFactorAuth } from "./entities/auth.entity";
import { ReferralModule } from "../referral/referral.module";

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    ReferralModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: "24h" },
    }),
    TypeOrmModule.forFeature([User, EmailVerification, Wallet, RefreshToken, TwoFactorAuth]),
  ],
  controllers: [AuthController, EnhancedAuthController, KycController],
  providers: [
    // Legacy services (for backward compatibility)
    AuthService,
    ChallengeService,
    WalletAuthService,
    EmailService,
    EmailLinkingService,
    RecoveryService,
    SessionRecoveryService,
    DelegationService,
    // New enhanced services
    EnhancedAuthService,
    JwtStrategy,
    JwtAuthGuard,
    // New pluggable strategy system
    StrategyRegistry,
    StrategyAuthService,
    WalletStrategy,
    TraditionalStrategy,
    OAuthStrategy,
    ApiKeyStrategy,
    StrategyAuthGuard,
  ],
  exports: [
    // Legacy exports
    AuthService,
    ChallengeService,
    WalletAuthService,
    EmailLinkingService,
    SessionRecoveryService,
    DelegationService,
    JwtAuthGuard,
    // New enhanced exports
    EnhancedAuthService,
    // New pluggable strategy exports
    StrategyRegistry,
    StrategyAuthService,
    WalletStrategy,
    TraditionalStrategy,
    OAuthStrategy,
    ApiKeyStrategy,
    StrategyAuthGuard,
  ],
})
export class AuthModule implements OnModuleInit {
  constructor(
    private readonly strategyRegistry: StrategyRegistry,
    private readonly walletStrategy: WalletStrategy,
    private readonly traditionalStrategy: TraditionalStrategy,
    private readonly oauthStrategy: OAuthStrategy,
    private readonly apiKeyStrategy: ApiKeyStrategy,
  ) {}

  onModuleInit(): void {
    // Register all authentication strategies
    this.strategyRegistry.register(this.walletStrategy);
    this.strategyRegistry.register(this.traditionalStrategy);
    this.strategyRegistry.register(this.oauthStrategy);
    this.strategyRegistry.register(this.apiKeyStrategy);
  }
}
