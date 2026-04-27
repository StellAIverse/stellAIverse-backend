import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModuleOptions, ThrottlerStorage, ThrottlerRequest } from '@nestjs/throttler';

export const THROTTLE_LIMIT_KEY = 'throttle_limit';
export const THROTTLE_TTL_KEY = 'throttle_ttl';

type AnyRequest = {
  ip?: string;
  headers?: Record<string, unknown>;
  user?: { id?: string | number; address?: string };
};

/**
 * Sensitive API throttler guard.
 *
 * Per-endpoint limits are set with @Throttle() on the controller/handler.
 * Falls back to global defaults when no per-endpoint override is present.
 *
 * Identity resolution order:
 *   1. Authenticated user id / wallet address  → per-user quota
 *   2. X-Forwarded-For / req.ip               → per-IP quota (anonymous)
 */
@Injectable()
export class SensitiveThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: AnyRequest): Promise<string> {
    // Prefer authenticated identity for per-user quotas
    const user = req.user;
    if (user?.id) return `user:${String(user.id)}`;
    if (user?.address) return `wallet:${user.address}`;

    // Anonymous path: use real client IP
    const xff = req.headers?.['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
      return `ip:${xff.split(',')[0].trim()}`;
    }
    return `ip:${req.ip ?? 'unknown'}`;
  }

  /** Deterministic: always reject at exactly the threshold — no fuzzy window. */
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    // Never skip for sensitive APIs — always enforce
    return false;
  }
}
