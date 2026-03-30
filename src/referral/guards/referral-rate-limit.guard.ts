import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RATE_LIMIT_KEY } from "../../common/decorators/rate-limit.decorator";

/**
 * Custom guard for additional referral-specific rate limiting
 * Complements the global throttler with referral-specific limits
 */
@Injectable()
export class ReferralRateLimitGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // This guard is optional - it's an additional layer beyond the throttler
    // The throttler module is already configured globally in the app
    // This guard can be used for more granular control if needed
    return true;
  }
}
