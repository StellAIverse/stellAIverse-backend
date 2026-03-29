import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";

import { AuthModule } from "./auth/auth.module";
import { UserModule } from "./user/user.module";
import { ProfileModule } from "./profile/profile.module";
import { AgentModule } from "./agent/agent.module";
import { RecommendationModule } from "./recommendation/recommendation.module";
import { ComputeModule } from "./compute/compute.module";
import { IndexerModule } from "./indexer/indexer.module";
import { AuditModule } from "./audit/audit.module";
import { OracleModule } from "./oracle/oracle.module";
import { HealthModule } from "./health/health.module";
import { QuotaModule } from "./quota/quota.module";
import { ReferralModule } from "./referral/referral.module";
import { WebSocketModule } from "./websocket/websocket.module";
import { ObservabilityModule } from "./observability/observability.module";
import { PortfolioModule } from "./portfolio/portfolio.module";
import { DeFiModule } from "./defi/defi.module";

import { User } from "./user/entities/user.entity";
import { EmailVerification } from "./auth/entities/email-verification.entity";
import { SignedPayload } from "./oracle/entities/signed-payload.entity";
import { SubmissionNonce } from "./oracle/entities/submission-nonce.entity";
import { AgentEvent } from "./audit/entities/agent-event.entity";
import { ComputeResult } from "./audit/entities/compute-result.entity";
import { ProvenanceRecord } from "./audit/entities/provenance-record.entity";
import { Wallet } from "./auth/entities/wallet.entity";
import { ReferralReward } from "./referral/reward.entity";
import { Referral } from "./referral/entities/referral.entity";
// Portfolio entities
import { Portfolio } from "./portfolio/entities/portfolio.entity";
import { PortfolioAsset } from "./portfolio/entities/portfolio-asset.entity";
import { RiskProfile } from "./portfolio/entities/risk-profile.entity";
import { OptimizationHistory } from "./portfolio/entities/optimization-history.entity";
import { RebalancingEvent } from "./portfolio/entities/rebalancing-event.entity";
import { PerformanceMetric } from "./portfolio/entities/performance-metric.entity";
import { BacktestResult } from "./portfolio/entities/backtest-result.entity";

// DeFi entities
import { DeFiPosition } from "./defi/entities/defi-position.entity";
import { DeFiYieldRecord } from "./defi/entities/defi-yield-record.entity";
import { DeFiTransaction } from "./defi/entities/defi-transaction.entity";
import { DeFiYieldStrategy } from "./defi/entities/defi-yield-strategy.entity";
import { DeFiRiskAssessment } from "./defi/entities/defi-risk-assessment.entity";

import { QuotaGuard } from "./common/guard/quota.guard";
import { SubmissionVerifierService } from "./oracle/submission-verifier.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),

    // ✅ ONLY ONE TypeORM CONFIG (Async)
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get("NODE_ENV") === "production";

        if (isProduction && !configService.get("DATABASE_URL")) {
          throw new Error("DATABASE_URL must be set in production");
        }

        return {
          type: "postgres",
          url:
            configService.get("DATABASE_URL") ||
            "postgresql://stellaiverse:password@localhost:5432/stellaiverse",
          entities: [
            User,
            EmailVerification,
            SignedPayload,
            SubmissionNonce,
            AgentEvent,
            ComputeResult,
            ProvenanceRecord,
            Wallet,
            ReferralReward,
            Referral,
            Portfolio,
            PortfolioAsset,
            RiskProfile,
            OptimizationHistory,
            RebalancingEvent,
            PerformanceMetric,
            BacktestResult,
            DeFiPosition,
            DeFiYieldRecord,
            DeFiTransaction,
            DeFiYieldStrategy,
            DeFiRiskAssessment,
          ],
          synchronize: !isProduction,
          logging: isProduction ? ["error"] : ["error", "warn", "schema"],
          ssl: isProduction ? { rejectUnauthorized: false } : false,
          extra: {
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
          },
        };
      },
    }),

    ThrottlerModule.forRoot({
      throttlers: [{ name: "global", ttl: 60_000, limit: 100 }],
    }),

    AuthModule,
    UserModule,
    ProfileModule,
    AgentModule,
    RecommendationModule,
    ComputeModule,
    WebSocketModule,
    PortfolioModule,
    DeFiModule,
    ObservabilityModule,
    IndexerModule,
    AuditModule,
    OracleModule,
    HealthModule,
    QuotaModule,
    ReferralModule,
  ],

  controllers: [AppController],

  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: QuotaGuard,
    },
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly verifier: SubmissionVerifierService) {}

  onModuleInit() {
    this.verifier.start();
  }
}