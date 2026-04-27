# AI-Powered Portfolio Optimization System

## Overview

The AI-Powered Portfolio Optimization system implements advanced algorithms for intelligent asset allocation based on modern portfolio theory, machine learning predictions, and real-time market data. It provides automated rebalancing, risk assessment, and comprehensive performance analytics.

## Features

### 1. **Portfolio Optimization**
- **Mean-Variance Optimization** (Markowitz): Finds optimal asset weights to maximize Sharpe ratio
- **Min-Variance Portfolio**: Minimizes portfolio volatility
- **Risk Parity**: Equal risk contribution from all assets
- **Max Sharpe Ratio**: Maximizes risk-adjusted returns
- **Efficient Frontier**: Generates multiple portfolios at different risk-return levels
- **Black-Litterman Model**: Incorporates investor views with market equilibrium

### 2. **Machine Learning Models**
- **ARIMA Predictor**: Time-series forecasting for asset returns
- **Neural Network Predictor**: Deep learning-based price prediction
- **Ensemble Model**: Combines ARIMA and NN for robust predictions
- **Confidence Scoring**: Quantifies prediction reliability

### 3. **Automated Rebalancing**
- **Drift Detection**: Monitors allocation deviation from target
- **Time-Based Triggers**: Rebalance at specified intervals (daily/weekly/monthly/quarterly)
- **Threshold-Based Triggers**: Automatic rebalancing when drift exceeds threshold
- **ML-Triggered Rebalancing**: Algorithm-driven rebalancing based on predictions
- **Trade Planning**: Calculates optimal trades with cost analysis

### 4. **Risk Management**
- **Risk Profile Creation**: Define risk tolerance and investment goals
- **Risk Constraints**: Asset class allocation limits (equities, bonds, alternatives, cash)
- **ESG Filtering**: Environmental, Social, Governance screening
- **Value at Risk (VaR)**: Parametric and historical VaR calculation
- **Conditional Value at Risk (CVaR)**: Expected Shortfall metric

### 5. **Performance Analytics**
- **Return Metrics**: Daily, YTD, 1Y, 3Y, 5Y returns
- **Risk Metrics**: Volatility, Sharpe ratio, Sortino ratio, Calmar ratio
- **Drawdown Analysis**: Maximum and current drawdown tracking
- **Attribution Analysis**: Asset contribution to returns
- **Benchmark Comparison**: Alpha, Beta, Information ratio

### 6. **Backtesting Framework**
- **Historical Simulation**: Test strategies against historical data
- **Performance Metrics**: Comprehensive backtest analytics
- **Trade Analysis**: Win rate, profit factor, trade sizing
- **Monthly/Yearly Returns**: Period-based performance tracking
- **Strategy Comparison**: Compare multiple strategies

## Architecture

```
portfolio/
├── entities/
│   ├── portfolio.entity.ts           # Main portfolio
│   ├── portfolio-asset.entity.ts     # Assets in portfolio
│   ├── risk-profile.entity.ts        # Risk definitions
│   ├── optimization-history.entity.ts # Optimization records
│   ├── rebalancing-event.entity.ts   # Rebalance history
│   ├── performance-metric.entity.ts  # Performance data
│   └── backtest-result.entity.ts     # Backtest results
├── algorithms/
│   ├── modern-portfolio-theory.ts    # MPT algorithms
│   ├── black-litterman.ts            # BL model
│   └── constraint-optimizer.ts       # Constraint solving
├── ml-models/
│   └── predictor.ts                  # ML predictions
├── services/
│   ├── portfolio.service.ts          # Portfolio management
│   ├── ml-prediction.service.ts      # ML predictions
│   ├── rebalancing.service.ts        # Rebalancing logic
│   ├── performance-analytics.service.ts # Analytics
│   └── backtesting.service.ts        # Backtesting
├── dto/
│   ├── portfolio.dto.ts
│   ├── risk-profile.dto.ts
│   ├── optimization.dto.ts
│   ├── rebalancing.dto.ts
│   ├── portfolio-asset.dto.ts
│   ├── performance.dto.ts
│   └── backtest.dto.ts
├── portfolio.controller.ts           # API endpoints
└── portfolio.module.ts               # Module definition
```

## Database Schema

### Portfolio Entity
```typescript
Portfolio {
  id: UUID
  userId: UUID (FK to User)
  name: String
  status: 'active' | 'inactive' | 'archived'
  totalValue: Decimal
  currentAllocation: JSON          // Current {ticker: percentage}
  targetAllocation: JSON           // Target {ticker: percentage}
  autoRebalanceEnabled: Boolean
  rebalanceFrequency: 'daily' | 'weekly' | 'monthly' | 'quarterly'
  rebalanceThreshold: Decimal (%)
  lastRebalanceDate: DateTime
  createdAt: DateTime
  updatedAt: DateTime
  relations: [
    assets: PortfolioAsset[]
    optimizationHistory: OptimizationHistory[]
    rebalancingEvents: RebalancingEvent[]
    performanceMetrics: PerformanceMetric[]
  ]
}
```

### PortfolioAsset Entity
```typescript
PortfolioAsset {
  id: UUID
  portfolioId: UUID (FK)
  ticker: String
  name: String
  type: AssetType (stock, bond, crypto, commodity, etf, etc)
  quantity: Decimal
  currentPrice: Decimal
  value: Decimal
  allocationPercentage: Decimal
  suggestedAllocation: Decimal
  expectedReturn: Decimal
  volatility: Decimal
  beta: Decimal
  unrealizedGain: Decimal
  priceHistory: JSON               // Historical prices
  returnsHistory: Decimal[]
  lastPriceUpdate: DateTime
  createdAt: DateTime
  updatedAt: DateTime
}
```

### RiskProfile Entity
```typescript
RiskProfile {
  id: UUID
  userId: UUID (FK)
  name: String
  riskTolerance: RiskTolerance enum
  investmentGoal: InvestmentGoal enum
  targetReturn: Decimal (%)
  maxVolatility: Decimal (%)
  maxDrawdown: Decimal (%)
  sharpeRatioTarget: Decimal
  // Asset allocation ranges
  equityAllocationMin/Max: Decimal (%)
  bondAllocationMin/Max: Decimal (%)
  alternativeAllocationMin/Max: Decimal (%)
  cashAllocationMin/Max: Decimal (%)
  // Constraints
  excludedAssets: String[]         // Tickers to exclude
  requiredAssets: String[]         // Must include
  assetConstraints: JSON           // Per-asset min/max
  investmentHorizonYears: Integer
  useMachineLearning: Boolean
  mlConfidenceThreshold: Decimal
  enableESGFiltering: Boolean
  minESGScore: Decimal
}
```

### OptimizationHistory Entity
```typescript
OptimizationHistory {
  id: UUID
  portfolioId: UUID (FK)
  method: OptimizationMethod enum (mean_variance, black_litterman, risk_parity, etc)
  status: OptimizationStatus enum (pending, in_progress, completed, failed, approved, implemented)
  parameters: JSON
  suggestedAllocation: JSON        // Recommended weights
  currentAllocation: JSON          // Allocation at time of optimization
  expectedReturn: Decimal
  expectedVolatility: Decimal
  expectedSharpeRatio: Decimal
  valueAtRisk: Decimal
  conditionalVaR: Decimal
  maxDrawdown: Decimal
  backtestedMetrics: JSON          // Historical performance
  improvementScore: Decimal (%)    // % improvement over current
  mlPredictions: JSON              // ML model predictions
  estimatedTransactionCost: Decimal
  estimatedTradesRequired: Integer
  notes: String
  rejectionReason: String
  errorMessage: String
  createdAt: DateTime
  completedAt: DateTime
  implementedAt: DateTime
}
```

### RebalancingEvent Entity
```typescript
RebalancingEvent {
  id: UUID
  portfolioId: UUID (FK)
  trigger: RebalanceTrigger enum (manual, time_based, threshold_based, ml_triggered, market_event)
  status: RebalanceStatus enum (pending, in_progress, completed, failed, cancelled)
  triggerReason: String
  allocationBefore: JSON           // Before rebalancing
  allocationAfter: JSON            // After rebalancing (target)
  trades: Trade[]                  // Required trades
    [{ ticker, action: buy|sell, quantity, price, value }]
  estimatedCost: Decimal
  actualCost: Decimal
  taxImpact: Decimal
  allocationDrift: JSON            // {ticker: drift_percentage}
  maxAllocationDrift: Decimal
  avgAllocationDrift: Decimal
  expectedReturnImprovement: Decimal
  volatilityChange: Decimal
  executionNotes: String
  executedAt: DateTime
  executionSlippage: Decimal
  failureReason: String
  createdAt: DateTime
  completedAt: DateTime
}
```

### PerformanceMetric Entity
```typescript
PerformanceMetric {
  id: UUID
  portfolioId: UUID (FK)
  dateTime: DateTime               // Timestamp of metric
  portfolioValue: Decimal
  previousValue: Decimal
  
  // Returns
  dailyReturn: Decimal
  cumulativeReturn: Decimal
  yearToDateReturn: Decimal
  oneYearReturn: Decimal
  threeYearReturn: Decimal
  fiveYearReturn: Decimal
  
  // Risk metrics
  volatility: Decimal
  sharpeRatio: Decimal
  sortinoRatio: Decimal
  calmarRatio: Decimal
  maxDrawdown: Decimal
  currentDrawdown: Decimal
  
  // VaR metrics
  valueAtRisk95: Decimal
  conditionalValueAtRisk95: Decimal
  
  // Benchmark comparison
  benchmarkTicker: String
  benchmarkReturn: Decimal
  alpha: Decimal
  beta: Decimal
  correlation: Decimal
  trackingError: Decimal
  informationRatio: Decimal
  
  // Allocation snapshot
  allocation: JSON                 // {ticker: percentage}
  assetContribution: JSON          // {ticker: contribution}
  riskContribution: JSON           // {ticker: risk_amount}
  
  // Other metrics
  dividendYield: Decimal
  dividendIncome: Decimal
  totalTransactionCosts: Decimal
  expenseRatio: Decimal
  metadata: JSON
}
```

## API Endpoints

### Portfolio Management

#### Create Portfolio
```http
POST /portfolio/portfolios
Content-Type: application/json

{
  "name": "Growth Portfolio",
  "description": "Aggressive growth strategy",
  "totalValue": 100000,
  "autoRebalanceEnabled": true,
  "rebalanceFrequency": "monthly",
  "rebalanceThreshold": 5
}
```

#### Get Portfolio
```http
GET /portfolio/portfolios/:id
```

#### List User Portfolios
```http
GET /portfolio/portfolios
```

#### Update Portfolio
```http
PUT /portfolio/portfolios/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "autoRebalanceEnabled": false,
  "rebalanceThreshold": 10
}
```

#### Delete Portfolio
```http
DELETE /portfolio/portfolios/:id
```

### Asset Management

#### Add Asset
```http
POST /portfolio/portfolios/:portfolioId/assets
Content-Type: application/json

{
  "ticker": "AAPL",
  "name": "Apple Inc",
  "quantity": 100,
  "currentPrice": 150.50,
  "costBasis": 15000
}
```

#### Update Asset Price
```http
PUT /portfolio/portfolios/:portfolioId/assets/:assetId/price
Content-Type: application/json

{
  "price": 155.75
}
```

### Portfolio Optimization

#### Run Optimization
```http
POST /portfolio/portfolios/:portfolioId/optimize
Content-Type: application/json

{
  "method": "mean_variance",
  "parameters": {
    "riskFreeRate": 0.02,
    "rebalanceFrequency": 90
  },
  "targetReturn": 0.08,
  "maxVolatility": 0.15
}
```

Response:
```json
{
  "id": "opt-123",
  "method": "mean_variance",
  "status": "completed",
  "suggestedAllocation": {
    "AAPL": 25,
    "MSFT": 30,
    "BOND": 45
  },
  "expectedReturn": 0.087,
  "expectedVolatility": 0.128,
  "expectedSharpeRatio": 0.532,
  "improvementScore": 5.2,
  "createdAt": "2024-01-15T10:30:00Z",
  "completedAt": "2024-01-15T10:45:00Z"
}
```

#### Approve Optimization
```http
POST /portfolio/optimizations/:optimizationId/approve
Content-Type: application/json

{
  "notes": "Approved for implementation"
}
```

#### Implement Optimization
```http
POST /portfolio/optimizations/:optimizationId/implement
```

#### Get Optimization History
```http
GET /portfolio/portfolios/:portfolioId/optimization-history?limit=10
```

### Rebalancing

#### Check Rebalancing Needed
```http
GET /portfolio/portfolios/:portfolioId/rebalance-check
```

Response:
```json
{
  "needsRebalancing": true,
  "allocationDrift": {
    "AAPL": 3.5,
    "MSFT": -2.1,
    "BOND": -1.4
  }
}
```

#### Trigger Rebalancing
```http
POST /portfolio/portfolios/:portfolioId/rebalance
Content-Type: application/json

{
  "trigger": "threshold_based",
  "triggerReason": "Drift exceeded 5% threshold"
}
```

#### Approve Rebalancing
```http
POST /portfolio/rebalancing/:rebalancingId/approve
```

#### Execute Rebalancing
```http
POST /portfolio/rebalancing/:rebalancingId/execute
Content-Type: application/json

{
  "actualCost": 250,
  "executionSlippage": 0.5
}
```

#### Get Rebalancing History
```http
GET /portfolio/portfolios/:portfolioId/rebalancing-history?limit=10
```

### Performance Analytics

#### Get Performance Summary
```http
GET /portfolio/portfolios/:portfolioId/performance-summary
```

Response:
```json
{
  "cumulativeReturn": 0.125,
  "volatility": 0.135,
  "sharpeRatio": 0.567,
  "sortinoRatio": 0.678,
  "maxDrawdown": -0.18,
  "calmarRatio": -0.694
}
```

#### Get Performance Metrics
```http
GET /portfolio/portfolios/:portfolioId/metrics?startDate=2024-01-01&endDate=2024-12-31&limit=100
```

#### Get Attribution Analysis
```http
GET /portfolio/portfolios/:portfolioId/metrics/attribution?startDate=2024-01-01&endDate=2024-12-31
```

### Backtesting

#### Create Backtest
```http
POST /portfolio/backtests
Content-Type: application/json

{
  "name": "Growth Strategy Backtest",
  "description": "Testing growth strategy over 5 years",
  "startDate": "2019-01-01",
  "endDate": "2024-01-01",
  "initialCapital": 100000,
  "strategy": "mean_variance",
  "assets": [
    { "ticker": "AAPL", "weight": 30 },
    { "ticker": "MSFT", "weight": 25 },
    { "ticker": "BOND", "weight": 45 }
  ],
  "benchmarkTicker": "SPY",
  "rebalanceFrequency": 3
}
```

#### Get Backtest Result
```http
GET /portfolio/backtests/:backtestId
```

Response:
```json
{
  "id": "bt-123",
  "name": "Growth Strategy Backtest",
  "status": "completed",
  "startDate": "2019-01-01",
  "endDate": "2024-01-01",
  "initialCapital": 100000,
  "finalValue": 125000,
  "totalReturn": 0.25,
  "annualizedReturn": 0.0456,
  "volatility": 0.134,
  "sharpeRatio": 0.555,
  "sortinoRatio": 0.667,
  "maxDrawdown": -0.18,
  "totalTrades": 45,
  "winRate": 0.644,
  "profitFactor": 1.85,
  "completedAt": "2024-01-15T14:30:00Z"
}
```

#### List Backtests
```http
GET /portfolio/backtests?limit=10
```

#### Compare Backtests
```http
POST /portfolio/backtests/compare
Content-Type: application/json

{
  "backtestIds": ["bt-123", "bt-124", "bt-125"]
}
```

### ML Predictions

#### Train Predictor
```http
POST /portfolio/predictions/train/:ticker
Content-Type: application/json

{
  "historicalPrices": [145.2, 146.5, 147.1, 148.3, ...]
}
```

#### Forecast Returns
```http
POST /portfolio/predictions/forecast/:ticker
Content-Type: application/json

{
  "currentPrice": 150.5,
  "historicalPrices": [145.2, 146.5, 147.1, 148.3, ...],
  "daysAhead": 30
}
```

Response:
```json
{
  "predictedReturn": 0.0847,
  "confidence": 0.756,
  "predictions": [151.2, 151.8, 152.5, ...]
}
```

#### Get Predictor Stats
```http
GET /portfolio/predictions/stats
```

## Risk Profiles

### Available Risk Tolerance Levels
1. **Very Conservative** - Preservation, minimal growth
2. **Conservative** - Income focus, some growth
3. **Moderate** - Balanced approach
4. **Aggressive** - Growth focus
5. **Very Aggressive** - Maximum growth, high risk tolerance

### Available Investment Goals
1. **Capital Preservation** - Protect principal
2. **Income Generation** - Generate regular income
3. **Balanced Growth** - Mix of income and growth
4. **Growth** - Long-term capital appreciation
5. **Aggressive Growth** - Maximum capital growth

## Optimization Algorithms

### Mean-Variance Optimization (Markowitz)
Finds portfolio weights that maximize the Sharpe ratio:
- **Objective**: Maximize (Return - Risk-Free Rate) / Volatility
- **Process**: Gradient-based optimization with constraints
- **Use Case**: Classical portfolio optimization

### Black-Litterman Model
Combines market equilibrium with investor views:
- **Input**: Market returns, market cap weights, investor views
- **Output**: Adjusted expected returns incorporating views
- **Use Case**: Incorporating subjective market views

### Risk Parity
Equal risk contribution from all assets:
- **Objective**: Minimize total risk variance
- **Process**: Iterative weighting to equalize marginal contributions
- **Use Case**: Diversified, balanced portfolios

### Min-Variance Portfolio
Minimizes total portfolio volatility:
- **Objective**: Minimize portfolio variance
- **Constraint**: Sum of weights = 1
- **Use Case**: Conservative, risk-minimization strategies

### Max Sharpe Ratio
Directly maximizes risk-adjusted returns:
- **Objective**: Maximize (Portfolio Return - Risk-Free Rate) / Portfolio Volatility
- **Use Case**: Best risk-adjusted return for available assets

## ML Models

### ARIMA Predictor
- **Approach**: AutoRegressive Integrated Moving Average
- **Parameters**: p=1 (AR terms), d=1 (differencing), q=1 (MA terms)
- **Output**: Future price predictions

### Neural Network Predictor
- **Architecture**: 3-layer network (input → 64 → 32 → output)
- **Activation**: ReLU for hidden layers, Linear for output
- **Training**: Backpropagation with learning rate = 0.01

### Ensemble Predictor
- **Method**: Weighted combination of ARIMA (40%) and NN (60%)
- **Confidence**: Combines model-level confidence scores
- **Robustness**: Reduces overfitting through model diversity

## Configuration

### Environment Variables
```env
# Portfolio Configuration
PORTFOLIO_REBALANCE_ENABLED=true
PORTFOLIO_AUTO_REBALANCE_FREQUENCY=monthly
PORTFOLIO_DRIFT_THRESHOLD=5

# ML Configuration
ML_PREDICTION_LOOKBACK_DAYS=252
ML_CONFIDENCE_THRESHOLD=0.3
ML_ARIMA_REFIT_FREQUENCY=7

# Backtesting
BACKTEST_MAX_CONCURRENT=5
BACKTEST_SIMULATION_DAYS=252

# Risk Management
RISK_FREE_RATE=0.02
DEFAULT_CONFIDENCE_LEVEL=0.95
DEFAULT_VaR_CONFIDENCE=0.95
```

### Database Migration
```bash
npm run typeorm -- migration:generate -d src/config/typeorm.config.ts src/migrations/PortfolioEntities
npm run typeorm -- migration:run -d src/config/typeorm.config.ts
```

## Usage Examples

### Create and Optimize a Portfolio
```typescript
// 1. Create portfolio
const portfolio = await portfolioService.createPortfolio(userId, {
  name: "My Growth Portfolio",
  autoRebalanceEnabled: true,
  rebalanceFrequency: "monthly"
});

// 2. Add assets
await portfolioService.addAsset(portfolio.id, "AAPL", "Apple", 100, 150);
await portfolioService.addAsset(portfolio.id, "MSFT", "Microsoft", 50, 300);
await portfolioService.addAsset(portfolio.id, "BND", "Bonds", 200, 50);

// 3. Run optimization
const optimization = await portfolioService.runOptimization(
  portfolio.id,
  {
    method: OptimizationMethod.MEAN_VARIANCE,
    portfolioId: portfolio.id
  }
);

// 4. Approve and implement
await portfolioService.approveOptimization(optimization.id);
await portfolioService.implementOptimization(optimization.id);

// 5. Get performance
const summary = await performanceService.getPerformanceSummary(portfolio.id);
```

### Automated Rebalancing
```typescript
// Check if rebalancing needed
const needsRebalancing = await rebalancingService.checkRebalancingNeeded(
  portfolio.id
);

if (needsRebalancing) {
  // Trigger rebalancing
  const event = await rebalancingService.triggerRebalancing(
    portfolio.id,
    RebalanceTrigger.THRESHOLD_BASED,
    "Allocation drift exceeded 5%"
  );

  // Approve rebalancing
  await rebalancingService.approveRebalancing(event.id);

  // Execute rebalancing
  await rebalancingService.executeRebalancing(
    event.id,
    250, // actual cost
    0.5  // slippage %
  );
}
```

### ML-Driven Predictions
```typescript
// Train model
const trainingResult = await mlService.trainAssetPredictor(
  "AAPL",
  historicalPrices
);

// Make predictions
const forecast = await mlService.predictAssetReturns(
  "AAPL",
  currentPrice,
  historicalPrices,
  30 // 30-day forecast
);

console.log(`Predicted return: ${forecast.predictedReturn}`);
console.log(`Confidence: ${forecast.confidence}`);
```

## Performance Considerations

1. **Optimization Speed**: Gradient-based optimization handles 50+ assets efficiently
2. **ML Training**: ARIMA trains in <1s, NN in <5s per asset
3. **Backtest Speed**: 5-year historical backtest ~2-3 seconds
4. **Update Frequency**: Price updates process in real-time
5. **Caching**: ML models cached in memory per session

## Testing

```bash
# Run unit tests
npm test -- test/portfolio/

# Run specific test
npm test -- test/portfolio/mpt.spec.ts

# Run with coverage
npm test -- --coverage test/portfolio/

# Run integration tests
npm run test:e2e
```

## Best Practices

1. **Risk Profiling**: Define clear risk profiles before optimization
2. **Constraint Setting**: Always set reasonable min/max allocation limits
3. **Regular Rebalancing**: Balance automatic and manual rebalancing triggers
4. **Performance Monitoring**: Review metrics monthly/quarterly
5. **Strategy Testing**: Backtest strategies before deployment
6. **Model Updates**: Retrain ML models monthly with new data
7. **Diversification**: Maintain minimum 5+ assets for effective diversification

## Troubleshooting

### Optimization Convergence Issues
- Increase maximum iterations
- Reduce learning rate for stability
- Check asset correlation matrix for multicollinearity

### High Drawdowns in Backtests
- Increase bond allocation
- Reduce equity concentration
- Add hedging assets

### Poor ML Predictions
- Ensure sufficient historical data (minimum 1 year)
- Retrain models with latest data
- Check for data quality issues

## Support and Documentation

For detailed implementation guides, see:
- [Modern Portfolio Theory Guide](./docs/MODERN_PORTFOLIO_THEORY.md)
- [Black-Litterman Model](./docs/BLACK_LITTERMAN_MODEL.md)
- [ML Prediction Models](./docs/ML_MODELS.md)
- [Risk Assessment](./docs/RISK_ASSESSMENT.md)
