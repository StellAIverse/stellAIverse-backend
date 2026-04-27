# Queue Metrics Quick Start Guide

## Overview

This guide helps you quickly get started with monitoring compute job queue metrics.

## Quick Setup

### 1. Metrics are Already Enabled

The metrics instrumentation is automatically enabled when you start the application. No additional configuration is required.

### 2. Access Metrics

View metrics in your browser or via curl:

```bash
curl http://localhost:3000/metrics
```

### 3. Key Metrics to Monitor

| Metric | What it tells you | Alert threshold |
|--------|------------------|-----------------|
| `stellaiverse_queue_length{state="waiting"}` | Jobs waiting to be processed | > 100 |
| `stellaiverse_job_failure_total` | Failed jobs | Rate > 0.1/sec |
| `stellaiverse_job_duration_seconds` | How long jobs take | P95 > 30s |
| `stellaiverse_queue_length{queue_name="dead_letter"}` | Jobs that need manual intervention | > 0 |

## Common Use Cases

### Check Current Queue Status

```bash
curl -s http://localhost:3000/metrics | grep stellaiverse_queue_length
```

### Monitor Job Success Rate

```bash
# Get success count
curl -s http://localhost:3000/metrics | grep stellaiverse_job_success_total

# Get failure count
curl -s http://localhost:3000/metrics | grep stellaiverse_job_failure_total
```

### Check Job Processing Performance

```bash
curl -s http://localhost:3000/metrics | grep stellaiverse_job_duration_seconds_sum
```

## Integration with Prometheus

### Minimal Prometheus Config

Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'stellaiverse'
    static_configs:
      - targets: ['localhost:3000']
```

Start Prometheus:

```bash
docker run -p 9090:9090 -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml prom/prometheus
```

Access Prometheus UI: http://localhost:9090

### Useful Prometheus Queries

```promql
# Jobs processed per second
rate(stellaiverse_job_success_total[5m])

# Current queue backlog
stellaiverse_queue_length{state="waiting"}

# P95 job duration
histogram_quantile(0.95, rate(stellaiverse_job_duration_seconds_bucket[5m]))

# Failure rate by reason
sum by (failure_reason) (rate(stellaiverse_job_failure_total[5m]))
```

## Grafana Dashboard

### Quick Dashboard Setup

1. Add Prometheus as a data source in Grafana
2. Import dashboard or create panels with these queries:

**Panel 1: Job Processing Rate**
```promql
sum(rate(stellaiverse_job_success_total[5m])) by (job_type)
```

**Panel 2: Queue Depth**
```promql
stellaiverse_queue_length{queue_name="compute",state="waiting"}
```

**Panel 3: Error Rate**
```promql
sum(rate(stellaiverse_job_failure_total[5m])) by (failure_reason)
```

**Panel 4: Job Duration (P95)**
```promql
histogram_quantile(0.95, sum(rate(stellaiverse_job_duration_seconds_bucket[5m])) by (le, job_type))
```

## Testing Metrics

### Run Integration Tests

```bash
npm test -- queue-metrics.integration.spec.ts
```

### Manual Testing

1. Start the application:
   ```bash
   npm run start:dev
   ```

2. Submit a test job:
   ```bash
   curl -X POST http://localhost:3000/api/v1/jobs \
     -H "Content-Type: application/json" \
     -d '{
       "type": "data-processing",
       "payload": {"records": [{"id": 1}]}
     }'
   ```

3. Check metrics:
   ```bash
   curl http://localhost:3000/metrics | grep stellaiverse_job
   ```

## Troubleshooting

### No metrics appearing

**Check the metrics endpoint:**
```bash
curl -v http://localhost:3000/metrics
```

**Expected response:** HTTP 200 with Prometheus-formatted metrics

### Metrics not updating

**Check queue stats are being collected:**
```bash
# Look for this log message
grep "Starting queue metrics collection" logs/app.log
```

**Verify jobs are being processed:**
```bash
curl http://localhost:3000/api/v1/queue/stats
```

### High memory usage

If you notice high memory usage from metrics:

1. Reduce metrics retention in Prometheus
2. Increase scrape interval (default: 15s)
3. Use recording rules for complex queries

## Next Steps

- Read the full [Queue Metrics Documentation](./QUEUE_METRICS.md)
- Set up alerting rules
- Create custom Grafana dashboards
- Integrate with your monitoring stack (Datadog, New Relic, etc.)

## Support

For issues or questions:
- Check the [main documentation](./QUEUE_METRICS.md)
- Review integration tests for examples
- Check application logs for errors
