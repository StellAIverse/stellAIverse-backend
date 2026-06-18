/**
 * AuthModule — top-level auth barrel module.
 *
 * Composes AuthCoreModule + AuthStrategiesModule with the additional
 * services that belong to the full auth feature (wallet auth, email linking,
 * session recovery, delegation, enhanced 2FA auth, etc.).
 *
 * Split structure:
 *  ┌─ AuthCoreModule          TokenBlacklistService, JwtStrategy, JwtAuthGuard, AuthService (legacy)
 *  └─ AuthStrategiesModule    StrategyRegistry, StrategyAuthGuard, all strategy impls
 *        └─ (re-exports AuthCoreModule)
 *
 * See docs/AUTH_FLOW.md for a full description of the authentication topology.
 */
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";

import { AuthCoreModule } from "./auth-core.module";
import { AuthStrategiesModule } from "./auth-strategies.module";

import { AuthController } from "./auth.controller";
import { EnhancedAuthController } from "./enhanced-auth.controller";

import { ChallengeService } from "./challenge.service";
import { WalletAuthService } from "./wallet-auth.service";
import { EmailService } from "./email.service";
import { EmailLinkingService } from "./email-linking.service";
import { RecoveryService } from "./recovery.service";
import { SessionRecoveryService } from "./session-recovery.service";
import { DelegationService } from "./delegation.service";
import { EnhancedAuthService } from "./enhanced-auth.service";

import { User } from "../user/entities/user.entity";
import { EmailVerification } from "./entities/email-verification.entity";
import { Wallet } from "./entities/wallet.entity";
import { RefreshToken, TwoFactorAuth } from "./entities/auth.entity";

@Module({
  imports: [
    ConfigModule,
    AuthCoreModule,
    AuthStrategiesModule,
    TypeOrmModule.forFeature([
      User,
      EmailVerification,
      Wallet,
      RefreshToken,
      TwoFactorAuth,
    ]),
  ],
  controllers: [AuthController, EnhancedAuthController],
  providers: [
    ChallengeService,
    WalletAuthService,
    EmailService,
    EmailLinkingService,
    RecoveryService,
    SessionRecoveryService,
    DelegationService,
    EnhancedAuthService,
  ],
  exports: [
    // Re-export sub-modules so any module importing AuthModule gets everything.
    AuthCoreModule,
    AuthStrategiesModule,
    // Feature services
    ChallengeService,
    WalletAuthService,
    EmailLinkingService,
    SessionRecoveryService,
    DelegationService,
    EnhancedAuthService,
  ],
})
export class AuthModule {}
