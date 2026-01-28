import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
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
import { SignedPayload } from "./oracle/entities/signed-payload.entity";
import { SubmissionNonce } from "./oracle/entities/submission-nonce.entity";
import { ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerUserIpGuard } from "./common/guard/throttler.guard";
import { WebSocketModule } from "./websocket/websocket.module";
import { ObservabilityModule } from "./observability/observability.module";
import { OracleModule } from "./oracle/oracle.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    TypeOrmModule.forRoot({
      type: "postgres",
      url:
        process.env.DATABASE_URL ||
        "postgresql://stellaiverse:password@localhost:5432/stellaiverse",
      entities: [User, EmailVerification, SignedPayload, SubmissionNonce],
      synchronize: process.env.NODE_ENV !== "production", // Auto-sync in development
      logging: process.env.NODE_ENV === "development",
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        { name: "global", ttl: 60_000, limit: 120 }, // 120 req/min default
      ],
    }),
    AuthModule,
    UserModule,
    ProfileModule,
    AgentModule,
    RecommendationModule,
    ComputeModule,
    WebSocketModule,
    ObservabilityModule,
    OracleModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerUserIpGuard,
    },
  ],
})
export class AppModule {}
