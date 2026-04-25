import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Waitlist } from "./entities/waitlist.entity";
import { WaitlistEntry } from "./entities/waitlist-entry.entity";
import { WaitlistEvent } from "./entities/waitlist-event.entity";
import { WaitlistService } from "./waitlist.service";
import { FeatureEngineeringService } from "./feature-engineering.service";
import { ModelTrainingService } from "./model-training.service";
import { InferencePipelineService } from "./inference-pipeline.service";
import { WebSocketModule } from "../websocket/websocket.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Waitlist, WaitlistEntry, WaitlistEvent]),
    WebSocketModule,
  ],
  providers: [
    WaitlistService,
    FeatureEngineeringService,
    ModelTrainingService,
    InferencePipelineService,
  ],
  exports: [
    TypeOrmModule,
    WaitlistService,
    FeatureEngineeringService,
    ModelTrainingService,
    InferencePipelineService,
  ],
})
export class WaitlistModule {}
