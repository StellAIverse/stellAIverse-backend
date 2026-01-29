import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthPayload } from "./wallet-auth.service";

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

  async validate(payload: AuthPayload) {
    // Validate payload structure
    if (!payload || !payload.address) {
      throw new UnauthorizedException("Invalid token payload");
    }

    // Check token age (additional protection)
    const tokenAge = Date.now() / 1000 - payload.iat;
    const maxAge = this.configService.get<number>("JWT_MAX_AGE") || 86400; // 24 hours default

    if (tokenAge > maxAge) {
      throw new UnauthorizedException("Token expired");
    }

    return {
      address: payload.address,
      email: payload.email,
    };
  }
}
