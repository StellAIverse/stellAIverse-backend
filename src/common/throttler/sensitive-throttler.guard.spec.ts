import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, HttpException } from '@nestjs/common';
import { SensitiveThrottlerGuard } from './sensitive-throttler.guard';

function makeContext(overrides: Record<string, unknown> = {}): ExecutionContext {
  const req = {
    ip: '127.0.0.1',
    headers: {},
    user: undefined,
    ...overrides,
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('SensitiveThrottlerGuard', () => {
  let guard: SensitiveThrottlerGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60_000, limit: 5 }],
        }),
      ],
      providers: [SensitiveThrottlerGuard, Reflector],
    }).compile();

    guard = module.get<SensitiveThrottlerGuard>(SensitiveThrottlerGuard);
  });

  describe('getTracker', () => {
    it('uses user id when authenticated', async () => {
      const req = { user: { id: 'user-123' }, headers: {}, ip: '10.0.0.1' };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('user:user-123');
    });

    it('uses wallet address when user has address but no id', async () => {
      const req = { user: { address: '0xabc' }, headers: {}, ip: '10.0.0.1' };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('wallet:0xabc');
    });

    it('falls back to IP for anonymous requests', async () => {
      const req = { user: undefined, headers: {}, ip: '192.168.1.1' };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('ip:192.168.1.1');
    });

    it('extracts first IP from X-Forwarded-For chain', async () => {
      const req = {
        user: undefined,
        headers: { 'x-forwarded-for': '203.0.113.5, 192.168.1.1' },
        ip: '10.0.0.1',
      };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('ip:203.0.113.5');
    });

    it('handles missing user and IP gracefully', async () => {
      const req = { headers: {} };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('ip:unknown');
    });
  });

  describe('shouldSkip', () => {
    it('never skips for sensitive APIs', async () => {
      const ctx = makeContext();
      const skip = await (guard as any).shouldSkip(ctx);
      expect(skip).toBe(false);
    });
  });
});
