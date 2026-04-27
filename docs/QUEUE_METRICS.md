# Compute Job Queue Metrics

This document describes the metrics exposed by the compute job queue system for monitoring and observability.

## Overview

The compute job queue exposes Prometheus-compatible metrics that provide insights into job processing performance, success/failure rates, and queue health. These metrics are essential for:

- Monitoring job processing performance
- Detecting bottlenecks and scaling issues
- Alerting on failures and anomalies
- Capacity planning and resource optimization

## Metrics Endpoint

All metrics are exposed at the `/metrics` endpoint in Prometheus format.

```bash
curl http://localhost:3000/metrics
```

## Available Metrics

### 1. Job Duration Histogram

**Metric Name:** `stellaiverse_job_duration_seconds`

**Type:** Histogram

**Description:** Tracks the duration of compute job processing in seconds.

**Labels:**
- `job_type`: The type of job (e.g., "data-processing", "ai-computation", "report-generation")
- `status`: The outcome of the job ("success", "failed", "cached")

**Buckets:** 0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300 seconds

**Example:**
```prometheus
stellaiverse_job_duration_seconds_bucket{job_type="data-processing",status="success",le="1"} 45
stellaiverse_job_duration_seconds_bucket{job_type="data-processing",status="success",le="5"} 98
stellaiverse_job_duration_seconds_sum{job_type="data-processing",status="success"} 234.5
stellaiverse_job_duration_seconds_count{job_type="data-processing",status="success"} 100
```

**Use Cases:**
- Calculate p50, p95, p99 latencies
- Identify slow job types
- Detect performance degradation
- Set SLA alerts

**Example Queries:**
```promql
# P95 latency for data-processing jobs
histogram_quantile(0.95, rate(stellaiverse_job_duration_seconds_bucket{job_type="data-processing"}[5m]))

# Average job duration by type
rate(stellaiverse_job_duration_seconds_sum[5m]) / rate(stellaiverse_job_duration_seconds_count[5m])
```

---

### 2. Job Success Counter

**Metric Name:** `stellaiverse_job_success_total`

**Type:** Counter

**Description:** Total number of successfully completed jobs.

**Labels:**
- `job_type`: The type of job

**Example:**
```prometheus
stellaiverse_job_success_total{job_type="data-processing"} 1523
stellaiverse_job_success_total{job_type="ai-computation"} 892
stellaiverse_job_success_total{job_type="report-generation"} 445
```

**Use Cases:**
- Track job throughput
- Calculate success rates
- Monitor job processing trends
- Capacity planning

**Example Queries:**
```promql
# Jobs processed per second by type
rate(stellaiverse_job_success_total[5m])

# Total successful jobs in last hour
increase(stellaiverse_job_success_total[1h])

# Success rate (requires failure metric)
rate(stellaiverse_job_success_total[5m]) / (rate(stellaiverse_job_success_total[5m]) + rate(stellaiverse_job_failure_total[5m]))
```

---

### 3. Job Failure Counter

**Metric Name:** `stellaiverse_job_failure_total`

**Type:** Counter

**Description:** Total number of failed jobs with categorized failure reasons.

**Labels:**
- `job_type`: The type of job
- `failure_reason`: Categorized reason for failure ("timeout", "network", "validation", "authentication", "unknown")

**Example:**
```prometheus
stellaiverse_job_failure_total{job_type="email-notification",failure_reason="validation"} 23
stellaiverse_job_failure_total{job_type="ai-computation",failure_reason="timeout"} 12
stellaiverse_job_failure_total{job_type="data-processing",failure_reason="network"} 8
```

**Use Cases:**
- Monitor error rates
- Identify common failure patterns
- Alert on elevated failure rates
- Debug production issues

**Example Queries:**
```promql
# Failure rate by type
rate(stellaiverse_job_failure_total[5m])

# Most common failure reasons
topk(5, sum by (failure_reason) (rate(stellaiverse_job_failure_total[1h])))

# Alert on high failure rate
rate(stellaiverse_job_failure_total[5m]) > 0.1
```

---

### 4. Queue Length Gauge

**Metric Name:** `stellaiverse_queue_length`

**Type:** Gauge

**Description:** Current number of jobs in various queue states.

**Labels:**
- `queue_name`: The queue name ("compute", "dead_letter")
- `state`: The job state ("waiting", "active", "completed", "failed", "delayed")

**Example:**
```prometheus
stellaiverse_queue_length{queue_name="compute",state="waiting"} 45
stellaiverse_queue_length{queue_name="compute",state="active"} 5
stellaiverse_queue_length{queue_name="compute",state="completed"} 1523
stellaiverse_queue_length{queue_name="compute",state="failed"} 23
stellaiverse_queue_length{queue_name="compute",state="delayed"} 10
stellaiverse_queue_length{queue_name="dead_letter",state="waiting"} 3
```

**Use Cases:**
- Monitor queue backlog
- Detect processing bottlenecks
- Auto-scaling decisions
- Alert on queue buildup

**Example Queries:**
```promql
# Total jobs waiting to be processed
stellaiverse_queue_length{queue_name="compute",state="waiting"}

# Alert on large queue backlog
stellaiverse_queue_length{queue_name="compute",state="waiting"} > 100

# Jobs in dead letter queue (requires attention)
stellaiverse_queue_length{queue_name="dead_letter",state="waiting"}

# Queue processing rate
rate(stellaiverse_queue_length{queue_name="compute",state="completed"}[5m])
```

---

## Metrics Collection

Metrics are collected automatically through two mechanisms:

1. **Job Processing Instrumentation**: Metrics are recorded during job execution in `compute-job.processor.ts`
2. **Periodic Queue Stats**: Queue length metrics are updated every 10 seconds by `queue-metrics.service.ts`

## Integration with Monitoring Systems

### Prometheus

Add the following scrape configuration to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'stellaiverse-backend'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
```

### Grafana Dashboard

Example dashboard queries:

**Job Processing Rate Panel:**
```promql
sum(rate(stellaiverse_job_success_total[5m])) by (job_type)
```

**Job Duration Heatmap:**
```promql
sum(rate(stellaiverse_job_duration_seconds_bucket[5m])) by (le, job_type)
```

**Queue Depth Panel:**
```promql
stellaiverse_queue_length{queue_name="compute",state="waiting"}
```

**Error Rate Panel:**
```promql
sum(rate(stellaiverse_job_failure_total[5m])) by (failure_reason)
```

### Alerting Rules

Example Prometheus alerting rules:

```yaml
groups:
  - name: job_queue_alerts
    rules:
      - alert: HighJobFailureRate
        expr: rate(stellaiverse_job_failure_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High job failure rate detected"
          description: "Job failure rate is {{ $value }} failures/sec"

      - alert: QueueBacklogBuilding
        expr: stellaiverse_queue_length{queue_name="compute",state="waiting"} > 100
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Queue backlog is building up"
          description: "{{ $value }} jobs waiting in queue"

      - alert: DeadLetterQueueNotEmpty
        expr: stellaiverse_queue_length{queue_name="dead_letter",state="waiting"} > 0
        for: 30m
        labels:
          severity: critical
        annotations:
          summary: "Jobs in dead letter queue require attention"
          description: "{{ $value }} jobs in dead letter queue"

      - alert: SlowJobProcessing
        expr: histogram_quantile(0.95, rate(stellaiverse_job_duration_seconds_bucket[5m])) > 30
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Job processing is slow"
          description: "P95 latency is {{ $value }}s"
```

## Testing

Run the integration tests to verify metrics are working correctly:

```bash
npm test -- queue-metrics.integration.spec.ts
```

The test suite validates:
- Job duration metrics for successful and failed jobs
- Success/failure counters with proper labels
- Queue length tracking for all states
- Metrics endpoint integration
- Histogram buckets and labels

## Performance Considerations

- Metrics collection has minimal overhead (<1ms per job)
- Queue stats are updated every 10 seconds to balance accuracy and performance
- Histogram buckets are optimized for typical job durations (0.1s to 5 minutes)
- Completed jobs are retained for 1 hour to allow metric aggregation

## Troubleshooting

### Metrics not appearing

1. Check that the metrics endpoint is accessible:
   ```bash
   curl http://localhost:3000/metrics
   ```

2. Verify Redis connection is healthy:
   ```bash
   curl http://localhost:3000/health
   ```

3. Check application logs for metric collection errors

### Incorrect metric values

1. Ensure jobs are being processed (check queue stats)
2. Verify the `QueueMetricsService` is running (check logs for "Starting queue metrics collection")
3. Check for clock skew if duration metrics seem incorrect

### High cardinality warnings

If you see high cardinality warnings, consider:
- Limiting the number of unique job types
- Aggregating similar failure reasons
- Using recording rules in Prometheus

## Future Enhancements

Potential improvements to the metrics system:

- [ ] Add job priority distribution metrics
- [ ] Track cache hit/miss rates per job type
- [ ] Add job retry attempt distribution
- [ ] Track job payload size distribution
- [ ] Add worker utilization metrics
- [ ] Implement custom business metrics per job type
- [ ] Add SLO/SLI tracking
