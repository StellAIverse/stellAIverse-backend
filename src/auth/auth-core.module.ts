/**
 * AuthCoreModule — lightweight core auth providers.
 *
 * Contains only the services that every other module in the system may need:
 *  - TokenBlacklistService  (jti revocation)
 *  - JwtStrategy / JwtAuthGuard (passport-jwt integration)
 *  - AuthService  (legacy email/password flow — see deprecation notice below)
 *
 * Consumers that only need token validation should import this module instead
 * of the full AuthModule to avoid pulling in the entire strategy graph.
 */
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";

import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { JwtAuthGuard } from "./jwt.guard";
import { TokenBlacklistService } from "./token-blacklist.service";

import { User } from "../user/entities/user.entity";

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: "15m" },
    }),
    TypeOrmModule.forFeature([User]),
  ],
  providers: [
    TokenBlacklistService,
    JwtStrategy,
    JwtAuthGuard,
    // Legacy service — kept for backward compatibility.
    // @deprecated Use StrategyAuthService (via AuthStrategiesModule) for new code.
    AuthService,
  ],
  exports: [
    TokenBlacklistService,
    JwtAuthGuard,
    AuthService,
    JwtModule,
  ],
})
export class AuthCoreModule {}
