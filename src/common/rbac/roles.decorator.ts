import { SetMetadata } from '@nestjs/common';
import { Role } from './roles.enum';

export const ROLES_KEY = 'required_roles';

/**
 * Declare the minimum role required to call a controller method or class.
 *
 * @example
 * @RequireRole(Role.ADMIN)
 * @Delete(':id')
 * remove() { ... }
 */
export const RequireRole = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
