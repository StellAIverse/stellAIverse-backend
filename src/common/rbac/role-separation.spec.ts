import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../common/rbac/roles.guard';
import { Role } from '../common/rbac/roles.enum';
import { ROLES_KEY } from '../common/rbac/roles.decorator';
import { ExecutionContext } from '@nestjs/common';

function makeCtx(user: any, requiredRoles: Role[]): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('Role Separation — Governance cannot access KYC endpoints and vice versa', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();
    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('KYC endpoints', () => {
    beforeEach(() => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([Role.KYC_OPERATOR, Role.ADMIN]);
    });

    it('allows KYC_OPERATOR to access KYC endpoints', () => {
      const ctx = makeCtx({ role: Role.KYC_OPERATOR }, [Role.KYC_OPERATOR, Role.ADMIN]);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('blocks GOVERNANCE_OPERATOR from KYC endpoints', () => {
      const ctx = makeCtx({ role: Role.GOVERNANCE_OPERATOR }, [Role.KYC_OPERATOR, Role.ADMIN]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows ADMIN to access KYC endpoints', () => {
      const ctx = makeCtx({ role: Role.ADMIN }, [Role.KYC_OPERATOR, Role.ADMIN]);
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('Governance endpoints', () => {
    beforeEach(() => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([Role.GOVERNANCE_OPERATOR, Role.ADMIN]);
    });

    it('allows GOVERNANCE_OPERATOR to access governance endpoints', () => {
      const ctx = makeCtx({ role: Role.GOVERNANCE_OPERATOR }, [Role.GOVERNANCE_OPERATOR, Role.ADMIN]);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('blocks KYC_OPERATOR from governance endpoints', () => {
      const ctx = makeCtx({ role: Role.KYC_OPERATOR }, [Role.GOVERNANCE_OPERATOR, Role.ADMIN]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows ADMIN to access governance endpoints', () => {
      const ctx = makeCtx({ role: Role.ADMIN }, [Role.GOVERNANCE_OPERATOR, Role.ADMIN]);
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });
});
