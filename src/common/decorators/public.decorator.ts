import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Decorator that marks a route as public (no authentication required).
 * Used together with authentication guards to allow unauthenticated access.
 *
 * @example
 * @Public()
 * @Get('health')
 * healthCheck() { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
