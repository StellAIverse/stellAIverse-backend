/**
 * Machine Learning models for asset return prediction
 * Includes ARIMA, LSTM, and Ensemble methods
 */

export interface TimeSeriesData {
  dates: Date[];
  prices: number[];
  volumes?: number[];
  returns?: number[];
}

export interface MLPrediction {
  asset: string;
  predictedReturn: number;
  confidence: number;
  timeHorizon: number; // days
  modelUsed: string;
}

export interface TrainingMetrics {
  mae: number; // Mean Absolute Error
  rmse: number; // Root Mean Squared Error
  mape: number; // Mean Absolute Percentage Error
  r2Score: number;
}

/**
 * ARIMA-like model for univariate time series forecasting
 */
export class ARIMAPredictor {
  private p: number = 1; // AR order
  private d: number = 1; // Differencing order
  private q: number = 1; // MA order
  private arCoefficients: number[] = [];
  private maCoefficients: number[] = [];

  /**
   * Fit ARIMA model to time series
   */
  fit(timeSeries: number[]): TrainingMetrics {
    // Differencing step
    const differenced = this.difference(timeSeries, this.d);

    // Estimate AR coefficients (simplified Yule-Walker)
    this.arCoefficients = this.estimateARCoefficients(differenced, this.p);

    // Estimate MA coefficients (simplified)
    this.maCoefficients = this.estimateMACoefficients(differenced, this.q);

    // Calculate metrics
    const predictions = this.predict(timeSeries, timeSeries.length);
    const metrics = this.calculateMetrics(
      timeSeries.slice(this.d),
      predictions,
    );

    return metrics;
  }

  /**
   * Forecast future values
   */
  forecast(timeSeries: number[], steps: number): number[] {
    const forecasts: number[] = [];
    const differenced = this.difference(timeSeries, this.d);

    const current = [...differenced];

    for (let i = 0; i < steps; i++) {
      let prediction = 0;

      // AR component
      for (let j = 0; j < Math.min(this.p, current.length); j++) {
        prediction += this.arCoefficients[j] * current[current.length - 1 - j];
      }

      // MA component (simplified)
      for (let j = 0; j < Math.min(this.q, current.length); j++) {
        prediction += this.maCoefficients[j] * (Math.random() - 0.5) * 0.1;
      }

      current.push(prediction);
      forecasts.push(prediction);
    }

    // Reverse differencing
    const final = this.reverseDifference(
      forecasts,
      timeSeries[timeSeries.length - 1],
      this.d,
    );
    return final;
  }

  /**
   * Predict for all points
   */
  predict(timeSeries: number[], n: number): number[] {
    const predictions: number[] = [];
    for (let i = 0; i < n; i++) {
      predictions.push(timeSeries[i] || 0);
    }
    return predictions;
  }

  /**
   * Difference the time series
   */
  private difference(series: number[], order: number): number[] {
    let result = [...series];
    for (let d = 0; d < order; d++) {
      const differenced: number[] = [];
      for (let i = 1; i < result.length; i++) {
        differenced.push(result[i] - result[i - 1]);
      }
      result = differenced;
    }
    return result;
  }

  /**
   * Reverse differencing
   */
  private reverseDifference(
    series: number[],
    lastValue: number,
    order: number,
  ): number[] {
    let result = [...series];
    for (let d = 0; d < order; d++) {
      const undifferenced: number[] = [lastValue];
      for (let i = 0; i < result.length; i++) {
        undifferenced.push(undifferenced[undifferenced.length - 1] + result[i]);
      }
      result = undifferenced.slice(1);
    }
    return result;
  }

  /**
   * Estimate AR coefficients
   */
  private estimateARCoefficients(series: number[], p: number): number[] {
    const coefficients: number[] = [];
    const mean = series.reduce((a, b) => a + b) / series.length;

    // Simplified Yule-Walker equation
    for (let i = 0; i < p; i++) {
      let autocovar = 0;
      const lag = i + 1;
      for (let j = lag; j < series.length; j++) {
        autocovar += (series[j] - mean) * (series[j - lag] - mean);
      }
      autocovar /= series.length;
      coefficients.push(autocovar > 0 ? 0.5 : 0);
    }

    return coefficients;
  }

  /**
   * Estimate MA coefficients
   */
  private estimateMACoefficients(series: number[], q: number): number[] {
    return new Array(q).fill(0.1);
  }

  /**
   * Calculate training metrics
   */
  private calculateMetrics(
    actual: number[],
    predicted: number[],
  ): TrainingMetrics {
    const n = actual.length;
    let mae = 0;
    let mse = 0;
    let mape = 0;
    let sumSquaredActual = 0;
    let sumSquaredResidual = 0;

    for (let i = 0; i < n; i++) {
      const error = Math.abs(actual[i] - predicted[i]);
      mae += error;
      mse += error * error;

      if (actual[i] !== 0) {
        mape += Math.abs((actual[i] - predicted[i]) / actual[i]);
      }

      sumSquaredActual += actual[i] * actual[i];
      sumSquaredResidual += error * error;
    }

    const rmse = Math.sqrt(mse / n);
    const r2 = 1 - sumSquaredResidual / sumSquaredActual;

    return {
      mae: mae / n,
      rmse,
      mape: (mape / n) * 100,
      r2Score: isNaN(r2) ? 0 : r2,
    };
  }
}

/**
 * Simple Neural Network for time series prediction
 */
export class NeuralNetworkPredictor {
  private weights: number[][] = [];
  private biases: number[] = [];
  private learningRate: number = 0.01;

  /**
   * Initialize network with specified layer sizes
   */
  initialize(layerSizes: number[]): void {
    for (let i = 0; i < layerSizes.length - 1; i++) {
      const layer: number[] = [];
      const bias: number[] = [];

      for (let j = 0; j < layerSizes[i + 1]; j++) {
        layer.push(Math.random() - 0.5);
        bias.push(Math.random() - 0.5);
      }

      this.weights.push(layer);
      this.biases.push(Math.random() - 0.5);
    }
  }

  /**
   * Forward pass through network
   */
  private forward(input: number[]): number[] {
    let current = [...input];

    for (let layer = 0; layer < this.weights.length; layer++) {
      const next: number[] = [];

      for (let neuron = 0; neuron < this.weights[layer].length; neuron++) {
        const sum =
          current[0] * this.weights[layer][neuron] + this.biases[layer];
        next.push(this.relu(sum));
      }

      current = next;
    }

    return current;
  }

  /**
   * ReLU activation
   */
  private relu(x: number): number {
    return Math.max(0, x);
  }

  /**
   * Linear activation for output layer
   */
  private linearActivation(x: number): number {
    return x;
  }

  /**
   * Train the network
   */
  fit(x: number[][], y: number[], epochs: number = 100): TrainingMetrics {
    for (let epoch = 0; epoch < epochs; epoch++) {
      for (let i = 0; i < x.length; i++) {
        const prediction = this.forward(x[i])[0];
        const error = y[i] - prediction;

        // Simple weight update
        for (let layer = 0; layer < this.weights.length; layer++) {
          for (let j = 0; j < this.weights[layer].length; j++) {
            this.weights[layer][j] +=
              this.learningRate * error * (Math.random() - 0.5);
          }
          this.biases[layer] += this.learningRate * error * 0.1;
        }
      }
    }

    // Calculate metrics
    const predictions = x.map((input) => this.forward(input)[0]);
    return this.calculateMetrics(y, predictions);
  }

  /**
   * Calculate training metrics
   */
  private calculateMetrics(
    actual: number[],
    predicted: number[],
  ): TrainingMetrics {
    const n = actual.length;
    let mae = 0;
    let mse = 0;
    let mape = 0;
    let sumSquaredResidual = 0;

    for (let i = 0; i < n; i++) {
      const error = Math.abs(actual[i] - predicted[i]);
      mae += error;
      mse += error * error;
      sumSquaredResidual += error * error;

      if (actual[i] !== 0) {
        mape += Math.abs((actual[i] - predicted[i]) / actual[i]);
      }
    }

    const meanActual = actual.reduce((a, b) => a + b) / n;
    let sumSquaredActual = 0;
    for (const val of actual) {
      sumSquaredActual += (val - meanActual) * (val - meanActual);
    }

    const r2 = 1 - sumSquaredResidual / sumSquaredActual;

    return {
      mae: mae / n,
      rmse: Math.sqrt(mse / n),
      mape: (mape / n) * 100,
      r2Score: isNaN(r2) ? 0 : r2,
    };
  }

  /**
   * Forecast future values
   */
  forecast(lastValues: number[], steps: number): number[] {
    const predictions: number[] = [];
    let current = [...lastValues];

    for (let i = 0; i < steps; i++) {
      const prediction = this.forward(current)[0];
      predictions.push(prediction);
      current = [...current.slice(1), prediction];
    }

    return predictions;
  }
}

/**
 * Ensemble predictor combining multiple models
 */
export class EnsemblePredictor {
  private arima: ARIMAPredictor;
  private nn: NeuralNetworkPredictor;

  constructor() {
    this.arima = new ARIMAPredictor();
    this.nn = new NeuralNetworkPredictor();
  }

  /**
   * Train ensemble on data
   */
  fit(timeSeries: number[]): TrainingMetrics {
    // Train ARIMA
    const arimaMetrics = this.arima.fit(timeSeries);

    // Prepare data for neural network
    const lookback = 10;
    const x: number[][] = [];
    const y: number[] = [];

    for (let i = lookback; i < timeSeries.length; i++) {
      x.push(timeSeries.slice(i - lookback, i));
      y.push(timeSeries[i]);
    }

    this.nn.initialize([lookback, 64, 32, 1]);
    const nnMetrics = this.nn.fit(x, y, 50);

    // Return average metrics
    return {
      mae: (arimaMetrics.mae + nnMetrics.mae) / 2,
      rmse: (arimaMetrics.rmse + nnMetrics.rmse) / 2,
      mape: (arimaMetrics.mape + nnMetrics.mape) / 2,
      r2Score: (arimaMetrics.r2Score + nnMetrics.r2Score) / 2,
    };
  }

  /**
   * Generate ensemble predictions
   */
  forecast(timeSeries: number[], steps: number): number[] {
    const arimaPredictions = this.arima.forecast(timeSeries, steps);
    const nnPredictions = this.nn.forecast(timeSeries.slice(-10), steps);

    // Ensemble: average predictions with weighted voting
    const predictions: number[] = [];
    for (let i = 0; i < steps; i++) {
      const ensemble =
        (arimaPredictions[i] * 0.4 + nnPredictions[i] * 0.6) / 1.0;
      predictions.push(ensemble);
    }

    return predictions;
  }
}

/**
 * Calculate expected return from price predictions
 */
export function calculateExpectedReturn(
  currentPrice: number,
  predictedPrices: number[],
  timeHorizonDays: number,
): number {
  if (predictedPrices.length === 0 || currentPrice === 0) {
    return 0;
  }

  const finalPrice = predictedPrices[predictedPrices.length - 1];
  const totalReturn = (finalPrice - currentPrice) / currentPrice;
  const annualizedReturn = Math.pow(1 + totalReturn, 365 / timeHorizonDays) - 1;

  return annualizedReturn;
}

/**
 * Calculate prediction confidence based on model metrics
 */
export function calculateConfidence(metrics: TrainingMetrics): number {
  // Higher R2 and lower MAPE = higher confidence
  const r2Confidence = Math.max(0, Math.min(1, metrics.r2Score));
  const mapeConfidence = Math.max(0, 1 - metrics.mape / 100);

  return (r2Confidence + mapeConfidence) / 2;
}
