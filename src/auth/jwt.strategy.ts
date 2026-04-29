import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthPayload } from "./wallet-auth.service";
import { TokenBlacklistService } from "./token-blacklist.service";

interface JwtPayload {
  sub?: string; // User ID for traditional auth
  address?: string; // Wallet address for wallet auth
  email?: string;
  username?: string;
  role?: string;
  jti?: string; // JWT ID for replay attack prevention
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private tokenBlacklist: TokenBlacklistService,
  ) {
    const secret = configService.get<string>("JWT_SECRET");

    if (!secret) {
      throw new Error("JWT_SECRET must be defined in environment variables");
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      algorithms: ["HS256"], // Explicitly specify allowed algorithms
    });
  }

  async validate(payload: JwtPayload) {
    // Validate payload structure - support both wallet and traditional auth
    if (!payload) {
      throw new UnauthorizedException("Invalid token payload");
    }

    // Check jti claim for replay attack prevention
    if (payload.jti && this.tokenBlacklist.isRevoked(payload.jti)) {
      throw new UnauthorizedException("Token has been revoked");
    }

    // Check if it's a traditional auth payload (has sub) or wallet auth payload (has address)
    const isTraditionalAuth = !!payload.sub;
    const isWalletAuth = !!payload.address;

    if (!isTraditionalAuth && !isWalletAuth) {
      throw new UnauthorizedException(
        "Invalid token payload - missing user identifier",
      );
    }

    // Return user object compatible with both auth types
    if (isTraditionalAuth) {
      return {
        id: payload.sub,
        email: payload.email,
        username: payload.username,
        role: payload.role || "user",
        jti: payload.jti,
        exp: payload.exp,
        type: "traditional",
      };
    } else {
      return {
        address: payload.address,
        email: payload.email,
        role: payload.role || "user",
        roles: payload.role ? [payload.role] : ["user"],
        jti: payload.jti,
        exp: payload.exp,
        type: "wallet",
      };
    }
  }
}
