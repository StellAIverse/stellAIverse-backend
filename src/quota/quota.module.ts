import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { RateLimiterService } from "./rate-limiter.service";
import { QuotaController } from "./quota.controller";
import { PolicyController } from "./policy.controller";
import { PolicyService } from "./policy.service";

@Module({
  imports: [ConfigModule],
  providers: [RateLimiterService, PolicyService],
  controllers: [QuotaController, PolicyController],
  exports: [RateLimiterService, PolicyService],
})
export class QuotaModule {}
