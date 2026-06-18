# Authentication Flow — StellAIverse Backend

This document describes the authentication architecture, the relationship between legacy and
new auth services, and the rules every contributor must follow when adding protected routes.

---

## Module Structure

```
AuthModule  (src/auth/auth.module.ts)
  ├── AuthCoreModule          (src/auth/auth-core.module.ts)
  │     TokenBlacklistService, JwtStrategy, JwtAuthGuard, AuthService (legacy)
  └── AuthStrategiesModule    (src/auth/auth-strategies.module.ts)
        StrategyRegistry, StrategyAuthGuard
        WalletStrategy, TraditionalStrategy, OAuthStrategy, ApiKeyStrategy
        (re-exports AuthCoreModule)
```

- **AuthCoreModule** — minimal set of providers needed by any module that only wants JWT
  validation and token revocation. Safe to import in tight dependency graphs.
- **AuthStrategiesModule** — adds the pluggable strategy layer. Import this (or the full
  AuthModule) when you need `StrategyAuthGuard` or `StrategyAuthService`.
- **AuthModule** — full feature module. Includes wallet auth, email linking, session recovery,
  delegation, and the `EnhancedAuthService`. Most application modules should import this one.

---

## Default Guard — StrategyAuthGuard

`StrategyAuthGuard` is registered as a **global `APP_GUARD`** in `AppModule`.

This means **every route is protected by default**. To make a route publicly accessible,
decorate it (or its controller class) with `@Public()`:

```ts
import { Public } from '../common/decorators/public.decorator';

@Public()
@Get('health')
healthCheck() { ... }
```

The guard checks for the `isPublic` metadata first. If present, it passes through
immediately without touching the token. This is the **only** mechanism to bypass
authentication for a route.

### Guard execution order (AppModule APP_GUARD chain)

1. `ThrottlerUserIpGuard` — rate limiting
2. `StrategyAuthGuard`    — **authentication** (new default)
3. `RolesGuard`           — role-based access control
4. `KycGuard`             — KYC context extraction

---

## Strategy Registry

`StrategyRegistry` holds the map of enabled `AuthStrategy` implementations.
Strategies are registered in `AuthStrategiesModule.onModuleInit()`:

| Name           | Class                | Auth mechanism                        |
|----------------|----------------------|---------------------------------------|
| `wallet`       | `WalletStrategy`     | ECDSA signature over challenge nonce  |
| `traditional`  | `TraditionalStrategy`| Email + password → JWT                |
| `oauth`        | `OAuthStrategy`      | OAuth2 authorization code flow        |
| `api-key`      | `ApiKeyStrategy`     | Static API key + secret               |

`StrategyAuthGuard` tries each strategy in registration order and accepts the first
valid payload. To restrict a route to specific strategies, use `@AllowedStrategies`:

```ts
import { AllowedStrategies } from '../auth/decorators/allowed-strategies.decorator';

@AllowedStrategies('wallet', 'api-key')
@Get('sensitive')
getSensitive() { ... }
```

---

## Token Blacklist

`TokenBlacklistService` maintains an in-memory map of revoked `jti` claims.

- **Where it lives**: `src/auth/token-blacklist.service.ts`
- **Exported from**: `AuthCoreModule` → `AuthStrategiesModule` → `AuthModule`
- **Injected into**: `AuthService.logout()`, `JwtStrategy.validate()`

Any service that calls `logout()` or needs to revoke a token must inject
`TokenBlacklistService`. Because it is exported from `AuthCoreModule`, any module
that imports `AuthModule` (or `AuthCoreModule` directly) automatically has it
available for injection.

> **Production note**: The current implementation is in-memory. Replace with a
> Redis-backed store (TTL = token expiry) before deploying to production.

---

## Authentication Flows by Controller

### `AuthController` (`POST /auth/*`) — Legacy flow

| Route                           | Auth required | Service called                   |
|---------------------------------|---------------|----------------------------------|
| `POST /auth/challenge`          | ❌ `@Public` | `ChallengeService`               |
| `POST /auth/verify`             | ❌ `@Public` | `WalletAuthService`              |
| `POST /auth/register`           | ❌ `@Public` | `AuthService.register()` ⚠️ deprecated |
| `POST /auth/login`              | ❌ `@Public` | `AuthService.login()` ⚠️ deprecated    |
| `POST /auth/logout`             | ✅ JWT        | `AuthService.logout()`           |
| `GET  /auth/status`             | ✅ JWT        | `AuthService.getAuthStatus()`    |
| `POST /auth/link-email`         | ✅ JWT        | `EmailLinkingService`            |
| `POST /auth/verify-email`       | ❌ `@Public` | `EmailLinkingService`            |
| `POST /auth/recovery/*`         | ❌ `@Public` | `RecoveryService` / `SessionRecoveryService` |
| `GET  /auth/recovery/status/*`  | ✅ JWT        | `SessionRecoveryService`         |
| `POST /auth/delegation/*`       | ✅ JWT        | `DelegationService`              |
| `GET  /auth/admin/*`            | ✅ JWT + RBAC | admin-only                      |

### `EnhancedAuthController` (`POST /api/auth/*`) — New flow

| Route                      | Auth required | Service called                             |
|----------------------------|---------------|--------------------------------------------|
| `POST /api/auth/register`  | ❌ `@Public` | `EnhancedAuthService.register()`           |
| `POST /api/auth/login`     | ❌ `@Public` | `EnhancedAuthService.login()`              |
| `POST /api/auth/refresh`   | ❌ `@Public` | `EnhancedAuthService.refreshToken()`       |
| `POST /api/auth/2fa/setup` | ✅ JWT        | `EnhancedAuthService.setupTwoFactor()`     |
| `POST /api/auth/2fa/verify-setup` | ✅ JWT | `EnhancedAuthService.verifyTwoFactorSetup()` |
| `POST /api/auth/2fa/verify` | ❌ `@Public` | `EnhancedAuthService.verifyTwoFactorLogin()` |
| `POST /api/auth/2fa/disable` | ✅ JWT       | `EnhancedAuthService.disableTwoFactor()`   |

### Feature controllers

| Controller                  | Guard applied at         | Notes                               |
|-----------------------------|--------------------------|-------------------------------------|
| `PortfolioController`       | class-level `JwtAuthGuard` | Also protected by global guard     |
| `RiskManagementController`  | class-level `JwtAuthGuard` | Also protected by global guard     |
| `DeFiController`            | class-level `JwtAuthGuard` | Also protected by global guard     |
| `TradeController`           | class-level `JwtAuthGuard` | Also protected by global guard     |
| `OracleController`          | per-route `JwtAuthGuard`   | Public routes marked `@Public()`   |
| `AlertPreferencesController`| class-level `JwtAuthGuard` | Also protected by global guard     |
| `AppController`             | health/info are `@Public()`| `protected` route uses `JwtAuthGuard` |

> **Redundant guards**: Routes that already carry `@UseGuards(JwtAuthGuard)` are
> protected twice — once by the global `StrategyAuthGuard` and again by the
> route-level `JwtAuthGuard`. This is harmless but redundant. When migrating a
> controller to the new flow, remove the per-route/class `@UseGuards(JwtAuthGuard)`
> and rely on the global guard instead.

---

## Deprecated: `AuthService.login` / `AuthService.register`

`AuthService` (the legacy email/password service) is marked `@deprecated`. It will
continue to work but receives no new features.

**Migration path:**

```ts
// Before (legacy — POST /auth/register)
const { token, user } = await authService.register(dto);

// After (new — POST /api/auth/register)
const { accessToken, refreshToken, user } = await enhancedAuthService.register(dto, ip, ua);
```

Key differences:
- `EnhancedAuthService` returns separate `accessToken` + `refreshToken`.
- Refresh tokens are stored in the database (`RefreshToken` entity) and rotated on use.
- `EnhancedAuthService` supports 2FA via `TwoFactorAuth` entity.
- `AuthService.logout()` blacklists the current `jti`; `EnhancedAuthService.revokeAllRefreshTokens()` revokes all DB refresh tokens for a user.

---

## Adding New Protected Routes — Checklist

1. **Default**: your route is protected by the global `StrategyAuthGuard`. No annotation needed.
2. **Public route**: add `@Public()` to the handler or controller class.
3. **Restrict to specific auth types**: add `@AllowedStrategies('wallet')` (or other types).
4. **Role restriction**: continue using `@Roles(Role.ADMIN)` + `@UseGuards(RolesGuard)`.
5. **Do not** add a redundant `@UseGuards(JwtAuthGuard)` unless you are maintaining legacy
   code that has not yet been migrated to the global guard.
