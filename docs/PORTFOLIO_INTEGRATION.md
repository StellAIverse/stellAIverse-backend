# Portfolio Optimization - Integration Architecture Guide

## System Architecture Overview

The Portfolio Optimization System is built on a modular NestJS architecture with clear separation of concerns. This guide explains how all components integrate together.

```
┌─────────────────────────────────────────────────────────────┐
│                      API Layer                              │
│            (PortfolioController)                            │
│  - 40+ REST endpoints for portfolio management              │
│  - Request/response validation via DTOs                     │
│  - JWT authentication guard on all endpoints                │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│                    Service Layer                            │
│  ┌─────────────────┐  ┌──────────────────┐                 │
│  │ PortfolioService│  │ RebalancingService│                 │
│  │  - CRUD ops     │  │  - Drift analysis │                 │
│  │  - Asset mgmt   │  │  - Trade plan     │                 │
│  │  - Workflow     │  │  - Execution      │                 │
│  └─────────────────┘  └──────────────────┘                 │
│              │                                              │
│  ┌──────────────────────┐  ┌────────────────────────┐      │
│  │ MLPredictionService  │  │ PerformanceAnalyticsService
│  │  - Model training    │  │  - Metrics calculation │      │
│  │  - Forecasting       │  │  - Attribution analysis│      │
│  │  - Confidence scoring│  │  - Risk calculations  │      │
│  └──────────────────────┘  └────────────────────────┘      │
│              │                                              │
│  ┌──────────────────────────────────────────────────┐      │
│  │       BacktestingService                         │      │
│  │  - Strategy simulation                           │      │
│  │  - Historical performance                        │      │
│  │  - Validation                                    │      │
│  └──────────────────────────────────────────────────┘      │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│              Algorithm Layer                                │
│  ┌──────────────────────┐  ┌──────────────────────┐       │
│  │ ModernPortfolioTheory│  │ BlackLittermanModel  │       │
│  │  - MPT optimization  │  │  - View incorporation│       │
│  │  - Risk parity       │  │  - Bayesian update   │       │
│  │  - Constraints       │  │  - Posterior weights │       │
│  └──────────────────────┘  └──────────────────────┘       │
│              │                                             │
│  ┌──────────────────────────────────────────────────┐     │
│  │         ML Predictors                            │     │
│  │  - ARIMA models for time series                  │     │
│  │  - Neural networks for pattern detection        │     │
│  │  - Ensemble combining both approaches           │     │
│  └──────────────────────────────────────────────────┘     │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│              Data Layer                                     │
│  ┌──────────────────────┐  ┌──────────────────────┐       │
│  │  TypeORM Repositories │  │  PostgreSQL Database │       │
│  │  - Entity mapping     │  │  - Data persistence │       │
│  │  - Query building     │  │  - Indexing         │       │
│  │  - Relationships      │  │  - Transactions     │       │
│  └──────────────────────┘  └──────────────────────┘       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│           Supporting Systems                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Bull Queues  │  │  Redis Cache │  │  JWT Auth   │     │
│  │ - Background │  │  - Results   │  │  - Security │     │
│  │   processing │  │  - Metrics   │  │  - Sessions │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow Diagrams

### Portfolio Optimization Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Client Request                                           │
│    POST /portfolio/{id}/optimizations                       │
│    - Portfolio ID, method, constraints                      │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ 2. PortfolioService.runOptimization()                       │
│    - Load portfolio and assets                              │
│    - Fetch risk profile and constraints                     │
│    - Load historical price data                             │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ 3. MLPredictionService.predictAssetReturns()                │
│    - Train models on 1-year historical data                 │
│    - Generate forward-looking return estimates              │
│    - Calculate confidence scores                            │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ 4. ModernPortfolioTheory.optimize()                         │
│    - Calculate covariance matrix of returns                 │
│    - Apply selected optimization method                     │
│    - Enforce risk tolerance and allocation constraints      │
│    - Generate efficient frontier                            │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ 5. PerformanceAnalyticsService.calculateMetrics()           │
│    - Calculate expected Sharpe ratio                        │
│    - Calculate expected volatility                          │
│    - Calculate VaR and CVaR                                 │
│    - Generate performance projections                       │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ 6. BacktestingService.validateStrategy()                    │
│    - Simulate strategy over 5-year period                   │
│    - Calculate realized performance metrics                 │
│    - Compare vs benchmark and current portfolio             │
│    - Identify risks/opportunities                           │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ 7. Store OptimizationHistory                                │
│    - Save suggested weights                                 │
│    - Store calculated metrics                               │
│    - Save backtest results                                  │
│    - Set status = pending_approval                          │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ 8. Return to Client                                         │
│    200 OK with OptimizationHistoryResponseDto               │
│    - Suggested allocation weights                           │
│    - Expected metrics (return, volatility, Sharpe)          │
│    - Backtest results                                       │
│    - Comparison vs current portfolio                        │
└─────────────────────────────────────────────────────────────┘
```

### Rebalancing Workflow

```
┌──────────────────────────────────────────────────────────────┐
│ 1. Rebalance Trigger                                         │
│    - Time-based: Scheduled (monthly, quarterly)              │
│    - Threshold-based: Drift exceeds tolerance                │
│    - ML-triggered: Model predicts opportunity                │
│    - Risk-based: Risk profile changes                        │
│    - Manual: User initiated                                  │
└────────────────┬─────────────────────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────────────────────┐
│ 2. RebalancingService.calculateRebalance()                   │
│    - Get current allocation vs target                        │
│    - Calculate allocation drift (weight deviations)          │
│    - Generate buy/sell trades to match target                │
└────────────────┬─────────────────────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────────────────────┐
│ 3. Calculate Trade Costs                                     │
│    - Estimate transaction costs (commissions, spreads)       │
│    - Calculate tax impact if applicable                      │
│    - Estimate execution slippage                             │
│    - Compare benefits vs costs                               │
└────────────────┬─────────────────────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────────────────────┐
│ 4. Store RebalancingEvent (pending_approval)                 │
│    - Save proposed trades                                    │
│    - Save drift analysis                                     │
│    - Store cost estimates                                    │
│    - Set status = pending_approval                           │
└────────────────┬─────────────────────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────────────────────┐
│ 5. Await User Approval                                       │
│    PUT /rebalancing/{id}/approve                             │
└────────────────┬─────────────────────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────────────────────┐
│ 6. Execute Trades                                            │
│    - Place buy orders for underweighted assets               │
│    - Place sell orders for overweighted assets               │
│    - Track execution prices and quantities                   │
│    - Update portfolio allocations                            │
│    - Store actual costs and results                          │
└────────────────┬─────────────────────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────────────────────┐
│ 7. Update PortfolioAssets and Portfolio                      │
│    - Update quantity and current allocation                  │
│    - Recalculate portfolio metrics                           │
│    - Record last_rebalance_date                              │
│    - Clear rebalance drift flag                              │
└────────────────┬─────────────────────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────────────────────┐
│ 8. Store Final RebalancingEvent                              │
│    - Set status = completed                                  │
│    - Store actual transaction costs                          │
│    - Store post-rebalance allocation                         │
│    - Record realized impact on metrics                       │
└──────────────────────────────────────────────────────────────┘
```

### Performance Tracking Data Flow

```
┌────────────────────────────────────────────────────────────────┐
│ 1. Daily Scheduled Job (Bull Queue)                            │
│    portfolio-performance-metrics job runs daily at 4 AM        │
└────────────────┬───────────────────────────────────────────────┘
                 │
┌────────────────▼───────────────────────────────────────────────┐
│ 2. For Each Portfolio:                                         │
│    PerformanceAnalyticsService.calculateDailyMetrics()         │
│    - Fetch portfolio and all assets                            │
│    - Get current market prices                                 │
│    - Calculate portfolio value                                 │
└────────────────┬───────────────────────────────────────────────┘
                 │
┌────────────────▼───────────────────────────────────────────────┐
│ 3. Calculate Return Metrics                                    │
│    - Daily return = (today_value - yesterday_value) / yesterday_value
│    - Cumulative return = (today_value - initial_value) / initial_value
│    - Year-to-date, 1Y, 3Y, 5Y returns                         │
└────────────────┬───────────────────────────────────────────────┘
                 │
┌────────────────▼───────────────────────────────────────────────┐
│ 4. Calculate Risk Metrics                                      │
│    - Volatility = STDEV(daily_returns) × √252                 │
│    - Sharpe Ratio = (return - risk_free_rate) / volatility    │
│    - Sortino Ratio = (return - risk_free_rate) / downside_dev │
│    - Calmar Ratio = return / max_drawdown                      │
│    - Max Drawdown = lowest point from peak                     │
│    - VaR(95%) = percentile of losses at 95% confidence        │
│    - CVaR = average of worst 5% of losses                     │
└────────────────┬───────────────────────────────────────────────┘
                 │
┌────────────────▼───────────────────────────────────────────────┐
│ 5. Calculate Attribution Metrics                              │
│    For each asset:                                            │
│    - Asset return contribution = asset_return × asset_weight  │
│    - Risk contribution = (asset_vol × asset_correlation) × wt │
│    - Allocation snapshot (weights at period end)              │
└────────────────┬───────────────────────────────────────────────┘
                 │
┌────────────────▼───────────────────────────────────────────────┐
│ 6. Store PerformanceMetric Entity                              │
│    - portfolio_id, date_time, all calculated metrics           │
│    - portfolio_value, daily_return, cumulative_return          │
│    - volatility, sharpe_ratio, sortino_ratio, calmar_ratio    │
│    - max_drawdown, var_95, cvar_95                            │
│    - allocation snapshot (weights), attribution data           │
└────────────────┬───────────────────────────────────────────────┘
                 │
┌────────────────▼───────────────────────────────────────────────┐
│ 7. Client Queries Metrics                                     │
│    GET /portfolio/{id}/performance                            │
│    - Returns time-series of PerformanceMetrics                │
│    - Filters by date range                                    │
│    - Includes all calculated metrics                          │
│    - Ready for charting and analysis                          │
└────────────────────────────────────────────────────────────────┘
```

## Entity Relationship Model

```
User (from existing system)
├── Portfolio (one-to-many)
│   ├── PortfolioAsset (one-to-many)
│   │   └── Asset type, quantity, prices, returns history
│   │
│   ├── RiskProfile (one-to-one)
│   │   └── Risk tolerance, goals, constraints, allocation ranges
│   │
│   ├── OptimizationHistory (one-to-many)
│   │   └── Optimization methods, results, status, metrics
│   │
│   ├── RebalancingEvent (one-to-many)
│   │   └── Triggers, trades, costs, status, outcomes
│   │
│   └── PerformanceMetric (one-to-many)
│       └── Daily metrics, returns, risk, attribution
│
└── BacktestResult (one-to-many)
    └── Backtest configuration, results, comparison data
```

## Service Integration Points

### PortfolioService - Core Orchestrator
**Responsibilities:**
- Portfolio CRUD operations
- Asset management
- Optimization workflow orchestration
- Coordinates with other services

**Dependencies:**
- Portfolio Repository
- PortfolioAsset Repository  
- RiskProfile Repository
- OptimizationHistory Repository
- MLPredictionService (for return estimates)
- PerformanceAnalyticsService (for metrics)
- BacktestingService (for strategy validation)

**Key Methods:**
```typescript
async runOptimization(portfolioId: string, dto: CreateOptimizationDto) {
  // 1. Load portfolio, assets, risk profile
  // 2. Call MLPredictionService.predictAssetReturns()
  // 3. Call ModernPortfolioTheory.optimize()
  // 4. Call PerformanceAnalyticsService.calculateMetrics()
  // 5. Call BacktestingService.validateStrategy()
  // 6. Save OptimizationHistory, return results
}
```

### RebalancingService - Execution Engine
**Responsibilities:**
- Drift analysis and detection
- Trade calculation
- Rebalancing execution
- Cost and tax tracking

**Dependencies:**
- Portfolio Repository
- PortfolioAsset Repository
- RebalancingEvent Repository
- Performance analytics for impact analysis

**Key Methods:**
```typescript
async calculateRebalance(portfolioId: string) {
  // 1. Get current allocations vs targets
  // 2. Calculate allocation drift
  // 3. Generate buy/sell trades
  // 4. Calculate total costs
  // 5. Return trade plan
}

async executeRebalance(eventId: string) {
  // 1. Load rebalancing event and trades
  // 2. Execute each trade (market order)
  // 3. Update portfolio asset quantities
  // 4. Update current allocations
  // 5. Record actual costs and outcomes
}
```

### MLPredictionService - Prediction Engine
**Responsibilities:**
- Model training on historical data
- Return and price forecasting
- Confidence scoring
- Model caching and invalidation

**Dependencies:**
- PortfolioAsset Repository (for historical data)
- Predictors (ARIMA, NN, Ensemble)
- Redis cache

**Key Methods:**
```typescript
async predictAssetReturns(tickers: string[], days: number) {
  // 1. Load historical prices for each ticker
  // 2. Train ARIMA, NN, Ensemble models
  // 3. Generate forecasts with confidence
  // 4. Blend predictions using ensemble
  // 5. Return predictions with scoring
}
```

### PerformanceAnalyticsService - Analytics Engine
**Responsibilities:**
- Metric calculation (Sharpe, Sortino, Calmar, VaR, etc.)
- Attribution analysis
- Risk decomposition
- Performance comparison

**Dependencies:**
- Portfolio Repository
- PortfolioAsset Repository
- PerformanceMetric Repository
- Performance baseline (benchmark, risk-free rate)

**Key Methods:**
```typescript
async calculateDailyMetrics(portfolioId: string) {
  // 1. Get portfolio value today vs yesterday
  // 2. Calculate daily return and cumulative return
  // 3. Calculate volatility from rolling window
  // 4. Calculate Sharpe, Sortino, Calmar ratios
  // 5. Calculate VaR and CVaR
  // 6. Analyze attribution by asset
  // 7. Save PerformanceMetric
}
```

### BacktestingService - Validation Engine
**Responsibilities:**
- Historical strategy simulation
- Performance metric calculation
- Strategy comparison
- Risk validation

**Dependencies:**
- BacktestResult Repository
- Historical price data
- Performance analytics (for metric calculation)

**Key Methods:**
```typescript
async runBacktest(backtestId: string) {
  // 1. Load backtest config and assets
  // 2. Simulate portfolio over date range with historical prices
  // 3. Calculate daily returns
  // 4. Calculate all performance metrics
  // 5. Compare vs benchmark
  // 6. Identify risks and drawdowns
  // 7. Save results
}
```

## Bull Queue Integration

### Portfolio Optimization Queue
```typescript
@Processor('portfolio-optimization')
export class PortfolioOptimizationQueue {
  @Process()
  async handleOptimization(job: Job) {
    const { portfolioId, method } = job.data;
    await this.portfolioService.runOptimization(portfolioId, method);
  }
}
```

**Triggers:** Manual request from API

**Retry Policy:** 3 retries with exponential backoff

### Rebalancing Trigger Queue
```typescript
@Processor('portfolio-rebalancing')
export class RebalancingTriggerQueue {
  @Process()
  async handleRebalancingTrigger(job: Job) {
    const portfolios = await this.portfolioService.getPortfoliosDueForRebalancing();
    for (const portfolio of portfolios) {
      await this.rebalancingService.calculateAndRequestApproval(portfolio.id);
    }
  }
}
```

**Triggers:** Scheduled (every hour), manual, drift detection

**Retry Policy:** 5 retries

### Performance Metrics Queue
```typescript
@Processor('portfolio-performance-metrics')
export class PerformanceMetricsQueue {
  @Process()
  async handlePerformanceCalculation(job: Job) {
    const portfolios = await this.portfolioService.getAllPortfolios();
    for (const portfolio of portfolios) {
      await this.analyticsService.calculateDailyMetrics(portfolio.id);
    }
  }
}
```

**Triggers:** Scheduled daily at 4 AM

**Retention:** Keep metrics for 7 years

### ML Model Training Queue
```typescript
@Processor('portfolio-ml-predictions')
export class MLPredictionQueue {
  @Process()
  async handleMLTraining(job: Job) {
    const assets = await this.assetService.getAllAssets();
    for (const asset of assets) {
      await this.mlService.trainModels(asset.ticker);
    }
  }
}
```

**Triggers:** Scheduled weekly, on-demand

**Duration:** 5-30 minutes depending on asset count

### Backtesting Queue
```typescript
@Processor('portfolio-backtesting')
export class BacktestingQueue {
  @Process()
  async handleBacktest(job: Job) {
    const { backtestId } = job.data;
    await this.backtestingService.runBacktest(backtestId);
  }
}
```

**Triggers:** Manual request from API

**Duration:** 2-5 seconds per backtest

## Caching Strategy

### Redis Cache Keys
```
portfolio:{portfolioId}:details
portfolio:{portfolioId}:allocations
portfolio:{portfolioId}:performance:daily
portfolio:{portfolioId}:performance:monthly
portfolio:{portfolioId}:optimization:{method}
assets:{ticker}:predictions
assets:{ticker}:metrics
```

### Cache Invalidation Triggers
| Event | Keys Invalidated |
|-------|------------------|
| Asset added/removed | portfolio:* |
| Price updated | portfolio:*:allocations, assets:*:predictions |
| Rebalance completed | portfolio:*:allocations, portfolio:*:optimization:* |
| Optimization run | portfolio:*:optimization:* |
| Daily metrics calc | portfolio:*:performance:daily |

## Error Handling and Recovery

### Optimization Failures
```typescript
// Service captures and logs error
try {
  weights = await optimization.calculate();
} catch (error) {
  logger.error(`Optimization failed: ${error.message}`);
  optimization.status = OptimizationStatus.FAILED;
  optimization.errorMessage = error.message;
  // Client notified, can retry
}
```

### Rebalancing Safety
```typescript
// Validate trade impacts before execution
const validation = await validateTrades(trades);
if (validation.errors.length > 0) {
  rebalancingEvent.status = RebalanceStatus.VALIDATION_FAILED;
  rebalancingEvent.validationErrors = validation.errors;
  // Alert user, halt execution
}
```

### Performance Metric Gaps
```typescript
// If daily calc fails, mark as gap
if (metrics.length < expectedDays) {
  logger.warn(`Performance metric gap detected for portfolio ${id}`);
  // Interpolate or flag for manual review
}
```

## Testing Strategy

### Unit Tests
- Algorithm correctness (MPT, Black-Litterman)
- Service logic (portfolio CRUD, rebalancing logic)
- ML model training and prediction
- Metric calculations

### Integration Tests
- Full optimization workflow
- Rebalancing approval flow
- Daily performance metric collection
- Backtest simulation accuracy

### E2E Tests
- Portfolio creation → optimization → rebalancing
- Multi-portfolio performance comparison
- Historical data accuracy

## Deployment Architecture

### Development Environment
- Single Node.js process
- SQLite or PostgreSQL (local)
- In-memory Redis
- All Bull queues running in process

### Production Environment
- NestJS API: Horizontally scalable (2-4 instances)
- PostgreSQL: Production instance with replication
- Redis: Cluster or managed service (AWS ElastiCache)
- Bull Processors: Separate worker instances (2-4)

### Scaling Considerations
1. **API Instances**: Each can handle ~500 requests/sec
2. **Bull Workers**: Each can process 1-2 optimization jobs/min
3. **Database**: Index strategy critical for performance
4. **Caching**: Redis memory must accommodate concurrent requests
5. **ML Training**: CPU-intensive, may need dedicated worker nodes

## Monitoring and Observability

### Key Metrics to Monitor
- Optimization time (p95, p99)
- Rebalancing frequency and success rate
- Performance metric calculation latency
- ML model prediction accuracy
- Queue depth and job failures
- API response times by endpoint
- Database query times
- Redis memory usage

### Health Checks
```
GET /health → Comprehensive system status
GET /metrics → Prometheus metrics
GET /portfolio/{id}/health → Portfolio-specific status
```

### Alerting Thresholds
- Optimization time > 30s
- Rebalancing event > 1000 errors/day
- Performance metric gap > 1 day
- ML prediction confidence < 0.2
- Queue depth > 1000 jobs
- API error rate > 1%
- Database query time > 1s

## Summary

The Portfolio Optimization System is designed as a modular, scalable architecture where:

1. **Services** coordinate workflows and business logic
2. **Algorithms** perform mathematical optimization and prediction
3. **Repositories** handle data persistence via TypeORM
4. **Controllers** expose REST APIs with proper validation
5. **Bull Queues** process background jobs asynchronously
6. **Redis Cache** accelerates frequent queries
7. **PostgreSQL Database** provides reliable data storage

All components are loosely coupled through dependency injection, enabling independent testing, deployment, and scaling. The system supports both real-time API requests and scheduled background processing, making it suitable for production portfolio management applications.
