import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { Role } from './roles.enum';
import { ROLES_KEY } from './roles.decorator';
import { ExecutionContext } from '@nestjs/common';

function makeContext(user: any, handlerRoles?: Role[], classRoles?: Role[]): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();
    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('allows when no roles required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = makeContext({ role: Role.USER });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows ADMIN to access ADMIN endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const ctx = makeContext({ role: Role.ADMIN });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks USER from ADMIN endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const ctx = makeContext({ role: Role.USER });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('blocks OPERATOR from ADMIN endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const ctx = makeContext({ role: Role.OPERATOR });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows OPERATOR to access OPERATOR endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.OPERATOR]);
    const ctx = makeContext({ role: Role.OPERATOR });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows ADMIN to access OPERATOR endpoint (higher privilege)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.OPERATOR]);
    const ctx = makeContext({ role: Role.ADMIN });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks unauthenticated request when roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.USER]);
    const ctx = makeContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('blocks user with no role assigned', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.USER]);
    const ctx = makeContext({ id: 'u1', role: undefined });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('supports roles array on user object', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const ctx = makeContext({ roles: [Role.ADMIN, Role.OPERATOR] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('indirect call cannot bypass — no implicit trust', () => {
    // Simulate an "internal" call that still has a low-privilege user
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const ctx = makeContext({ role: Role.USER, _internal: true });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
