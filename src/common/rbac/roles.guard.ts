import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { Role, hasRole } from './roles.enum';

type AuthenticatedRequest = {
  user?: {
    id?: string;
    address?: string;
    role?: Role;
    roles?: Role[];
  };
};

/**
 * RolesGuard — enforces RBAC at every call boundary.
 *
 * Rules:
 *  1. If no @RequireRole is present, access is granted (public endpoint).
 *  2. The request MUST have an authenticated user (JWT must have run first).
 *  3. The user's role must satisfy the hierarchy requirement.
 *  4. There is NO implicit trust for internal calls — every method is checked.
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

    // No role restriction — allow
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('No authenticated user found on request');
    }

    // Normalise: support both `role` (single) and `roles` (array) shapes
    const userRoles: Role[] = user.roles ?? (user.role ? [user.role] : []);

    if (userRoles.length === 0) {
      this.logger.warn(`User ${user.id ?? user.address} has no roles assigned`);
      throw new ForbiddenException('User has no role assigned');
    }

    const allowed = requiredRoles.every((required) =>
      userRoles.some((candidate) => hasRole(candidate, required)),
    );

    if (!allowed) {
      this.logger.warn(
        `Role escalation attempt blocked: user=${user.id ?? user.address} ` +
          `roles=[${userRoles.join(',')}] required=[${requiredRoles.join(',')}]`,
      );
      throw new ForbiddenException(
        `Insufficient permissions. Required: [${requiredRoles.join(', ')}]`,
      );
    }

    return true;
  }
}
