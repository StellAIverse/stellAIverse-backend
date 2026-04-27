import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";
import { Role, ROLES_KEY } from "../decorators/roles.decorator";

describe("RolesGuard", () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function createMockContext(user: any): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
        getResponse: jest.fn(),
        getNext: jest.fn(),
      }),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getType: jest.fn(),
    } as unknown as ExecutionContext;
  }

  describe("when no roles are required", () => {
    it("should allow access when no @Roles decorator is present", () => {
      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
      const context = createMockContext({ address: "0x123" });
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should allow access when @Roles decorator has empty array", () => {
      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue([]);
      const context = createMockContext({ address: "0x123" });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe("when roles are required", () => {
    it("should allow access when user has the required role (single role as string)", () => {
      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue([Role.ADMIN]);
      const context = createMockContext({
        address: "0x123",
        role: Role.ADMIN,
        roles: [Role.ADMIN],
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should allow access when user has one of multiple required roles", () => {
      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockReturnValue([Role.ADMIN, Role.OPERATOR]);
      const context = createMockContext({
        address: "0x123",
        role: Role.OPERATOR,
        roles: [Role.OPERATOR],
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should deny access when user does not have the required role", () => {
      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue([Role.ADMIN]);
      const context = createMockContext({
        address: "0x123",
        role: Role.USER,
        roles: [Role.USER],
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it("should deny access when user has no roles at all", () => {
      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue([Role.ADMIN]);
      const context = createMockContext({
        address: "0x123",
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it("should throw ForbiddenException when no user is present on request", () => {
      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue([Role.ADMIN]);
      const context = createMockContext(undefined);
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        "No authenticated user found",
      );
    });

    it("should include required roles in error message", () => {
      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockReturnValue([Role.ADMIN, Role.OPERATOR]);
      const context = createMockContext({
        address: "0x123",
        role: Role.USER,
        roles: [Role.USER],
      });
      expect(() => guard.canActivate(context)).toThrow(
        "Insufficient permissions. Required roles: admin, operator",
      );
    });
  });

  describe("role format compatibility", () => {
    it("should work with user.role as a single string (no roles array)", () => {
      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue([Role.ADMIN]);
      const context = createMockContext({
        address: "0x123",
        role: Role.ADMIN,
        // no roles array
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should work with user.roles as an array", () => {
      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockReturnValue([Role.OPERATOR]);
      const context = createMockContext({
        address: "0x123",
        roles: [Role.USER, Role.OPERATOR],
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should handle user with multiple roles where one matches", () => {
      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue([Role.ADMIN]);
      const context = createMockContext({
        address: "0x123",
        roles: [Role.USER, Role.ADMIN],
      });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe("reflector integration", () => {
    it("should check both handler and class for roles metadata", () => {
      const spy = jest
        .spyOn(reflector, "getAllAndOverride")
        .mockReturnValue(undefined);
      const context = createMockContext({ address: "0x123" });
      guard.canActivate(context);
      expect(spy).toHaveBeenCalledWith(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    });
  });
});
