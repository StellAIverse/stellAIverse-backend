import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { ChallengeService } from './challenge.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt.guard';
import { WalletAuthService } from './wallet-auth.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [AuthController],
  providers: [ChallengeService, WalletAuthService, JwtStrategy, JwtAuthGuard],
  exports: [ChallengeService, WalletAuthService, JwtAuthGuard],
})
export class AuthModule {}
