# Queue Metrics Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Compute Job Queue System                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │     Job Submission (QueueService)       │
        │  - addComputeJob()                      │
        │  - addBatchJob()                        │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │      Bull Queue (Redis-backed)          │
        │  States: waiting → active → completed   │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │   ComputeJobProcessor.handleComputeJob()│
        │  ┌───────────────────────────────────┐  │
        │  │ START: Record start time          │  │
        │  │   ↓                                │  │
        │  │ PROCESS: Execute job logic        │  │
        │  │   ↓                                │  │
        │  │ END: Calculate duration            │  │
        │  │   ↓                                │  │
        │  │ METRICS: Record to Prometheus     │  │
        │  └───────────────────────────────────┘  │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │        Prometheus Metrics Registry       │
        │  - job_duration_seconds (Histogram)     │
        │  - job_success_total (Counter)          │
        │  - job_failure_total (Counter)          │
        │  - queue_length (Gauge)                 │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │      GET /metrics Endpoint              │
        │  (MetricsController)                    │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │         Monitoring Systems              │
        │  - Prometheus (scraping)                │
        │  - Grafana (visualization)              │
        │  - Alertmanager (alerting)              │
        └─────────────────────────────────────────┘
```

## Metrics Collection Flow

### 1. Job Processing Metrics

```
Job Start
    │
    ├─► Record start timestamp
    │
    ├─► Execute job logic
    │   ├─► Success path
    │   │   ├─► Calculate duration
    │   │   ├─► jobDuration.observe({job_type, status: "success"}, duration)
    │   │   └─► jobSuccessTotal.inc({job_type})
    │   │
    │   └─► Failure path
    │       ├─► Calculate duration
    │       ├─► Categorize error (timeout/network/validation/etc)
    │       ├─► jobDuration.observe({job_type, status: "failed"}, duration)
    │       └─► jobFailureTotal.inc({job_type, failure_reason})
    │
    └─► Job End
```

### 2. Queue Length Metrics

```
QueueMetricsService (runs every 10 seconds)
    │
    ├─► Call queueService.getQueueStats()
    │   │
    │   ├─► Get waiting count
    │   ├─► Get active count
    │   ├─► Get completed count
    │   ├─► Get failed count
    │   ├─► Get delayed count
    │   └─► Get dead letter count
    │
    └─► Update Prometheus gauges
        ├─► queueLength.set({queue_name: "compute", state: "waiting"}, count)
        ├─► queueLength.set({queue_name: "compute", state: "active"}, count)
        ├─► queueLength.set({queue_name: "compute", state: "completed"}, count)
        ├─► queueLength.set({queue_name: "compute", state: "failed"}, count)
        ├─► queueLength.set({queue_name: "compute", state: "delayed"}, count)
        └─► queueLength.set({queue_name: "dead_letter", state: "waiting"}, count)
```

## Component Interactions

```
┌──────────────────────┐
│  QueueService        │
│  - Job submission    │
│  - Queue management  │
└──────────────────────┘
          │
          │ submits jobs
          ▼
┌──────────────────────┐
│  Bull Queue          │
│  - Job storage       │
│  - State management  │
└──────────────────────┘
          │
          │ processes
          ▼
┌──────────────────────┐       ┌──────────────────────┐
│ ComputeJobProcessor  │──────▶│  Metrics Registry    │
│ - Job execution      │ emits │  - Stores metrics    │
│ - Timing tracking    │       │  - Aggregates data   │
└──────────────────────┘       └──────────────────────┘
          │                              │
          │                              │
          ▼                              ▼
┌──────────────────────┐       ┌──────────────────────┐
│ QueueMetricsService  │──────▶│  /metrics Endpoint   │
│ - Periodic updates   │ feeds │  - Exposes metrics   │
│ - Queue stats        │       │  - Prometheus format │
└──────────────────────┘       └──────────────────────┘
                                         │
                                         │ scraped by
                                         ▼
                               ┌──────────────────────┐
                               │  Prometheus Server   │
                               │  - Scrapes metrics   │
                               │  - Stores time-series│
                               └──────────────────────┘
```

## Metric Types and Use Cases

### Histogram: job_duration_seconds

```
Purpose: Track distribution of job processing times
Use Cases:
  - Calculate percentiles (P50, P95, P99)
  - Identify slow jobs
  - Set SLA thresholds
  - Detect performance degradation

Buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300]
  │
  ├─► 0.1s  - Very fast jobs
  ├─► 0.5s  - Fast jobs
  ├─► 1s    - Normal jobs
  ├─► 5s    - Moderate jobs
  ├─► 30s   - Slow jobs
  ├─► 60s   - Very slow jobs
  └─► 300s  - Extremely slow jobs
```

### Counter: job_success_total

```
Purpose: Count successful job completions
Use Cases:
  - Calculate throughput (jobs/sec)
  - Track processing trends
  - Measure system capacity
  - Calculate success rate

Increments: On every successful job completion
Labels: job_type (data-processing, ai-computation, etc.)
```

### Counter: job_failure_total

```
Purpose: Count failed jobs with categorized reasons
Use Cases:
  - Monitor error rates
  - Identify failure patterns
  - Alert on elevated failures
  - Debug production issues

Increments: On every job failure
Labels: 
  - job_type
  - failure_reason (timeout, network, validation, authentication, unknown)
```

### Gauge: queue_length

```
Purpose: Track current queue depth
Use Cases:
  - Monitor queue backlog
  - Detect bottlenecks
  - Auto-scaling decisions
  - Capacity planning

Updates: Every 10 seconds
Labels:
  - queue_name (compute, dead_letter)
  - state (waiting, active, completed, failed, delayed)
```

## Data Flow Timeline

```
Time: T0
  ├─► Job submitted to queue
  └─► queue_length{state="waiting"} increases

Time: T0 + 10s
  └─► QueueMetricsService updates all queue_length metrics

Time: T1 (job picked up)
  ├─► queue_length{state="waiting"} decreases
  ├─► queue_length{state="active"} increases
  └─► Processor records start time

Time: T2 (job completes)
  ├─► Calculate duration = T2 - T1
  ├─► job_duration_seconds.observe(duration)
  ├─► job_success_total.inc() OR job_failure_total.inc()
  ├─► queue_length{state="active"} decreases
  └─► queue_length{state="completed"} increases

Time: T2 + 10s
  └─► QueueMetricsService updates all queue_length metrics

Time: T3 (Prometheus scrapes)
  └─► GET /metrics returns all current metric values
```

## Monitoring Stack Integration

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Job Processor│  │ Queue Service│  │ Metrics Svc  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
│                   ┌────────▼────────┐                        │
│                   │ Metrics Registry│                        │
│                   └────────┬────────┘                        │
│                            │                                 │
│                   ┌────────▼────────┐                        │
│                   │ /metrics        │                        │
│                   └────────┬────────┘                        │
└────────────────────────────┼─────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   Prometheus    │ ◄─── Scrapes every 15s
                    │   - Stores data │
                    │   - Evaluates   │
                    │     alerts      │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼────────┐ ┌──▼──────┐ ┌────▼─────────┐
     │    Grafana      │ │ Alert   │ │ Other Tools  │
     │  - Dashboards   │ │ Manager │ │ - Datadog    │
     │  - Visualization│ │ - Notify│ │ - New Relic  │
     └─────────────────┘ └─────────┘ └──────────────┘
```

## Performance Characteristics

```
Metric Collection Overhead:
  ├─► Per-job metrics: ~0.5ms
  ├─► Periodic updates: ~10ms every 10s
  └─► Total CPU impact: <0.1%

Memory Usage:
  ├─► Metric storage: ~1MB
  ├─► Time-series data: Stored in Prometheus
  └─► Application impact: Negligible

Network:
  ├─► Metrics endpoint: ~10KB per scrape
  ├─► Scrape frequency: 15s (configurable)
  └─► Bandwidth: ~40KB/min
```

## Scalability Considerations

```
Horizontal Scaling:
  ├─► Each instance exposes own /metrics
  ├─► Prometheus scrapes all instances
  └─► Metrics aggregated in queries

High Cardinality:
  ├─► Limited label values (job types)
  ├─► Categorized failure reasons
  └─► No user-specific labels

Retention:
  ├─► Prometheus: 15 days (default)
  ├─► Long-term: Use remote storage
  └─► Aggregation: Use recording rules
```
