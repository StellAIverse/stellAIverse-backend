import { Controller, Get } from '@nestjs/common';
import { RecommendationService } from './recommendation.service';
import { RecommendationResponseDto } from './dto/recommendation-response.dto';

@Controller('recommendations')
export class RecommendationController {
    constructor(private readonly recommendationService: RecommendationService) { }

    @Get()
    getRecommendations(): RecommendationResponseDto[] {
        return this.recommendationService.getRecommendations();
    }
}
