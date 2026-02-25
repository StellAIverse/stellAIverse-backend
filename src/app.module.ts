import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { UserModule } from "./user/user.module";
import { ProfileModule } from "./profile/profile.module";
import { AgentModule } from "./agent/agent.module";
import { RecommendationModule } from "./recommendation/recommendation.module";
import { ComputeModule } from "./compute/compute.module";
import { User } from "./user/entities/user.entity";
import { EmailVerification } from "./auth/entities/email-verification.entity";
import { IndexedEvent } from "./indexer/entities/indexed-event.entity";
import { IndexerModule } from "./indexer/indexer.module";
import { SignedPayload } from "./oracle/entities/signed-payload.entity";
import { SubmissionNonce } from "./oracle/entities/submission-nonce.entity";
import { AuditModule } from "./audit/audit.module";
import { AgentEvent } from "./audit/entities/agent-event.entity";
import { OracleSubmission } from "./audit/entities/oracle-submission.entity";
import { ComputeResult } from "./audit/entities/compute-result.entity";
import { ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerUserIpGuard } from "./common/guard/throttler.guard";
import { WebSocketModule } from "./websocket/websocket.module";
import { ObservabilityModule } from "./observability/observability.module";
import { OracleModule } from "./oracle/oracle.module";
import { HealthModule } from "./health/health.module";
import { ConfigModule as ValidationConfigModule } from "./validation/config.module";

@Module({
  imports: [
    ValidationConfigModule,
    // Rate Limiting - Global protection against brute force and DoS
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'global', ttl: 60_000, limit: 100 }, // 100 req/min per IP
      ],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get('NODE_ENV') === 'production';
        
        if (isProduction && !configService.get('DATABASE_URL')) {
          throw new Error('DATABASE_URL must be set in production');
        }

        return {
          type: 'postgres',
          url: configService.get('DATABASE_URL') || 'postgresql://stellaiverse:password@localhost:5432/stellaiverse',
          entities: [User, EmailVerification, SignedPayload, SubmissionNonce, AgentEvent, OracleSubmission, ComputeResult],
          synchronize: !isProduction, // Auto-sync in development only
          logging: configService.get('NODE_ENV') === 'development',
          ssl: isProduction ? { rejectUnauthorized: false } : false,
          extra: {
            max: 20, // Maximum pool size
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
          },
        };
      },
    }),
    AuthModule,
    UserModule,
    ProfileModule,
    AgentModule,
    RecommendationModule,
    ComputeModule,
    WebSocketModule,
    ObservabilityModule,
    IndexerModule,
    AuditModule,
    OracleModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply rate limiting globally with IP-based throttling
    {
      provide: APP_GUARD,
      useClass: ThrottlerUserIpGuard,
    },
  ],
})
export class AppModule {}
