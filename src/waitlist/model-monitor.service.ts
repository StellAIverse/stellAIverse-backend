import { Injectable } from "@nestjs/common";

interface PredictionRecord {
  userId: string;
  score: number;
}

@Injectable()
export class ModelMonitorService {
  private readonly predictions: PredictionRecord[] = [];

  recordPrediction(userId: string, score: number): void {
    this.predictions.push({ userId, score });
  }

  getPerformanceMetrics(): { count: number; avgScore: number } {
    const count = this.predictions.length;
    if (count === 0) return { count: 0, avgScore: 0 };
    const avgScore =
      this.predictions.reduce((sum, p) => sum + p.score, 0) / count;
    return { count, avgScore };
  }

  detectDrift(threshold: number): boolean {
    const { avgScore } = this.getPerformanceMetrics();
    return Math.abs(avgScore - 0.5) > threshold;
  }
}
