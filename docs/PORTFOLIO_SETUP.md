# Portfolio Optimization - Setup and Configuration Guide

## Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Redis (for Bull job queue)
- npm or yarn

## Installation

### 1. Install Dependencies

```bash
npm install
# or
yarn install
```

### 2. Environment Configuration

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/stellaiverse
DATABASE_SYNC=true
DATABASE_LOGGING=true

# Node Environment
NODE_ENV=development

# Server
PORT=3000
API_PREFIX=api

# JWT
JWT_SECRET=your_secret_key_here
JWT_EXPIRATION=24h

# Portfolio Configuration
PORTFOLIO_REBALANCE_ENABLED=true
PORTFOLIO_AUTO_REBALANCE_FREQUENCY=monthly
PORTFOLIO_DRIFT_THRESHOLD=5
PORTFOLIO_OPTIMIZATION_TIMEOUT=60000

# ML Configuration
ML_PREDICTION_ENABLED=true
ML_LOOKBACK_DAYS=252
ML_CONFIDENCE_THRESHOLD=0.3
ML_ARIMA_REFIT_FREQUENCY=7
ML_NEURAL_NETWORK_EPOCHS=100

# Backtesting
BACKTEST_ENABLED=true
BACKTEST_MAX_CONCURRENT=5
BACKTEST_SIMULATION_DAYS=252
BACKTEST_TIMEOUT=300000

# Risk Management
RISK_FREE_RATE=0.02
DEFAULT_CONFIDENCE_LEVEL=0.95
DEFAULT_VAR_CONFIDENCE=0.95

# Bull Queue (Redis)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Logging
LOG_LEVEL=debug
LOG_FORMAT=json

# Market Data (Optional)
MARKET_DATA_API_KEY=
MARKET_DATA_PROVIDER=alphavantage # or finnhub, iex, etc
```

### 3. Database Setup

```bash
# Create database
createdb stellaiverse

# Run migrations
npm run typeorm -- migration:run -d src/config/typeorm.config.ts

# Or generate new migration
npm run typeorm -- migration:generate -d src/config/typeorm.config.ts src/migrations/PortfolioEntities
```

### 4. Redis Setup

For local development:

```bash
# Install Redis locally
brew install redis  # macOS
# or
sudo apt-get install redis-server  # Linux

# Start Redis
redis-server

# Or use Docker
docker run -d -p 6379:6379 redis:latest
```

### 5. Build and Run

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod

# With debugging
npm run start:debug
```

## Database Schema Setup

### Create Indexes

```sql
-- Performance indexes
CREATE INDEX idx_portfolio_user_id ON portfolios(user_id);
CREATE INDEX idx_portfolio_asset_ticker ON portfolio_assets(ticker);
CREATE INDEX idx_portfolio_asset_portfolio_id ON portfolio_assets(portfolio_id);
CREATE INDEX idx_optimization_portfolio_id ON optimization_history(portfolio_id);
CREATE INDEX idx_optimization_created_at ON optimization_history(created_at);
CREATE INDEX idx_rebalancing_portfolio_id ON rebalancing_events(portfolio_id);
CREATE INDEX idx_rebalancing_created_at ON rebalancing_events(created_at);
CREATE INDEX idx_performance_portfolio_datetime ON performance_metrics(portfolio_id, date_time);
CREATE INDEX idx_backtest_user_id ON backtest_results(user_id);
CREATE INDEX idx_risk_profile_user_id ON risk_profiles(user_id);

-- Full-text search
CREATE INDEX idx_portfolio_name_search ON portfolios USING GIN(to_tsvector('english', name));
CREATE INDEX idx_asset_ticker_search ON portfolio_assets USING GIN(to_tsvector('english', ticker));
```

### Create Views for Analytics

```sql
-- Portfolio summary view
CREATE VIEW vw_portfolio_summary AS
SELECT 
  p.id,
  p.user_id,
  p.name,
  p.total_value,
  count(pa.id) as asset_count,
  (SELECT COUNT(*) FROM optimization_history WHERE portfolio_id = p.id) as optimization_count,
  (SELECT COUNT(*) FROM rebalancing_events WHERE portfolio_id = p.id) as rebalance_count,
  p.last_rebalance_date,
  p.created_at,
  p.updated_at
FROM portfolios p
LEFT JOIN portfolio_assets pa ON p.id = pa.portfolio_id
GROUP BY p.id;

-- Performance metrics view
CREATE VIEW vw_portfolio_performance AS
SELECT 
  portfolio_id,
  DATE(date_time) as performance_date,
  portfolio_value,
  (portfolio_value - LAG(portfolio_value) OVER (PARTITION BY portfolio_id ORDER BY date_time)) / 
    LAG(portfolio_value) OVER (PARTITION BY portfolio_id ORDER BY date_time) as daily_return,
  ROUND(CAST(STDDEV(daily_return) OVER (
    PARTITION BY portfolio_id 
    ORDER BY date_time 
    ROWS BETWEEN 252 PRECEDING AND CURRENT ROW
  ) * SQRT(252) AS NUMERIC), 4) as volatility
FROM performance_metrics
ORDER BY portfolio_id, date_time;
```

## API Documentation

### Generate API Docs

```bash
# Generate Swagger documentation
npm run docs:generate

# Serve at http://localhost:3000/api-docs
```

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- portfolio.service.spec.ts

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

### Integration Tests

```bash
# Run e2e tests
npm run test:e2e

# Run specific e2e test
npm run test:e2e -- portfolio.e2e-spec.ts
```

### Load Testing

```bash
# Using Apache Bench
ab -n 1000 -c 10 http://localhost:3000/portfolio/portfolios

# Using wrk
wrk -t12 -c400 -d30s http://localhost:3000/portfolio/portfolios
```

## Docker Deployment

### Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: stellaiverse
      POSTGRES_PASSWORD: password
      POSTGRES_DB: stellaiverse
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  app:
    build: .
    environment:
      DATABASE_URL: postgresql://stellaiverse:password@postgres:5432/stellaiverse
      REDIS_HOST: redis
      NODE_ENV: production
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
  redis_data:
```

Deploy with:
```bash
docker-compose up -d
```

## Performance Optimization

### Database Optimization

1. **Connection Pooling**:
```typescript
extra: {
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
}
```

2. **Query Optimization**:
   - Use indexes on frequently queried columns
   - Use views for complex queries
   - Paginate large result sets

3. **Caching**:
```typescript
// Cache optimization results for 1 hour
const cacheKey = `optimization:${portfolioId}`;
let result = await cache.get(cacheKey);
if (!result) {
  result = await runOptimization();
  await cache.set(cacheKey, result, 3600);
}
```

### Algorithm Optimization

1. **Vectorization**: Use matrix operations instead of loops
2. **Parallelization**: Process multiple portfolios concurrently
3. **Approximation**: Use approximation algorithms for large portfolios

```typescript
// Parallel optimization for multiple assets
const optimizations = await Promise.all(
  portfolios.map(p => optimizePortfolio(p))
);
```

### Memory Management

```typescript
// Clear old predictors periodically
setInterval(() => {
  mlService.clearOldPredictors(24 * 60 * 60 * 1000); // 24 hours
}, 60 * 60 * 1000); // Every hour
```

## Monitoring

### Application Monitoring

```bash
# Using PM2
npm install -g pm2

# Start with PM2
pm2 start dist/main.js --name portfolio-api

# Monitor
pm2 monit

# Logs
pm2 logs portfolio-api
```

### Health Check Endpoint

```typescript
@Get('health')
healthCheck() {
  return {
    status: 'ok',
    timestamp: new Date(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: dbConnection.isConnected,
    redis: redisClient.connected
  };
}
```

### Prometheus Metrics

```typescript
// Application already includes @willsoto/nestjs-prometheus
// Metrics available at: /metrics
```

## Security

### Authentication

The system uses JWT authentication. Ensure:

1. **Secure JWT Secret**:
```env
JWT_SECRET=your_very_long_random_secret_key_here
```

2. **Token Expiration**:
```env
JWT_EXPIRATION=24h
```

### Authorization

All portfolio endpoints require authentication:
```typescript
@UseGuards(JwtAuthGuard)
```

### Rate Limiting

```typescript
@UseGuards(ThrottlerGuard)
@Throttle(100, 60) // 100 requests per 60 seconds
```

### CORS

```typescript
app.enableCors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
});
```

## Logging

### Configure Logging

```typescript
// Winston logger configuration
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

const logger = WinstonModule.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});
```

### Log Rotation

```bash
# Install log rotation package
npm install rotating-file-stream

# Configure in logger setup
```

## Backup and Disaster Recovery

### Database Backup

```bash
# Daily backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Automated backup script
0 2 * * * pg_dump $DATABASE_URL | gzip > /backups/db_$(date +\%Y\%m\%d).sql.gz
```

### Restore from Backup

```bash
psql $DATABASE_URL < backup_YYYYMMDD.sql
```

## Migration Guide

### From Old System to Portfolio System

1. **Export existing data**
2. **Transform to new schema**
3. **Validate data integrity**
4. **Run database migrations**
5. **Import transformed data**
6. **Verify all data**

```typescript
// Migration script example
async function migratePortfolios(oldData: any[]) {
  for (const portfolio of oldData) {
    const newPortfolio = await portfolioService.createPortfolio(
      portfolio.userId,
      {
        name: portfolio.name,
        description: portfolio.description,
        // ... map other fields
      }
    );
    
    // Import assets
    for (const asset of portfolio.assets) {
      await portfolioService.addAsset(
        newPortfolio.id,
        asset.ticker,
        asset.name,
        asset.quantity,
        asset.price
      );
    }
  }
}
```

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
psql -U user -d stellaiverse -c "SELECT 1;"

# Check connection string
echo $DATABASE_URL

# View database logs
tail -f /var/log/postgresql/postgresql.log
```

### Redis Connection Issues

```bash
# Check Redis is running
redis-cli ping

# View Redis logs
tail -f /var/log/redis/redis.log
```

### High Memory Usage

```bash
# Check Node process
ps aux | grep node

# Monitor memory
watch -n 1 'ps eo pid,cmd,%cpu,vsz,rss | grep node'

# Enable garbage collection
NODE_OPTIONS="--max-old-space-size=4096"
```

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Optimization time | <10s | For 50 assets |
| Rebalancing calculation | <5s | Including trade planning |
| Backtest (5 years) | <5s | Fast simulation |
| ML prediction | <2s | Per asset |
| API response | <500ms | 95th percentile |
| Database query | <100ms | 95th percentile |
| Memory usage | <500MB | Idle state |

## Further Reading

- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [NestJS Documentation](https://docs.nestjs.com/)
- [TypeORM Documentation](https://typeorm.io/)
- [Bull Queue Advanced Options](https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md)
