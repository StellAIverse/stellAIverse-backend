import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { StrategyRegistry } from "../strategies/strategy.registry";
import { AuthPayload } from "../strategies/interfaces/auth-strategy.interface";
import { IS_PUBLIC_KEY } from "../../common/decorators/public.decorator";
import { ALLOWED_STRATEGIES_KEY } from "../decorators/allowed-strategies.decorator";

/**
 * Authentication guard that supports multiple strategies
 * Validates JWT tokens and checks strategy permissions
 */
@Injectable()
export class StrategyAuthGuard implements CanActivate {
  private readonly logger = new Logger(StrategyAuthGuard.name);

  constructor(
    private readonly strategyRegistry: StrategyRegistry,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException("Access token is required");
    }

    try {
      // Try to validate token with any enabled strategy
      const payload = await this.validateTokenWithStrategies(token);

      if (!payload) {
        throw new UnauthorizedException("Invalid or expired token");
      }

      // Check if the strategy is allowed for this route
      const allowedStrategies = this.reflector.getAllAndOverride<string[]>(
        ALLOWED_STRATEGIES_KEY,
        [context.getHandler(), context.getClass()],
      );

      if (allowedStrategies && !allowedStrategies.includes(payload.type)) {
        throw new UnauthorizedException(
          `Authentication strategy '${payload.type}' is not allowed for this resource`,
        );
      }

      // Attach user to request
      request.user = this.transformPayloadToUser(payload);
      request.authType = payload.type;

      return true;
    } catch (error) {
      this.logger.warn("Authentication failed", error);
      throw new UnauthorizedException("Authentication failed");
    }
  }

  /**
   * Extract JWT token from Authorization header
   */
  private extractTokenFromHeader(request: {
    headers?: { authorization?: string };
  }): string | undefined {
    const authHeader = request.headers?.authorization;
    if (!authHeader) {
      return undefined;
    }

    const [type, token] = authHeader.split(" ");
    return type === "Bearer" ? token : undefined;
  }

  /**
   * Try to validate token with all enabled strategies
   */
  private async validateTokenWithStrategies(
    token: string,
  ): Promise<AuthPayload | null> {
    const strategies = this.strategyRegistry.getAll();

    for (const strategy of strategies) {
      try {
        const payload = await strategy.validateToken(token);
        if (payload) {
          return payload;
        }
      } catch (error) {
        // Continue to next strategy
        continue;
      }
    }

    return null;
  }

  /**
   * Transform JWT payload to user object
   */
  private transformPayloadToUser(payload: AuthPayload): {
    id?: string;
    address?: string;
    email?: string;
    username?: string;
    role: string;
    roles: string[];
    type: string;
  } {
    return {
      id: payload.sub,
      address: payload.address,
      email: payload.email,
      username: payload.username,
      role: payload.role,
      roles: payload.roles || [payload.role],
      type: payload.type,
    };
  }
}
