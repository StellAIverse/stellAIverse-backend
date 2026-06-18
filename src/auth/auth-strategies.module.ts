/**
 * AuthStrategiesModule — pluggable strategy graph.
 *
 * Registers the StrategyRegistry and all concrete strategy implementations.
 * Import this module (alongside AuthCoreModule) when you need strategy-based
 * authentication or the StrategyAuthGuard as a route-level guard.
 *
 * The StrategyAuthGuard is the **preferred default guard** for all new
 * protected routes.  It respects the @Public() decorator and routes
 * validation through whatever strategies are registered in StrategyRegistry.
 *
 * Auth flow for new routes:
 *   1. Attach StrategyAuthGuard as a global APP_GUARD (done in AppModule).
 *   2. Mark public routes with @Public().
 *   3. Optionally restrict allowed auth types with @AllowedStrategies('wallet', ...).
 */
import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthCoreModule } from "./auth-core.module";

import { StrategyRegistry } from "./strategies/strategy.registry";
import { StrategyAuthService } from "./strategy-auth.service";
import { StrategyAuthGuard } from "./guards/strategy-auth.guard";

import { WalletStrategy } from "./strategies/wallet/wallet.strategy";
import { TraditionalStrategy } from "./strategies/traditional/traditional.strategy";
import { OAuthStrategy } from "./strategies/oauth/oauth.strategy";
import { ApiKeyStrategy } from "./strategies/api-key/api-key.strategy";

import { User } from "../user/entities/user.entity";

@Module({
  imports: [
    ConfigModule,
    AuthCoreModule,
    TypeOrmModule.forFeature([User]),
  ],
  providers: [
    StrategyRegistry,
    StrategyAuthService,
    StrategyAuthGuard,
    WalletStrategy,
    TraditionalStrategy,
    OAuthStrategy,
    ApiKeyStrategy,
  ],
  exports: [
    // Re-export core so consumers only need to import this module.
    AuthCoreModule,
    StrategyRegistry,
    StrategyAuthService,
    StrategyAuthGuard,
    WalletStrategy,
    TraditionalStrategy,
    OAuthStrategy,
    ApiKeyStrategy,
  ],
})
export class AuthStrategiesModule implements OnModuleInit {
  constructor(
    private readonly strategyRegistry: StrategyRegistry,
    private readonly walletStrategy: WalletStrategy,
    private readonly traditionalStrategy: TraditionalStrategy,
    private readonly oauthStrategy: OAuthStrategy,
    private readonly apiKeyStrategy: ApiKeyStrategy,
  ) {}

  onModuleInit(): void {
    this.strategyRegistry.register(this.walletStrategy);
    this.strategyRegistry.register(this.traditionalStrategy);
    this.strategyRegistry.register(this.oauthStrategy);
    this.strategyRegistry.register(this.apiKeyStrategy);
  }
}
