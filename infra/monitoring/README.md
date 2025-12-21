# IntelliFlow CRM Observability Stack

## Overview

This directory contains the complete observability infrastructure for
IntelliFlow CRM, implementing **IFC-074: Full Stack Observability**.

The stack provides:

- **Distributed Tracing**: OpenTelemetry + Tempo for request flow visualization
- **Metrics Collection**: Prometheus for time-series metrics
- **Log Aggregation**: Loki for centralized logging
- **Visualization**: Grafana dashboards for unified observability
- **Error Tracking**: Sentry for production error monitoring
- **Correlation IDs**: Request tracking across service boundaries

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  IntelliFlow CRM API                        │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │  OpenTelemetry   │  │     Sentry       │               │
│  │  SDK (Traces)    │  │  (Errors)        │               │
│  └────────┬─────────┘  └────────┬─────────┘               │
│           │                      │                          │
└───────────┼──────────────────────┼──────────────────────────┘
            │                      │
            ▼                      ▼
   ┌────────────────┐     ┌──────────────┐
   │  OTel          │     │   Sentry     │
   │  Collector     │     │   Cloud      │
   └────────┬───────┘     └──────────────┘
            │
            ├─── Traces ──►  Tempo
            ├─── Metrics ──► Prometheus
            └─── Logs ────►  Loki
                             │
                             ▼
                        ┌─────────────┐
                        │   Grafana   │
                        │ (Dashboards)│
                        └─────────────┘
```

## Quick Start

### Local Development

1. **Start monitoring stack**:

   ```bash
   cd infra/monitoring
   docker-compose -f docker-compose.monitoring.yml up -d
   ```

2. **Configure API environment**:

   ```bash
   # .env
   OTEL_ENABLED=true
   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
   SENTRY_ENABLED=false  # Disable in development
   ```

3. **Access dashboards**:
   - Grafana: http://localhost:3001 (admin/admin)
   - Prometheus: http://localhost:9090
   - Tempo: http://localhost:3200
   - Loki: http://localhost:3100

### Production Deployment

1. **Deploy monitoring stack** (EasyPanel/Railway):

   ```bash
   # Use docker-compose.monitoring.yml as reference
   # Configure with production endpoints
   ```

2. **Configure API environment**:

   ```bash
   # .env.production
   OTEL_ENABLED=true
   OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.intelliflow.ai
   SENTRY_ENABLED=true
   SENTRY_DSN=https://your-sentry-dsn@sentry.io/project
   SENTRY_ENVIRONMENT=production
   ```

## Components

### OpenTelemetry Collector

**Purpose**: Central telemetry aggregation and routing

**Configuration**: `otel-collector.yaml`

**Features**:

- Receives telemetry via OTLP (gRPC and HTTP)
- Filters health check noise
- Scrubs sensitive headers
- Routes to appropriate backends

**Endpoints**:

- OTLP HTTP: `http://localhost:4318`
- OTLP gRPC: `http://localhost:4317`
- Health: `http://localhost:13133`
- Metrics: `http://localhost:8888/metrics`

### Prometheus

**Purpose**: Metrics storage and querying

**Configuration**: `prometheus.yml`

**Features**:

- 30-day retention
- 10GB storage limit
- Remote write API enabled
- Service discovery

**Endpoints**:

- UI: `http://localhost:9090`
- API: `http://localhost:9090/api/v1/`

### Loki

**Purpose**: Log aggregation

**Configuration**: `loki-config.yml`

**Features**:

- Label-based indexing
- Efficient storage
- LogQL query language

**Endpoints**:

- API: `http://localhost:3100`
- Push: `http://localhost:3100/loki/api/v1/push`

### Tempo

**Purpose**: Distributed tracing backend

**Configuration**: `tempo-config.yml`

**Features**:

- Trace correlation with metrics/logs
- TraceQL query language
- Efficient trace storage

**Endpoints**:

- HTTP: `http://localhost:3200`
- gRPC: `http://localhost:9095`

### Grafana

**Purpose**: Unified observability dashboard

**Configuration**: `grafana/provisioning/`

**Pre-configured**:

- Prometheus datasource
- Loki datasource
- Tempo datasource
- IntelliFlow dashboards

**Endpoints**:

- UI: `http://localhost:3001`
- Default credentials: admin/admin

## API Integration

### OpenTelemetry SDK

**Location**: `apps/api/src/tracing/otel.ts`

**Features**:

- Automatic HTTP/Express instrumentation
- Prisma query tracing
- Console exporter (dev) / OTLP (prod)
- p95 overhead <5ms (KPI)

**Usage**:

```typescript
import { startTracing } from './tracing';

// Call before importing other modules
startTracing();
```

### Sentry Integration

**Location**: `apps/api/src/tracing/sentry.ts`

**Features**:

- Automatic error capture
- Performance monitoring
- Release tracking
- Sensitive data scrubbing

**Usage**:

```typescript
import { initializeSentry, captureException } from './tracing';

initializeSentry();

try {
  // Your code
} catch (error) {
  captureException(error, {
    user: { id: userId },
    tags: { feature: 'leads' },
  });
}
```

### Correlation IDs

**Location**: `apps/api/src/tracing/correlation.ts`

**Features**:

- Request ID extraction from headers
- Correlation ID generation (UUID v4)
- AsyncLocalStorage for context propagation
- Automatic logging enhancement

**Usage**:

```typescript
import { initializeRequestContext, runWithContext } from './tracing';

const context = initializeRequestContext(req.headers, userId);
runWithContext(context, () => {
  // All code here has access to correlation ID
});
```

### tRPC Middleware

**Location**: `apps/api/src/tracing/middleware.ts`

**Features**:

- Automatic span creation for procedures
- Performance tracking (<50ms KPI)
- Error capture to Sentry
- Correlation ID propagation

**Usage**:

```typescript
import { tracedPublicProcedure } from './tracing/middleware';

export const myRouter = createTRPCRouter({
  myProcedure: tracedPublicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      // Automatically traced!
    }),
});
```

## Health Endpoints

### Available Endpoints

All health endpoints are accessible via tRPC router (`health.*`):

1. **`health.ping`** - Minimal liveness check
   - Response time: <10ms
   - Use for: Basic uptime monitoring

2. **`health.check`** - Comprehensive health check
   - Database connectivity
   - Version and environment info
   - Correlation ID tracking
   - Response time: <50ms

3. **`health.ready`** - Readiness probe
   - Validates all dependencies
   - Use for: Kubernetes readiness probes

4. **`health.alive`** - Liveness probe
   - Process uptime and memory
   - Use for: Kubernetes liveness probes

5. **`health.dbStats`** - Database metrics
   - Connection pool stats
   - Prisma metrics (if enabled)

### Example Queries

```typescript
// From frontend
const health = await trpc.health.check.query();
console.log(health.status); // 'healthy' | 'degraded'

// From monitoring
fetch('http://api:3000/api/trpc/health.ping');
```

## Metrics and KPIs

### Performance Targets (IFC-074)

- **Tracing overhead**: p95 <5ms
- **Error capture rate**: 100%
- **Health check latency**: <50ms
- **Trace retention**: 7 days
- **Metric retention**: 30 days

### Key Metrics

1. **Request Metrics**:
   - `trpc_request_duration_ms` - Request latency
   - `trpc_request_total` - Request count
   - `trpc_error_total` - Error count

2. **Database Metrics**:
   - `prisma_query_duration_ms` - Query latency
   - `prisma_connection_pool_active` - Active connections
   - `prisma_connection_pool_idle` - Idle connections

3. **Process Metrics**:
   - `process_cpu_percent` - CPU usage
   - `process_memory_bytes` - Memory usage
   - `process_uptime_seconds` - Process uptime

## Dashboards

### Pre-configured Dashboards

1. **IntelliFlow Overview** (`dashboards/main.json`)
   - Request rate and latency
   - Error rate
   - Database performance
   - System health

2. **API Performance** (Future)
   - Endpoint latency breakdown
   - Slow query analysis
   - Cache hit rates

3. **Error Analysis** (Future)
   - Error trends
   - Stack trace aggregation
   - User impact

## Alerts

**Configuration**: `alerts/intelliflow-alerts.yaml`

### Critical Alerts

1. **High Error Rate**: >5% of requests failing
2. **Slow Response**: p95 latency >200ms
3. **Database Down**: Connection failures
4. **High Memory**: >80% memory usage

### Warning Alerts

1. **Elevated Latency**: p95 >100ms
2. **Connection Pool Saturation**: >80% connections used
3. **Disk Space Low**: <20% free space

## Troubleshooting

### No traces appearing

1. Check collector is running:

   ```bash
   curl http://localhost:13133
   ```

2. Verify API configuration:

   ```bash
   echo $OTEL_EXPORTER_OTLP_ENDPOINT
   ```

3. Check collector logs:
   ```bash
   docker logs intelliflow-otel-collector
   ```

### Slow trace export

1. Increase batch size in `otel-collector.yaml`
2. Check network latency to collector
3. Verify collector resource limits

### Missing metrics

1. Verify Prometheus datasource in Grafana
2. Check Prometheus targets: http://localhost:9090/targets
3. Verify metric naming (OpenTelemetry conventions)

### Sentry not capturing errors

1. Check `SENTRY_DSN` is set
2. Verify `SENTRY_ENABLED=true`
3. Test with: `captureMessage('Test from API')`

## Security

### Access Control

- **Grafana**: Password-protected (admin/admin in dev)
- **Prometheus**: Internal network only
- **Collector**: CORS-restricted endpoints
- **Tempo**: Internal network only

### Data Scrubbing

Automatic scrubbing of:

- Authorization headers
- API keys
- Cookies
- User emails (production)
- Sensitive URLs

**Configuration**: See `sentry.ts` and `otel-collector.yaml`

## Cost Optimization

### Development

- Console exporter (free)
- Local stack (compute only)
- Sentry disabled

### Production

- OTLP to self-hosted collector
- Prometheus remote write
- Sentry with 10% trace sampling
- 7-day trace retention

**Estimated costs**:

- Self-hosted: $50-100/month (compute)
- Sentry: $0-26/month (free tier or team)

## References

- [OpenTelemetry Docs](https://opentelemetry.io/docs/)
- [Sentry Node.js](https://docs.sentry.io/platforms/node/)
- [Grafana Loki](https://grafana.com/docs/loki/)
- [Grafana Tempo](https://grafana.com/docs/tempo/)
- [Prometheus](https://prometheus.io/docs/)

## Support

For issues or questions:

1. Check monitoring stack health: `docker-compose ps`
2. Review collector logs: `docker logs intelliflow-otel-collector`
3. Verify API tracing initialization logs
4. Contact DevOps team for production issues
