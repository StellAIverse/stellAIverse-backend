import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule } from "@nestjs/schedule";
import { Waitlist } from "./entities/waitlist.entity";
import { WaitlistEntry } from "./entities/waitlist-entry.entity";
import { WaitlistEvent } from "./entities/waitlist-event.entity";
import { WaitlistExplanation } from "./entities/explanation.entity";
import { AiAuditTrail } from "./entities/audit-trail.entity";
import { WaitlistService } from "./waitlist.service";
import { FeatureEngineeringService } from "./feature-engineering.service";
import { ModelTrainingService } from "./model-training.service";
import { InferencePipelineService } from "./inference-pipeline.service";
import { ExplainableAIService } from "./explainable-ai.service";
import { ContinuousLearningService } from "./continuous-learning.service";
import { DynamicPriorityScoringService } from "./dynamic-priority-scoring.service";
import { ExplainableAIController } from "./explainable-ai.controller";
import { ContinuousLearningController } from "./continuous-learning.controller";
import { DynamicPriorityScoringController } from "./dynamic-priority-scoring.controller";
import { WebSocketModule } from "../websocket/websocket.module";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Waitlist, WaitlistEntry, WaitlistEvent, WaitlistExplanation, AiAuditTrail]),
    WebSocketModule,
  ],
  controllers: [
    ExplainableAIController,
    ContinuousLearningController,
    DynamicPriorityScoringController,
  ],
  providers: [
    WaitlistService,
    FeatureEngineeringService,
    ModelTrainingService,
    InferencePipelineService,
    ExplainableAIService,
    ContinuousLearningService,
    DynamicPriorityScoringService,
  ],
  exports: [
    TypeOrmModule,
    WaitlistService,
    FeatureEngineeringService,
    ModelTrainingService,
    InferencePipelineService,
    ExplainableAIService,
    ContinuousLearningService,
    DynamicPriorityScoringService,
  ],
})
export class WaitlistModule {}
