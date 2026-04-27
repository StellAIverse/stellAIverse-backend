import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY, Role } from "../decorators/roles.decorator";

/**
 * Guard that checks if the authenticated user has the required role(s)
 * to access a route. Works in conjunction with the @Roles() decorator.
 *
 * If no @Roles() decorator is present on the handler or controller,
 * the guard allows access (public by default when guard is applied).
 *
 * Usage:
 *   @Roles(Role.ADMIN)
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Get('admin-only')
 *   adminEndpoint() { ... }
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles are required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("No authenticated user found");
    }

    // Check if user has at least one of the required roles
    // Supports both single role (string) and multiple roles (array)
    const userRoles: string[] = Array.isArray(user.roles)
      ? user.roles
      : user.role
        ? [user.role]
        : [];

    const hasRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException(
        `Insufficient permissions. Required roles: ${requiredRoles.join(", ")}`,
      );
    }

    return true;
  }
}
