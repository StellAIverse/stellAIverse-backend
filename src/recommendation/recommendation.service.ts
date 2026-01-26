import { Injectable } from '@nestjs/common';
import { AgentService } from '../agent/agent.service';
import { RecommendationResponseDto } from './dto/recommendation-response.dto';

@Injectable()
export class RecommendationService {
    private readonly PERFORMANCE_WEIGHT = 0.7;
    private readonly USAGE_WEIGHT = 0.3;

    constructor(private readonly agentService: AgentService) { }

    getRecommendations(): RecommendationResponseDto[] {
        const agents = this.agentService.findAll();
        if (agents.length === 0) return [];

        // Find max usage for normalization
        const maxUsage = Math.max(...agents.map((a) => a.usageCount), 1);

        const recommendations = agents.map((agent) => {
            const normalizedUsage = (agent.usageCount / maxUsage) * 100;

            const performanceContribution = agent.performanceScore * this.PERFORMANCE_WEIGHT;
            const usageContribution = normalizedUsage * this.USAGE_WEIGHT;

            const totalScore = parseFloat((performanceContribution + usageContribution).toFixed(2));

            return {
                agentId: agent.id,
                name: agent.name,
                totalScore,
                explanation: {
                    performanceScore: agent.performanceScore,
                    usageScore: parseFloat(normalizedUsage.toFixed(2)),
                    performanceWeight: this.PERFORMANCE_WEIGHT,
                    usageWeight: this.USAGE_WEIGHT,
                },
            };
        });

        // Sort by total score descending
        return recommendations.sort((a, b) => b.totalScore - a.totalScore);
    }
}
