import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { CacheService } from "./cache.service";
import { CacheController } from "./cache.controller";
import { CacheWarmerService } from "./services/cache-warmer.service";
import { CacheMetricsService } from "./services/cache-metrics.service";
import { CacheInvalidationListener } from "./listeners/cache-invalidation.listener";
import { CacheJobPlugin } from "./plugins/cache-job.plugin";

@Module({
  imports: [ConfigModule, EventEmitterModule.forRoot()],
  providers: [
    CacheService,
    CacheWarmerService,
    CacheMetricsService,
    CacheInvalidationListener,
    CacheJobPlugin,
  ],
  controllers: [CacheController],
  exports: [
    CacheService,
    CacheWarmerService,
    CacheJobPlugin,
    CacheMetricsService,
  ],
})
export class CacheModule {}
