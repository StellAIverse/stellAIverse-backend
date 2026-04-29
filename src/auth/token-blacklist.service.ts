import { Injectable } from "@nestjs/common";

/**
 * In-memory token blacklist for jti-based replay attack prevention.
 * In production, replace with a Redis-backed store with TTL matching token expiry.
 */
@Injectable()
export class TokenBlacklistService {
  private readonly blacklist = new Map<string, number>(); // jti -> expiry epoch ms
  private readonly cleanupIntervalMs = 5 * 60 * 1000; // 5 minutes

  constructor() {
    setInterval(() => this.cleanup(), this.cleanupIntervalMs);
  }

  /** Blacklist a jti until its expiry time. */
  revoke(jti: string, expiresAt: number): void {
    this.blacklist.set(jti, expiresAt);
  }

  /** Returns true if the jti has been revoked. */
  isRevoked(jti: string): boolean {
    const exp = this.blacklist.get(jti);
    if (exp === undefined) return false;
    if (Date.now() > exp) {
      this.blacklist.delete(jti);
      return false;
    }
    return true;
  }

  /** Remove expired entries to prevent unbounded memory growth. */
  private cleanup(): void {
    const now = Date.now();
    for (const [jti, exp] of this.blacklist) {
      if (now > exp) this.blacklist.delete(jti);
    }
  }
}
