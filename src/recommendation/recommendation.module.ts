import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RecommendationService } from "./recommendation.service";
import { RecommendationController } from "./recommendation.controller";
import { AgentModule } from "../agent/agent.module";
import { MLModelService } from "./ml-model.service";
import { FeedbackService } from "./feedback.service";
import { RecommendationAuditService } from "./recommendation-audit.service";
import { RecommendationFeedback } from "./entities/recommendation-feedback.entity";
import { RecommendationInteraction } from "./entities/recommendation-interaction.entity";

@Module({
  imports: [
    AgentModule,
    TypeOrmModule.forFeature([
      RecommendationFeedback,
      RecommendationInteraction,
    ]),
  ],
  controllers: [RecommendationController],
  providers: [
    RecommendationService,
    MLModelService,
    FeedbackService,
    RecommendationAuditService,
  ],
  exports: [
    RecommendationService,
    MLModelService,
    FeedbackService,
  ],
})
export class RecommendationModule {}
