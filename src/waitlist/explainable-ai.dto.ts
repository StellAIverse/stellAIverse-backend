/// Data transfer objects for explainable AI prediction output.

export interface FeatureImportance {
  feature: string;
  weight: number;
}

export interface PredictionExplanation {
  userId: string;
  score: number;
  features: FeatureImportance[];
  explanation: string;
}
