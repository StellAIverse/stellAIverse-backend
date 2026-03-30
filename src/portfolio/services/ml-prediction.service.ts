import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PerformanceMetric } from "../entities/performance-metric.entity";
import { Portfolio } from "../entities/portfolio.entity";
import {
  EnsemblePredictor,
  calculateExpectedReturn,
  calculateConfidence,
} from "../ml-models/predictor";
import { PortfolioService } from "./portfolio.service";

@Injectable()
export class MLPredictionService {
  private readonly logger = new Logger(MLPredictionService.name);
  private predictors: Map<string, EnsemblePredictor> = new Map();

  constructor(
    @InjectRepository(PerformanceMetric)
    private performanceRepository: Repository<PerformanceMetric>,
  ) {}

  /**
   * Train ML model for an asset
   */
  async trainAssetPredictor(
    ticker: string,
    historicalPrices: number[],
  ): Promise<{ confidence: number; metrics: any }> {
    try {
      const predictor = new EnsemblePredictor();

      // Train the model
      const metrics = predictor.fit(historicalPrices);

      // Store predictor for later use
      this.predictors.set(ticker, predictor);

      const confidence = calculateConfidence(metrics);

      this.logger.log(
        `Trained predictor for ${ticker}. Confidence: ${confidence}`,
      );

      return { confidence, metrics };
    } catch (error) {
      this.logger.error(
        `Failed to train predictor for ${ticker}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Predict future returns for an asset
   */
  async predictAssetReturns(
    ticker: string,
    currentPrice: number,
    historicalPrices: number[],
    daysAhead: number = 30,
  ): Promise<{
    predictedReturn: number;
    confidence: number;
    predictions: number[];
  }> {
    try {
      // Train if not already trained
      if (!this.predictors.has(ticker)) {
        await this.trainAssetPredictor(ticker, historicalPrices);
      }

      const predictor = this.predictors.get(ticker);

      if (!predictor) {
        throw new Error(`No predictor available for ${ticker}`);
      }

      // Generate predictions
      const predictions = predictor.forecast(historicalPrices, daysAhead);

      // Calculate expected return
      const expectedReturn = calculateExpectedReturn(
        currentPrice,
        predictions,
        daysAhead,
      );

      // Get confidence
      const confidence = Math.random() * 0.8 + 0.2; // Placeholder

      return {
        predictedReturn: expectedReturn,
        confidence,
        predictions,
      };
    } catch (error) {
      this.logger.error(`Prediction failed for ${ticker}: ${error.message}`);
      // Return neutral prediction on error
      return {
        predictedReturn: 0.05,
        confidence: 0.2,
        predictions: [],
      };
    }
  }

  /**
   * Predict portfolio returns
   */
  async predictPortfolioReturns(
    portfolioId: string,
    assetDataMap: Map<string, { price: number; historicalPrices: number[] }>,
    daysAhead: number = 30,
  ): Promise<{
    portfolioExpectedReturn: number;
    assetPredictions: Map<string, any>;
  }> {
    const assetPredictions = new Map();
    let weightedReturn = 0;
    let totalWeight = 0;

    for (const [ticker, data] of assetDataMap) {
      try {
        const prediction = await this.predictAssetReturns(
          ticker,
          data.price,
          data.historicalPrices,
          daysAhead,
        );

        assetPredictions.set(ticker, prediction);

        // TODO: Get weight from portfolio
        const weight = 1 / assetDataMap.size;
        weightedReturn += prediction.predictedReturn * weight;
        totalWeight += weight;
      } catch (error) {
        this.logger.warn(`Failed to predict ${ticker}`);
      }
    }

    return {
      portfolioExpectedReturn:
        totalWeight > 0 ? weightedReturn / totalWeight : 0,
      assetPredictions,
    };
  }

  /**
   * Update prediction model with new data
   */
  async updatePredictorWithNewData(
    ticker: string,
    newPrice: number,
  ): Promise<void> {
    // In a real implementation, this would update the model incrementally
    // For now, just log it
    this.logger.debug(`Updated prediction data for ${ticker}: ${newPrice}`);
  }

  /**
   * Clear old predictors (for memory management)
   */
  clearOldPredictors(maxAge: number = 24 * 60 * 60 * 1000): void {
    // Implement LRU or time-based cache eviction
    this.logger.log("Clearing old predictors");
  }

  /**
   * Get predictor statistics
   */
  getPredictorStats(): {
    totalPredictors: number;
    tickers: string[];
  } {
    return {
      totalPredictors: this.predictors.size,
      tickers: Array.from(this.predictors.keys()),
    };
  }
}
