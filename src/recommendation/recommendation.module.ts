import { Module } from '@nestjs/common';
import { RecommendationService } from './recommendation.service';
import { RecommendationController } from './recommendation.controller';
import { AgentModule } from '../agent/agent.module';

@Module({
    imports: [AgentModule],
    controllers: [RecommendationController],
    providers: [RecommendationService],
})
export class RecommendationModule { }
