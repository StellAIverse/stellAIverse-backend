export interface MLFeatureVector {
  userHasHistory: number;
  userAvgRating: number;
  agentPerformanceScore: number;
  agentUsageCount: number;
  agentHasUserHistory: number;
  agentAvgFeedback: number;
  recencyScore: number;
  capabilityMatch: number;
  bias: number;
}

export class RecommendationExplanation {
  performanceScore: number;
  usageScore: number;
  performanceWeight: number;
  usageWeight: number;
  mlFeatures?: MLFeatureVector;
}

export class RecommendationResponseDto {
  agentId: string;
  name: string;
  totalScore: number;
  mlScore?: number;
  traditionalScore?: number;
  explanation: RecommendationExplanation;
}
