import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { TerminusModule } from "@nestjs/terminus";
import { EventEmitterModule } from "@nestjs/event-emitter";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";

// Modules
import { AuthModule } from "./auth/auth.module";
import { UserModule } from "./user/user.module";
import { ProfileModule } from "./profile/profile.module";
import { AuditModule } from "./audit/audit.module";
import { OracleModule } from "./oracle/oracle.module";
import { PortfolioModule } from "./portfolio/portfolio.module";
import { RiskManagementModule } from "./risk-management/risk-management.module";
import { DeFiModule } from "./defi/defi.module";
import { AlertsModule } from "./alerts/alerts.module";

// Auth entities
import { User } from "./user/entities/user.entity";
import { EmailVerification } from "./auth/entities/email-verification.entity";
import { Wallet } from "./auth/entities/wallet.entity";

// Oracle entities
import { SignedPayload } from "./oracle/entities/signed-payload.entity";
import { SubmissionNonce } from "./oracle/entities/submission-nonce.entity";

// Audit entities
import { AgentEvent } from "./audit/entities/agent-event.entity";
import { ComputeResult } from "./audit/entities/compute-result.entity";
import { ProvenanceRecord } from "./audit/entities/provenance-record.entity";

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

// Alerts entities
import { Alert } from "./alerts/entities/alert.entity";
import { AlertTriggerLog } from "./alerts/entities/alert-trigger-log.entity";

// Guards
import { ThrottlerUserIpGuard } from "./common/guard/throttler.guard";
import { RolesGuard } from "./common/guard/roles.guard";
import { KycGuard } from "./common/guard/kyc.guard";
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
            Wallet,
            SignedPayload,
            SubmissionNonce,
            AgentEvent,
            ComputeResult,
            ProvenanceRecord,
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
            Alert,
            AlertTriggerLog,
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
      throttlers: [
        { name: "global", ttl: 60_000, limit: 100 },
        { name: "auth", ttl: 60_000, limit: 5 },
        { name: "trading", ttl: 60_000, limit: 20 },
        { name: "oracle", ttl: 60_000, limit: 10 },
      ],
    }),

    EventEmitterModule.forRoot(),
    TerminusModule,

    AuthModule,
    UserModule,
    ProfileModule,
    AuditModule,
    OracleModule,
    PortfolioModule,
    RiskManagementModule,
    DeFiModule,
    AlertsModule,
  ],

  controllers: [AppController],

  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerUserIpGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: KycGuard,
    },
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly verifier: SubmissionVerifierService) {}

  onModuleInit() {
    this.verifier.start();
  }
}
