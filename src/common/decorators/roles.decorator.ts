import { SetMetadata } from "@nestjs/common";

export enum Role {
  USER = "user",
  OPERATOR = "operator",
  ADMIN = "admin",
}

export const ROLES_KEY = "roles";

/**
 * Decorator that assigns required roles to a route handler.
 * Used together with RolesGuard to enforce role-based access control.
 *
 * @example
 * @Roles(Role.ADMIN)
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Get('admin/dashboard')
 * getAdminDashboard() { ... }
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
