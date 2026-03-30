# Portfolio Optimization - Quick Start Guide

## Installation

1. **Install dependencies** (if not already installed):
```bash
npm install numeric
npm install @nestjs/bull bull
```

2. **Run database migrations**:
```bash
npm run typeorm -- migration:generate -d src/config/typeorm.config.ts src/migrations/PortfolioEntities
npm run typeorm -- migration:run -d src/config/typeorm.config.ts
```

3. **Update app.module.ts** (already done in this implementation):
   - Import `PortfolioModule`
   - Add portfolio entities to TypeORM

## First Steps

### 1. Create a Risk Profile

Define your investment profile:

```bash
curl -X POST http://localhost:3000/portfolio/portfolios \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Conservative Growth",
    "riskTolerance": "moderate",
    "investmentGoal": "balanced_growth",
    "targetReturn": 0.07,
    "maxVolatility": 0.15,
    "equityAllocationMin": 40,
    "equityAllocationMax": 60,
    "bondAllocationMin": 30,
    "bondAllocationMax": 50,
    "investmentHorizonYears": 10
  }'
```

### 2. Create a Portfolio

```bash
curl -X POST http://localhost:3000/portfolio/portfolios \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Investment Portfolio",
    "description": "Growth-focused portfolio",
    "autoRebalanceEnabled": true,
    "rebalanceFrequency": "quarterly",
    "rebalanceThreshold": 5
  }'
```

Copy the returned `id` for use in subsequent requests.

### 3. Add Assets

```bash
# Add Apple stock
curl -X POST http://localhost:3000/portfolio/portfolios/{PORTFOLIO_ID}/assets \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "AAPL",
    "name": "Apple Inc",
    "quantity": 100,
    "currentPrice": 150.50
  }'

# Add Microsoft stock
curl -X POST http://localhost:3000/portfolio/portfolios/{PORTFOLIO_ID}/assets \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "MSFT",
    "name": "Microsoft Corp",
    "quantity": 50,
    "currentPrice": 300.00
  }'

# Add Bond ETF
curl -X POST http://localhost:3000/portfolio/portfolios/{PORTFOLIO_ID}/assets \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "BND",
    "name": "Total Bond Market ETF",
    "quantity": 200,
    "currentPrice": 75.00
  }'
```

### 4. Run Portfolio Optimization

```bash
curl -X POST http://localhost:3000/portfolio/portfolios/{PORTFOLIO_ID}/optimize \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "mean_variance",
    "targetReturn": 0.08,
    "maxVolatility": 0.15
  }'
```

Store the returned `optimizationId`.

### 5. Review and Approve Optimization

```bash
# Get optimization details
curl -X GET http://localhost:3000/portfolio/optimizations/{OPTIMIZATION_ID} \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Approve the optimization
curl -X POST http://localhost:3000/portfolio/optimizations/{OPTIMIZATION_ID}/approve \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Approved for implementation"
  }'

# Implement the optimization
curl -X POST http://localhost:3000/portfolio/optimizations/{OPTIMIZATION_ID}/implement \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 6. Monitor Performance

```bash
# Get performance summary
curl -X GET http://localhost:3000/portfolio/portfolios/{PORTFOLIO_ID}/performance-summary \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get detailed metrics
curl -X GET "http://localhost:3000/portfolio/portfolios/{PORTFOLIO_ID}/metrics?limit=30" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 7. Auto-Rebalancing

```bash
# Check if rebalancing needed
curl -X GET http://localhost:3000/portfolio/portfolios/{PORTFOLIO_ID}/rebalance-check \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# If needed, trigger rebalancing
curl -X POST http://localhost:3000/portfolio/portfolios/{PORTFOLIO_ID}/rebalance \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger": "threshold_based",
    "triggerReason": "Quarterly check"
  }'
```

## Using the Built-in ML Models

### Train a Predictor

```bash
curl -X POST http://localhost:3000/portfolio/predictions/train/AAPL \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "historicalPrices": [
      140.5, 141.2, 142.1, 143.5, 145.0, 146.2, 145.8, 147.3, 148.1, 149.5,
      150.2, 151.1, 152.0, 153.2, 154.1, 155.0, 154.8, 156.2, 157.1, 158.5
    ]
  }'
```

### Get Price Predictions

```bash
curl -X POST http://localhost:3000/portfolio/predictions/forecast/AAPL \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPrice": 158.5,
    "historicalPrices": [
      140.5, 141.2, 142.1, 143.5, 145.0, 146.2, 145.8, 147.3, 148.1, 149.5,
      150.2, 151.1, 152.0, 153.2, 154.1, 155.0, 154.8, 156.2, 157.1, 158.5
    ],
    "daysAhead": 30
  }'
```

## Running Backtests

```bash
curl -X POST http://localhost:3000/portfolio/backtests \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "5-Year Historical Backtest",
    "description": "Test mean-variance strategy over 5 years",
    "startDate": "2019-01-01",
    "endDate": "2024-01-01",
    "initialCapital": 100000,
    "strategy": "mean_variance",
    "assets": [
      { "ticker": "AAPL", "weight": 30 },
      { "ticker": "MSFT", "weight": 25 },
      { "ticker": "GOOGL", "weight": 20 },
      { "ticker": "BND", "weight": 25 }
    ],
    "benchmarkTicker": "SPY"
  }'
```

Monitor status:
```bash
curl -X GET http://localhost:3000/portfolio/backtests/{BACKTEST_ID} \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Common Workflows

### Portfolio Rebalancing Workflow

1. **Check drift**: Monitor allocation deviation from target
2. **Calculate trades**: Compute optimal trades to reach target
3. **Approve**: Review and approve proposed trades
4. **Execute**: Execute trades with cost tracking
5. **Record**: Document rebalancing event for analysis

### Optimization Workflow

1. **Analyze**: Get current portfolio metrics
2. **Define constraints**: Set risk limits and goals
3. **Optimize**: Run optimization algorithm
4. **Review**: Analyze suggestions and improvements
5. **Approve**: Review cost and implementation plan
6. **Implement**: Apply new allocation to portfolio
7. **Monitor**: Track performance after implementation

### ML Forecasting Workflow

1. **Collect data**: Gather historical prices (minimum 1 year)
2. **Train models**: Train ARIMA, NN, and ensemble models
3. **Validate**: Check model accuracy on recent data
4. **Forecast**: Generate predictions for portfolio optimization
5. **Implement**: Use predictions in rebalancing decisions
6. **Update**: Retrain models monthly with new data

## Configuration Options

### Rebalancing Triggers

- **time_based**: Rebalance at specified intervals
- **threshold_based**: Rebalance when drift exceeds threshold
- **ml_triggered**: Rebalance based on ML predictions
- **manual**: Manual rebalancing on demand
- **market_event**: Triggered by market conditions

### Optimization Methods

- **mean_variance**: Markowitz mean-variance
- **black_litterman**: BL model with views
- **risk_parity**: Equal risk contribution
- **min_variance**: Minimum volatility
- **max_sharpe**: Maximum Sharpe ratio
- **equal_weight**: Equal-weight baseline

### Risk Tolerance Levels

- very_conservative (0-20% stocks)
- conservative (20-40% stocks)
- moderate (40-60% stocks)
- aggressive (60-80% stocks)
- very_aggressive (80-100% stocks)

## Monitoring and Alerts

### Key Metrics to Monitor

1. **Portfolio Value**: Track absolute returns
2. **Volatility**: Monitor risk levels  
3. **Sharpe Ratio**: Track risk-adjusted returns
4. **Drawdown**: Watch maximum decline
5. **Allocation Drift**: Monitor target achievement
6. **Rebalancing Frequency**: Track frequency and costs

### Setting Alerts

```typescript
// Example: Alert when Sharpe ratio falls below threshold
const summary = await performanceService.getPerformanceSummary(portfolioId);
if (summary.sharpeRatio < 0.3) {
  // Send alert to user
  console.warn('Sharpe ratio below 0.3 threshold');
}
```

## Troubleshooting

### Issue: Optimization takes too long
- **Solution**: Reduce number of assets, increase learning rate

### Issue: High portfolio volatility
- **Solution**: Increase bond allocation, reduce concentration

### Issue: Poor backtesting results
- **Solution**: Check data quality, adjust parameters, test different methods

### Issue: Rebalancing costs too high
- **Solution**: Increase drift threshold, reduce frequency, use smarter trading algorithms

## Advanced Features

### Custom Constraints
```json
{
  "constraints": [
    { "asset": "AAPL", "min": 0.1, "max": 0.3 },
    { "asset": "BND", "min": 0.3, "max": 0.7 },
    { "sector": "technology", "max": 0.4 }
  ]
}
```

### Fair Comparison
```bash
# Compare strategies
curl -X POST http://localhost:3000/portfolio/backtests/compare \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "backtestIds": ["bt-1", "bt-2", "bt-3"]
  }'
```

### Attribution Analysis
```bash
curl -X GET "http://localhost:3000/portfolio/portfolios/{PORTFOLIO_ID}/metrics/attribution?startDate=2024-01-01&endDate=2024-12-31" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Next Steps

1. Integrate with real market data sources
2. Set up automated job scheduler for daily updates
3. Implement WebSocket for real-time updates
4. Add portfolio comparison tools
5. Create advanced charting and visualization
6. Set up mobile app integration
7. Implement tax optimization
8. Add social features for portfolio sharing

For more detailed documentation, see:
- [Full API Documentation](./PORTFOLIO_OPTIMIZATION.md)
- [Algorithm Details](./docs/ALGORITHMS.md)
- [ML Models Documentation](./docs/ML_MODELS.md)
