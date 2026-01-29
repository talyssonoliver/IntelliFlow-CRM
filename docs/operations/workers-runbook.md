# Workers Runbook

> Operational guide for IntelliFlow CRM worker services

**Task ID**: IFC-163
**Last Updated**: 2026-01-01
**Owner**: Platform Team

## Overview

This runbook covers operations for the three worker services:

| Worker | Queue(s) | Port | Purpose |
|--------|----------|------|---------|
| **events-worker** | `intelliflow:events` | 3100 | Domain event outbox polling and dispatch |
| **ingestion-worker** | `intelliflow:text-extraction`, `intelliflow:ocr-*`, `intelliflow:embedding-*` | 3101 | Document processing, OCR, embeddings |
| **notifications-worker** | `intelliflow:notifications:*` | 3102 | Email, SMS, webhook delivery |

## Quick Reference

### Health Check Endpoints

```bash
# Liveness (is the process alive?)
curl http://localhost:3100/health/live

# Readiness (can it accept work?)
curl http://localhost:3100/health/ready

# Full health with dependencies
curl http://localhost:3100/health/detailed

# Prometheus metrics
curl http://localhost:3100/metrics
```

### Common Commands

```bash
# View worker logs
docker logs -f events-worker
docker logs -f ingestion-worker
docker logs -f notifications-worker

# Restart a worker
docker restart events-worker

# Scale workers
docker-compose up -d --scale ingestion-worker=3

# Check queue depths
redis-cli LLEN intelliflow:events:wait
redis-cli LLEN intelliflow:text-extraction:wait
redis-cli LLEN intelliflow:notifications:email:wait
```

## Architecture

### Worker Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                      Worker Process                          │
├─────────────────────────────────────────────────────────────┤
│  1. Start → Load config → Initialize telemetry              │
│  2. Connect to Redis (BullMQ)                               │
│  3. Start health check server                               │
│  4. Register signal handlers (SIGTERM, SIGINT)              │
│  5. Call onStart() → worker-specific initialization         │
│  6. Begin processing jobs                                   │
│                                                             │
│  On shutdown:                                               │
│  1. Stop accepting new jobs                                 │
│  2. Wait for in-flight jobs (30s timeout)                   │
│  3. Call onStop() → cleanup                                 │
│  4. Close Redis connections                                 │
│  5. Stop health server                                      │
└─────────────────────────────────────────────────────────────┘
```

### Queue Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Producer   │───▶│   Queue     │───▶│   Worker    │
│  (API/App)  │    │   (Redis)   │    │  (BullMQ)   │
└─────────────┘    └─────────────┘    └─────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │    DLQ      │
                   │ (Failed)    │
                   └─────────────┘
```

## Incident Response

### Circuit Breaker Open

**Symptoms**: Jobs failing immediately, circuit breaker state = OPEN in metrics

**Diagnosis**:
```bash
# Check circuit breaker state
curl http://localhost:3100/health/detailed | jq '.dependencies'

# Check recent errors in logs
docker logs --tail 100 notifications-worker | grep -i "circuit"
```

**Resolution**:
1. Identify root cause (provider down, rate limiting, auth failure)
2. Fix underlying issue
3. Circuit breaker will auto-reset after `resetTimeoutMs` (default: 60s)
4. Or restart worker to force reset

### Queue Backlog Growing

**Symptoms**: Queue depth increasing, processing latency high

**Diagnosis**:
```bash
# Check queue depths
redis-cli LLEN intelliflow:events:wait
redis-cli LLEN intelliflow:events:active

# Check worker concurrency
curl http://localhost:3100/health/detailed | jq '.metrics.concurrency'
```

**Resolution**:
1. Scale up workers: `docker-compose up -d --scale events-worker=3`
2. Check for slow jobs: look at p99 latency in Grafana
3. If single job blocking, check for deadlocks or infinite loops

### DLQ Messages Accumulating

**Symptoms**: `intelliflow_queue_dlq_depth` increasing

**Diagnosis**:
```bash
# List DLQ messages
redis-cli LRANGE intelliflow:events:failed 0 10

# Get specific failed job
redis-cli HGETALL bull:intelliflow:events:JOB_ID
```

**Resolution**:
1. Investigate failure reason in job data
2. Fix underlying issue
3. Retry failed jobs:
   ```bash
   # Retry specific job
   npx bullmq-cli retry intelliflow:events JOB_ID

   # Retry all failed jobs
   npx bullmq-cli retry-all intelliflow:events
   ```
4. Or purge if unrecoverable:
   ```bash
   npx bullmq-cli clean intelliflow:events failed
   ```

### Worker Not Starting

**Symptoms**: Container exits immediately, health checks failing

**Diagnosis**:
```bash
# Check container logs
docker logs events-worker

# Check exit code
docker inspect events-worker --format='{{.State.ExitCode}}'

# Common exit codes:
# 1 - General error (check logs)
# 137 - OOM killed
# 143 - SIGTERM (graceful shutdown)
```

**Resolution**:
1. Check Redis connectivity: `redis-cli ping`
2. Verify environment variables: `docker exec events-worker env`
3. Check resource limits if OOM
4. Review startup logs for config errors

### Outbox Polling Lag (Events Worker)

**Symptoms**: Events appearing late, `intelliflow_outbox_batch_size` consistently high

**Diagnosis**:
```bash
# Check outbox table size
psql -c "SELECT COUNT(*) FROM domain_event_outbox WHERE processed_at IS NULL"

# Check polling interval
curl http://localhost:3100/health/detailed | jq '.config.pollIntervalMs'
```

**Resolution**:
1. Increase batch size in config (max 100)
2. Scale events-worker instances
3. Check database performance (add index if needed)
4. If severe backlog, consider bulk processing script

## Configuration

### Environment Variables

#### Common (All Workers)

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | - | Redis password (optional) |
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |
| `HEALTH_PORT` | `3100` | Health check server port |
| `SHUTDOWN_TIMEOUT_MS` | `30000` | Graceful shutdown timeout |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | - | OpenTelemetry endpoint |

#### Events Worker

| Variable | Default | Description |
|----------|---------|-------------|
| `OUTBOX_POLL_INTERVAL_MS` | `100` | Outbox polling interval |
| `OUTBOX_BATCH_SIZE` | `100` | Max events per poll |
| `DATABASE_URL` | - | PostgreSQL connection string |

#### Ingestion Worker

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_TEXT_EXTRACTION` | `true` | Enable text extraction queue |
| `ENABLE_OCR` | `false` | Enable OCR processing queue |
| `ENABLE_EMBEDDINGS` | `false` | Enable embedding generation queue |
| `OCR_ENGINE` | `tesseract` | OCR engine (tesseract, google-vision, aws-textract) |

#### Notifications Worker

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_EMAIL` | `true` | Enable email channel |
| `ENABLE_SMS` | `false` | Enable SMS channel |
| `ENABLE_WEBHOOK` | `false` | Enable webhook channel |
| `SMTP_HOST` | `localhost` | SMTP server host |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_USER` | - | SMTP username |
| `SMTP_PASSWORD` | - | SMTP password |
| `EMAIL_FROM` | `noreply@intelliflow.com` | Default from address |
| `SMS_PROVIDER` | `mock` | SMS provider (twilio, messagebird, mock) |
| `TWILIO_ACCOUNT_SID` | - | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | - | Twilio auth token |

## Retry Strategy

Jobs use exponential backoff per `docs/operations/runbooks/dlq-triage.md`:

| Attempt | Delay | Cumulative |
|---------|-------|------------|
| 1 | 1s | 1s |
| 2 | 5s | 6s |
| 3 | 30s | 36s |

After 3 failed attempts, jobs move to DLQ for manual triage.

### Retry Behavior by Queue

| Queue | Max Attempts | Backoff | Notes |
|-------|-------------|---------|-------|
| `intelliflow:events` | 3 | Exponential | Critical - triggers downstream |
| `intelliflow:text-extraction` | 3 | Exponential | Idempotent |
| `intelliflow:ocr-processing` | 2 | Exponential | Resource-intensive |
| `intelliflow:notifications:email` | 5 | Exponential | May succeed on retry |
| `intelliflow:notifications:sms` | 3 | Exponential | Provider may be down |
| `intelliflow:notifications:webhook` | 5 | Exponential | Endpoint may be temporarily unavailable |

## Scaling Guidelines

### When to Scale

| Metric | Threshold | Action |
|--------|-----------|--------|
| Queue depth | > 1000 | Add worker instance |
| Processing latency p95 | > 10s | Add worker instance |
| CPU usage | > 80% | Add worker instance |
| Memory usage | > 80% | Increase memory limit |
| Error rate | > 5% | Investigate root cause first |

### Scaling Considerations

- **Events Worker**: Scale carefully - outbox polling should be single-instance per partition
- **Ingestion Worker**: Scales well horizontally, no shared state
- **Notifications Worker**: Scale based on channel; email/SMS have provider rate limits

### Resource Recommendations

| Worker | Min Instances | CPU | Memory |
|--------|--------------|-----|--------|
| events-worker | 1 | 0.5 | 256Mi |
| ingestion-worker | 1-3 | 1.0 | 512Mi |
| notifications-worker | 1-2 | 0.5 | 256Mi |

## Monitoring & Alerts

### Key Metrics

| Metric | Purpose | Alert Threshold |
|--------|---------|-----------------|
| `intelliflow_worker_jobs_processed_total` | Throughput | - |
| `intelliflow_worker_jobs_failed_total` | Error rate | > 5% of processed |
| `intelliflow_worker_job_duration_seconds` | Latency | p99 > 30s |
| `intelliflow_queue_depth` | Backlog | > 1000 |
| `intelliflow_queue_dlq_depth` | Failed jobs | > 10 |
| `intelliflow_circuit_breaker_state` | Resilience | state = OPEN |

### Grafana Dashboard

Import `infra/monitoring/dashboards/workers.json` into Grafana for:
- Worker overview (active workers, jobs processed, error rate)
- Job throughput graphs
- Queue depth visualization
- Processing latency heatmaps
- Circuit breaker state timeline
- Outbox polling metrics

### Alert Rules

See `infra/monitoring/alerts/intelliflow-alerts.yaml` for Prometheus alert rules:

```yaml
- alert: WorkerDown
  expr: up{job=~".*worker.*"} == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Worker {{ $labels.job }} is down"

- alert: HighDLQDepth
  expr: intelliflow_queue_dlq_depth > 100
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "DLQ depth high on {{ $labels.queue }}"

- alert: CircuitBreakerOpen
  expr: intelliflow_circuit_breaker_state == 2
  for: 1m
  labels:
    severity: warning
  annotations:
    summary: "Circuit breaker open on {{ $labels.worker }}"
```

## Deployment

### Rolling Update

```bash
# Build new image
docker build -t intelliflow/events-worker:v1.2.0 -f apps/workers/events-worker/Dockerfile .

# Deploy with zero downtime
docker-compose up -d --no-deps events-worker

# Verify health
curl http://localhost:3100/health/ready
```

### Rollback

```bash
# Revert to previous version
docker-compose up -d --no-deps events-worker:v1.1.0

# Or use Docker rollback
docker service rollback intelliflow_events-worker
```

## Maintenance Tasks

### Purge Old Jobs

```bash
# Remove completed jobs older than 7 days
npx bullmq-cli clean intelliflow:events completed 604800000

# Remove failed jobs older than 30 days
npx bullmq-cli clean intelliflow:events failed 2592000000
```

### Database Maintenance (Events Worker)

```sql
-- Archive processed outbox events (run weekly)
INSERT INTO domain_event_outbox_archive
SELECT * FROM domain_event_outbox
WHERE processed_at < NOW() - INTERVAL '7 days';

DELETE FROM domain_event_outbox
WHERE processed_at < NOW() - INTERVAL '7 days';

-- Vacuum to reclaim space
VACUUM ANALYZE domain_event_outbox;
```

### Redis Maintenance

```bash
# Check memory usage
redis-cli INFO memory

# Clear all completed job data (emergency only)
redis-cli KEYS "bull:intelliflow:*:completed:*" | xargs redis-cli DEL
```

## Troubleshooting Checklist

1. **Is Redis available?**
   ```bash
   redis-cli ping
   ```

2. **Is the database available? (Events Worker)**
   ```bash
   psql -c "SELECT 1"
   ```

3. **Are health endpoints responding?**
   ```bash
   curl http://localhost:3100/health
   ```

4. **What's in the logs?**
   ```bash
   docker logs --tail 100 events-worker | grep -i error
   ```

5. **What's the queue state?**
   ```bash
   redis-cli LLEN intelliflow:events:wait
   redis-cli LLEN intelliflow:events:active
   redis-cli LLEN intelliflow:events:failed
   ```

6. **Is the circuit breaker open?**
   ```bash
   curl http://localhost:3100/health/detailed | jq '.dependencies'
   ```

7. **Are there resource constraints?**
   ```bash
   docker stats events-worker
   ```

## Related Documentation

- [DLQ Triage Runbook](./runbooks/dlq-triage.md) - Dead letter queue handling
- [Ingestion Runbook](./runbooks/ingestion.md) - Document processing specifics
- [Notifications Runbook](./runbooks/notifications.md) - Notification delivery specifics
- [Event Contracts](../events/contracts-v1.yaml) - Event schema definitions
- [Architecture: Hex Boundaries](../architecture/hex-boundaries.md) - System design

## Support

**On-Call Escalation**:
1. Check this runbook
2. Check Grafana dashboards
3. Escalate to Platform Team on-call

**Slack Channels**:
- `#platform-alerts` - Automated alerts
- `#platform-support` - Human support
