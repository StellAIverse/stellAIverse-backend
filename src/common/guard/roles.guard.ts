import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "./roles.decorator";
import { Role, hasRole } from "./roles.enum";

type AuthenticatedRequest = {
  user?: {
    id?: string;
    address?: string;
    role?: Role;
    roles?: Role[];
  };
};

/**
 * Guard that checks whether the authenticated user has at least one role that
 * satisfies the required role metadata from @Roles()/@RequireRole().
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException("No authenticated user found on request");
    }

    const userRoles: Role[] = Array.isArray(user.roles)
      ? user.roles
      : user.role
        ? [user.role]
        : [];

    if (userRoles.length === 0) {
      this.logger.warn(`User ${user.id ?? user.address} has no roles assigned`);
      throw new ForbiddenException("User has no role assigned");
    }

    const allowed = requiredRoles.some((required) =>
      userRoles.some((candidate) => hasRole(candidate, required)),
    );

    if (!allowed) {
      this.logger.warn(
        `Role escalation attempt blocked: user=${user.id ?? user.address} ` +
          `roles=[${userRoles.join(",")}] required=[${requiredRoles.join(",")}]`,
      );
      throw new ForbiddenException(
        `Insufficient permissions. Required roles: ${requiredRoles.join(", ")}`,
      );
    }

    return true;
  }
}
