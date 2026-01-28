import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { ChallengeService } from './challenge.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt.guard';
import { WalletAuthService } from './wallet-auth.service';
import { EmailService } from './email.service';
import { EmailLinkingService } from './email-linking.service';
import { RecoveryService } from './recovery.service';
import { User } from '../user/entities/user.entity';
import { EmailVerification } from './entities/email-verification.entity';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '24h' },
    }),
    TypeOrmModule.forFeature([User, EmailVerification]),
  ],
  controllers: [AuthController],
  providers: [
    ChallengeService,
    WalletAuthService,
    EmailService,
    EmailLinkingService,
    RecoveryService,
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [
    ChallengeService,
    WalletAuthService,
    EmailLinkingService,
    JwtAuthGuard,
  ],
})
export class AuthModule {}
