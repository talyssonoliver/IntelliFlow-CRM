# @intelliflow/observability

Comprehensive observability package for IntelliFlow CRM, providing distributed
tracing, metrics collection, and structured logging using OpenTelemetry.

## Features

- **Distributed Tracing**: End-to-end request tracking with OpenTelemetry
- **Metrics Collection**: Business and system metrics with OpenTelemetry
- **Structured Logging**: JSON logging with Pino and automatic correlation IDs
- **Performance Monitoring**: Automatic instrumentation for Node.js applications
- **Custom Business Metrics**: Pre-configured metrics for CRM operations

## Installation

```bash
pnpm install @intelliflow/observability
```

## Quick Start

### Initialize All Observability Systems

```typescript
import { initObservability } from '@intelliflow/observability';

// Initialize at application startup
initObservability({
  serviceName: 'intelliflow-api',
  serviceVersion: '1.0.0',
  environment: 'production',
  logLevel: 'info',
});
```

### Distributed Tracing

```typescript
import { trace } from '@intelliflow/observability/tracing';

// Create a traced operation
const result = await trace('processLead', async (span) => {
  span.setAttribute('lead.id', leadId);
  span.setAttribute('lead.score', score);

  // Your business logic
  return await processLead(leadId);
});

// Using decorator
class LeadService {
  @Trace('LeadService.processLead')
  async processLead(leadId: string) {
    // Method automatically traced
  }
}
```

### Metrics

```typescript
import { metrics, metricHelpers } from '@intelliflow/observability/metrics';

// Record business metrics
metricHelpers.recordLeadCreated('website');
metricHelpers.recordLeadScored(85, 0.95, 'v1.0.0');

// Record custom metrics
metrics.apiRequestCount?.add(1, { method: 'POST', endpoint: '/api/leads' });
metrics.apiRequestDuration?.record(duration, { endpoint: '/api/leads' });
```

### Structured Logging

```typescript
import { logger, LogContexts } from '@intelliflow/observability/logging';

// Simple logging
logger.info('User logged in');

// Logging with context
logger.info(LogContexts.user('user-123', 'user@example.com'), 'User logged in');

// Error logging
logger.error(error, 'Failed to process request');

// Domain event logging
import { logDomainEvent } from '@intelliflow/observability/logging';

logDomainEvent('LeadCreated', { leadId, email, source });
```

## Architecture

### Tracing

- Uses OpenTelemetry for distributed tracing
- Automatic instrumentation for HTTP, database, and cache operations
- Trace context propagation across services
- Integration with Jaeger, Tempo, or any OTLP-compatible backend

### Metrics

- Pre-configured business metrics for CRM operations
- System metrics (CPU, memory, connections)
- Custom histogram and counter metrics
- Export to Prometheus, Grafana Cloud, or any OTLP-compatible backend

### Logging

- Structured JSON logging with Pino
- Automatic correlation IDs from trace context
- Performance-optimized for high throughput
- Pretty printing for development
- Sensitive data redaction

## Configuration

### Environment Variables

```bash
# OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_LOG_LEVEL=info
ENVIRONMENT=production
SERVICE_VERSION=1.0.0

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

### OpenTelemetry Collector

Deploy the OpenTelemetry Collector using the provided configuration:

```bash
docker run -v $(pwd)/infra/monitoring/otel-config.yaml:/etc/otel/config.yaml \
  otel/opentelemetry-collector-contrib:latest \
  --config=/etc/otel/config.yaml
```

## Available Metrics

### Business Metrics

- `intelliflow.lead.created` - Number of leads created
- `intelliflow.lead.scored` - Number of leads scored
- `intelliflow.lead.qualified` - Number of leads qualified
- `intelliflow.lead.converted` - Number of leads converted
- `intelliflow.lead.score` - Distribution of lead scores

### AI Metrics

- `intelliflow.ai.inference.count` - AI model inference count
- `intelliflow.ai.inference.latency` - AI inference latency
- `intelliflow.ai.inference.cost` - Cost per inference
- `intelliflow.ai.confidence` - Model confidence scores

### System Metrics

- `intelliflow.api.request.count` - API request count
- `intelliflow.api.request.duration` - API request duration
- `intelliflow.api.error.count` - API error count
- `intelliflow.db.query.duration` - Database query duration
- `intelliflow.cache.hit` - Cache hit count
- `intelliflow.cache.miss` - Cache miss count

## Grafana Dashboard

Import the pre-configured Grafana dashboard:

```bash
# Located at: infra/monitoring/dashboards/main.json
```

The dashboard includes:

- API performance metrics (request rate, latency, errors)
- Business KPIs (leads, conversions, pipeline value)
- AI performance (inference latency, cost, confidence)
- System health (CPU, memory, database)
- Cache performance

## Best Practices

### 1. Initialize Early

Initialize observability at the very start of your application:

```typescript
// index.ts
import { initObservability } from '@intelliflow/observability';

initObservability({ serviceName: 'my-service' });

// Then import other modules
import { app } from './app';
```

### 2. Use Semantic Attributes

Use predefined semantic attributes for consistency:

```typescript
import { SemanticAttributes } from '@intelliflow/observability/tracing';

span.setAttribute(SemanticAttributes.LEAD_ID, leadId);
span.setAttribute(SemanticAttributes.AI_MODEL, 'gpt-4');
```

### 3. Create Child Loggers

Create child loggers with context for related operations:

```typescript
const logger = createChildLogger({
  requestId: req.id,
  userId: req.user.id,
});

logger.info('Processing request');
```

### 4. Measure Critical Paths

Use the `@MeasureTime` decorator on critical methods:

```typescript
class LeadService {
  @MeasureTime(metrics.apiRequestDuration)
  async processLead(leadId: string) {
    // Automatically measured
  }
}
```

### 5. Handle Errors Properly

Always record exceptions in traces:

```typescript
try {
  await riskyOperation();
} catch (error) {
  recordException(error);
  throw error;
}
```

## Testing

The observability package is disabled by default in test environments to avoid
noise. To enable in tests:

```typescript
initObservability({
  serviceName: 'test-service',
  tracingEnabled: true,
  metricsEnabled: true,
});
```

## Performance

- **Tracing**: ~1-2ms overhead per span
- **Metrics**: ~0.1ms overhead per metric recording
- **Logging**: ~0.5ms overhead per log (JSON mode)

All observability operations are non-blocking and use batching for export.

## Troubleshooting

### Traces not appearing

1. Verify OTLP endpoint is accessible
2. Check `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable
3. Ensure OpenTelemetry Collector is running
4. Check collector logs for errors

### Metrics not collected

1. Verify metrics are initialized: `initMetrics()`
2. Check metric export interval (default: 60s)
3. Ensure Prometheus or OTLP endpoint is configured

### Logs not structured

1. Verify logger is initialized: `initLogger()`
2. Check `NODE_ENV` is set correctly
3. Ensure Pino transport is configured

## License

Private - IntelliFlow CRM
