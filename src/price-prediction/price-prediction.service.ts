import { Injectable, Logger } from '@nestjs/common';
import {
  PredictionRequestDto,
  PredictionResponseDto,
  PricePrediction,
  ModelMetricsDto,
  BacktestRequestDto,
  Timeframe,
} from './dto/prediction.dto';

@Injectable()
export class PricePredictionService {
  private readonly logger = new Logger(PricePredictionService.name);

  private readonly MODEL_VERSION = '1.0.0';

  private readonly SUPPORTED_SYMBOLS = [
    'BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'XRP', 'DOT', 'AVAX', 'MATIC', 'LINK',
    'UNI', 'ATOM', 'LTC', 'BCH', 'ALGO', 'VET', 'FIL', 'TRX', 'ETC', 'XLM',
    'THETA', 'AAVE', 'EOS', 'MKR', 'COMP', 'SNX', 'YFI', 'SUSHI', 'CRV', 'BAL',
    'ZEC', 'DASH', 'XMR', 'NEO', 'WAVES', 'IOTA', 'ONT', 'ZIL', 'ICX', 'QTUM',
    'OMG', 'BAT', 'ZRX', 'KNC', 'REN', 'BAND', 'STORJ', 'GRT', 'SKL', 'NMR',
  ];

  async predict(dto: PredictionRequestDto): Promise<PredictionResponseDto> {
    const symbol = dto.symbol.toUpperCase();
    const periods = dto.periods ?? 10;
    const currentPrice = this.getMockCurrentPrice(symbol);

    const predictions = this.generatePredictions(currentPrice, dto.timeframe, periods);
    const confidence = this.calculateModelConfidence(symbol, dto.timeframe);

    this.logger.log(`Generated ${periods} predictions for ${symbol} on ${dto.timeframe}`);

    return {
      symbol,
      timeframe: dto.timeframe,
      currentPrice,
      predictions,
      confidence,
      modelVersion: this.MODEL_VERSION,
      generatedAt: new Date(),
    };
  }

  async getModelMetrics(): Promise<ModelMetricsDto> {
    return {
      modelVersion: this.MODEL_VERSION,
      accuracy: 0.68,
      mse: 0.0023,
      mae: 0.031,
      lastTrainedAt: new Date(Date.now() - 86400000),
      trainingDataPoints: 2_500_000,
      supportedSymbols: this.SUPPORTED_SYMBOLS,
      supportedTimeframes: Object.values(Timeframe),
    };
  }

  async backtest(dto: BacktestRequestDto): Promise<{
    symbol: string;
    timeframe: Timeframe;
    accuracy: number;
    totalPredictions: number;
    correctDirections: number;
    mse: number;
    mae: number;
    period: { start: Date; end: Date };
  }> {
    const totalPredictions = Math.floor(
      (dto.endTimestamp - dto.startTimestamp) / this.getTimeframeMs(dto.timeframe),
    );
    const correctDirections = Math.floor(totalPredictions * 0.65);

    return {
      symbol: dto.symbol.toUpperCase(),
      timeframe: dto.timeframe,
      accuracy: correctDirections / totalPredictions,
      totalPredictions,
      correctDirections,
      mse: 0.0025,
      mae: 0.033,
      period: {
        start: new Date(dto.startTimestamp),
        end: new Date(dto.endTimestamp),
      },
    };
  }

  getSupportedSymbols(): string[] {
    return this.SUPPORTED_SYMBOLS;
  }

  private generatePredictions(
    currentPrice: number,
    timeframe: Timeframe,
    periods: number,
  ): PricePrediction[] {
    const predictions: PricePrediction[] = [];
    const intervalMs = this.getTimeframeMs(timeframe);
    let price = currentPrice;

    for (let i = 1; i <= periods; i++) {
      // Simple random walk with slight upward drift (mock LSTM output)
      const drift = 0.0001;
      const volatility = 0.005;
      const change = drift + volatility * (Math.random() * 2 - 1);
      price = price * (1 + change);

      const uncertainty = volatility * Math.sqrt(i) * price;
      const confidence = Math.max(0.4, 0.9 - i * 0.04);

      predictions.push({
        timestamp: new Date(Date.now() + i * intervalMs),
        predictedPrice: parseFloat(price.toFixed(6)),
        lowerBound: parseFloat((price - uncertainty * 1.96).toFixed(6)),
        upperBound: parseFloat((price + uncertainty * 1.96).toFixed(6)),
        confidence,
      });
    }

    return predictions;
  }

  private getMockCurrentPrice(symbol: string): number {
    const prices: Record<string, number> = {
      BTC: 65000, ETH: 3200, BNB: 420, SOL: 145, ADA: 0.45,
      XRP: 0.52, DOT: 7.2, AVAX: 35, MATIC: 0.85, LINK: 14,
    };
    return prices[symbol] ?? 1.0;
  }

  private calculateModelConfidence(symbol: string, timeframe: Timeframe): number {
    const timeframeConfidence: Record<Timeframe, number> = {
      [Timeframe.ONE_MIN]: 0.55,
      [Timeframe.FIVE_MIN]: 0.62,
      [Timeframe.ONE_HOUR]: 0.70,
      [Timeframe.ONE_DAY]: 0.75,
    };
    return timeframeConfidence[timeframe] ?? 0.65;
  }

  private getTimeframeMs(timeframe: Timeframe): number {
    const ms: Record<Timeframe, number> = {
      [Timeframe.ONE_MIN]: 60_000,
      [Timeframe.FIVE_MIN]: 300_000,
      [Timeframe.ONE_HOUR]: 3_600_000,
      [Timeframe.ONE_DAY]: 86_400_000,
    };
    return ms[timeframe];
  }
}
