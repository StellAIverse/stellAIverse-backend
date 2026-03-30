import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { ChallengeService } from "./challenge.service";
import { JwtStrategy } from "./jwt.strategy";
import { JwtAuthGuard } from "./jwt.guard";
import { WalletAuthService } from "./wallet-auth.service";
import { EmailService } from "./email.service";
import { EmailLinkingService } from "./email-linking.service";
import { RecoveryService } from "./recovery.service";
import { User } from "../user/entities/user.entity";
import { EmailVerification } from "./entities/email-verification.entity";
import { ReferralModule } from "../referral/referral.module";

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: "24h" },
    }),
    TypeOrmModule.forFeature([User, EmailVerification]),
    ReferralModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    ChallengeService,
    WalletAuthService,
    EmailService,
    EmailLinkingService,
    RecoveryService,
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [
    AuthService,
    ChallengeService,
    WalletAuthService,
    EmailLinkingService,
    JwtAuthGuard,
  ],
})
export class AuthModule {}
