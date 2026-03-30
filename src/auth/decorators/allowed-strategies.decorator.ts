import { SetMetadata } from "@nestjs/common";
import { AuthType } from "../strategies/interfaces/auth-strategy.interface";

export const ALLOWED_STRATEGIES_KEY = "allowedStrategies";

/**
 * Decorator that specifies which authentication strategies are allowed for a route.
 * Used together with StrategyAuthGuard to restrict access to specific auth types.
 *
 * @example
 * @AllowedStrategies('wallet', 'api-key')
 * @UseGuards(StrategyAuthGuard)
 * @Get('sensitive-data')
 * getSensitiveData() { ... }
 */
export const AllowedStrategies = (...strategies: AuthType[]) =>
  SetMetadata(ALLOWED_STRATEGIES_KEY, strategies);
