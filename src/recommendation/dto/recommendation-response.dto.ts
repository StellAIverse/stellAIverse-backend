export class RecommendationExplanation {
    performanceScore: number;
    usageScore: number;
    performanceWeight: number;
    usageWeight: number;
}

export class RecommendationResponseDto {
    agentId: string;
    name: string;
    totalScore: number;
    explanation: RecommendationExplanation;
}
