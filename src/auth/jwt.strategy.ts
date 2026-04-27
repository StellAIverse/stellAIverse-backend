import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthPayload } from "./wallet-auth.service";

interface JwtPayload {
  sub?: string; // User ID for traditional auth
  address?: string; // Wallet address for wallet auth
  email?: string;
  username?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
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

    // Check if it's a traditional auth payload (has sub) or wallet auth payload (has address)
    const isTraditionalAuth = !!payload.sub;
    const isWalletAuth = !!payload.address;

    if (!isTraditionalAuth && !isWalletAuth) {
      throw new UnauthorizedException(
        "Invalid token payload - missing user identifier",
      );
    }

    // Check token age (additional protection)
    const tokenAge = Date.now() / 1000 - (payload.iat || 0);
    const maxAge = this.configService.get<number>("JWT_MAX_AGE") || 86400; // 24 hours default

    if (tokenAge > maxAge) {
      throw new UnauthorizedException("Token expired");
    }

    // Return user object compatible with both auth types
    if (isTraditionalAuth) {
      return {
        id: payload.sub,
        email: payload.email,
        username: payload.username,
        role: payload.role || "user",
        type: "traditional",
      };
    } else {
      return {
        address: payload.address,
        email: payload.email,
        role: payload.role || "user",
        roles: payload.role ? [payload.role] : ["user"],
        type: "wallet",
      };
    }
  }
}
