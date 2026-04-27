import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { AuthUser } from "../strategies/interfaces/auth-strategy.interface";

/**
 * Decorator that extracts the current authenticated user from the request.
 *
 * @example
 * @Get('profile')
 * getProfile(@CurrentUser() user: AuthUser) {
 *   return user;
 * }
 */
export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthUser | undefined,
    ctx: ExecutionContext,
  ): AuthUser | AuthUser[keyof AuthUser] | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthUser;

    if (!user) {
      return undefined;
    }

    return data ? user[data] : user;
  },
);
