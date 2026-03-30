import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { AuthType as AuthTypeEnum } from "../strategies/interfaces/auth-strategy.interface";

/**
 * Decorator that extracts the authentication type from the request.
 *
 * @example
 * @Get('data')
 * getData(@AuthType() type: AuthType) {
 *   console.log(`Authenticated via: ${type}`);
 * }
 */
export const AuthType = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthTypeEnum | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.authType as AuthTypeEnum;
  },
);
