# OpenTelemetry Implementation Guide

## Overview

This guide provides step-by-step instructions for adding observability to IntelliFlow CRM services using OpenTelemetry (OTel). The implementation provides unified traces, metrics, and logs with automatic correlation.

## Architecture

```
┌─────────────┐     OTLP      ┌──────────────┐
│   Your App  │  ───────────> │ OTel         │
│   (Node.js) │   (gRPC/HTTP) │ Collector    │
└─────────────┘                └──────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
              ┌──────────┐      ┌──────┐         ┌──────┐
              │ Tempo    │      │ Loki │         │ Prom │
              │ (Traces) │      │(Logs)│         │(Metrics)
              └──────────┘      └──────┘         └──────┘
                                      │
                                      ▼
                                ┌──────────┐
                                │ Grafana  │
                                │(Dashboards)
                                └──────────┘
```

## Quick Start

### 1. Install Dependencies

The `@intelliflow/observability` package is already available in the monorepo. To use it in your app:

```json
// package.json
{
  "dependencies": {
    "@intelliflow/observability": "workspace:*"
  }
}
```

### 2. Initialize Observability (All-in-One)

For most services, use the `initObservability` convenience function:

```typescript
// src/index.ts or src/server.ts
import { initObservability } from '@intelliflow/observability';

// Call this BEFORE any other imports or code
initObservability({
  serviceName: 'intelliflow-api',
  serviceVersion: process.env.SERVICE_VERSION || '0.1.0',
  environment: process.env.ENVIRONMENT || 'development',
  tracingEnabled: true,
  metricsEnabled: true,
  logLevel: 'info',
});

// Now start your application
import express from 'express';
// ... rest of your app
```

### 3. Initialize Components Separately (Advanced)

For fine-grained control, initialize components separately:

```typescript
import { initTracing, initMetrics, initLogger } from '@intelliflow/observability';

// Logging first (other components will use it)
initLogger({
  name: 'intelliflow-api',
  level: 'info',
});

// Tracing
initTracing({
  serviceName: 'intelliflow-api',
  serviceVersion: '0.1.0',
  environment: 'production',
  endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
});

// Metrics
initMetrics({
  serviceName: 'intelliflow-api',
  serviceVersion: '0.1.0',
  environment: 'production',
  endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
});
```

## Environment Configuration

### Required Environment Variables

```bash
# Service identification
SERVICE_NAME=intelliflow-api
SERVICE_VERSION=1.0.0
ENVIRONMENT=production

# OpenTelemetry endpoint
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317

# Optional: Logging
LOG_LEVEL=info

# Optional: Disable in tests
NODE_ENV=test  # Disables tracing/metrics automatically
```

### Local Development

```bash
# .env.local
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
ENVIRONMENT=development
LOG_LEVEL=debug
```

### Production (Railway/Vercel)

```bash
# Railway/Vercel environment variables
OTEL_EXPORTER_OTLP_ENDPOINT=http://<tailscale-ip>:4318  # HTTP for serverless
ENVIRONMENT=production
LOG_LEVEL=info
SERVICE_VERSION=$RAILWAY_GIT_COMMIT_SHA  # or Vercel equivalent
```

## Adding Tracing

### Automatic Instrumentation

The observability package automatically instruments:

- **HTTP/HTTPS** requests (incoming and outgoing)
- **Express.js** routes
- **PostgreSQL** (via `pg` driver)
- **Redis** operations
- **gRPC** calls

No code changes needed - just initialize tracing!

### Manual Spans

For custom operations, create manual spans:

```typescript
import { trace, SemanticAttributes } from '@intelliflow/observability';

async function processLead(leadId: string) {
  return trace('processLead', async (span) => {
    // Add attributes
    span.setAttribute(SemanticAttributes.LEAD_ID, leadId);
    span.setAttribute('lead.source', 'website');

    // Add events
    span.addEvent('lead.validation.started');

    // Your business logic
    const result = await validateLead(leadId);

    span.addEvent('lead.validation.completed', {
      valid: result.isValid,
    });

    return result;
  });
}
```

### Method Decorators

For class methods, use the `@Trace` decorator:

```typescript
import { Trace } from '@intelliflow/observability';

class LeadService {
  @Trace('LeadService.scoreLead')
  async scoreLead(leadId: string): Promise<number> {
    // Automatically traced
    const lead = await this.repository.findById(leadId);
    return this.scoreCalculator.calculate(lead);
  }
}
```

### Nested Spans

Spans automatically create parent-child relationships:

```typescript
async function createOpportunity(data: OpportunityData) {
  return trace('createOpportunity', async (span) => {
    span.setAttribute('opportunity.value', data.value);

    // This creates a child span
    const lead = await trace('fetchLead', async () => {
      return leadRepository.findById(data.leadId);
    });

    // This also creates a child span
    const account = await trace('fetchAccount', async () => {
      return accountRepository.findById(data.accountId);
    });

    return opportunityRepository.create({
      ...data,
      lead,
      account,
    });
  });
}
```

## Adding Metrics

### Pre-defined Business Metrics

The package includes ready-to-use metrics for CRM operations:

```typescript
import { metrics, incrementCounter, recordHistogram } from '@intelliflow/observability';

// Increment counters
incrementCounter(metrics.leadCreated, 1, { source: 'website' });
incrementCounter(metrics.leadScored, 1, { model: 'gpt-4' });

// Record histograms
recordHistogram(metrics.leadScore, 85, { model_version: 'v1' });
recordHistogram(metrics.apiRequestDuration, 120, {
  endpoint: '/api/leads',
  method: 'POST',
});
```

### Helper Functions

Use pre-configured helpers for common operations:

```typescript
import { metricHelpers } from '@intelliflow/observability';

// Record lead creation
metricHelpers.recordLeadCreated('website');

// Record lead scoring
metricHelpers.recordLeadScored(
  85,        // score
  0.92,      // confidence
  'v1.2.3'   // model version
);

// Record API request
metricHelpers.recordApiRequest(
  'POST',            // method
  '/api/leads',      // endpoint
  125,               // duration (ms)
  201                // status code
);

// Record database query
metricHelpers.recordDatabaseQuery(
  'INSERT',          // operation
  'leads',           // table
  45                 // duration (ms)
);

// Record AI inference
metricHelpers.recordAiInference(
  'gpt-4',           // model
  1500,              // latency (ms)
  0.003,             // cost ($)
  0.92               // confidence (optional)
);
```

### Method Decorators

Measure execution time automatically:

```typescript
import { MeasureTime, metrics } from '@intelliflow/observability';

class LeadService {
  @MeasureTime(metrics.apiRequestDuration)
  async processLead(leadId: string): Promise<void> {
    // Execution time automatically recorded
  }
}
```

### Custom Metrics

Create custom metrics if needed:

```typescript
import { getMeter } from '@intelliflow/observability';

const meter = getMeter();

const customCounter = meter.createCounter('intelliflow.custom.events', {
  description: 'Custom business events',
  unit: '1',
});

customCounter.add(1, { eventType: 'user_action' });
```

## Adding Structured Logging

### Basic Logging

```typescript
import { logger } from '@intelliflow/observability';

// Simple messages
logger.info('User logged in');
logger.warn('Rate limit approaching');
logger.error('Database connection failed');

// With context
logger.info({ userId: '123', action: 'login' }, 'User logged in');
logger.error({ err: error, leadId: '456' }, 'Failed to process lead');
```

### Request-Scoped Logging

Create child loggers with request context:

```typescript
import { createRequestLogger } from '@intelliflow/observability';

// In your Express middleware
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || generateId();
  req.logger = createRequestLogger(requestId, {
    userId: req.user?.id,
    ip: req.ip,
  });
  next();
});

// Use in route handlers
app.post('/api/leads', async (req, res) => {
  req.logger.info('Creating lead');
  // All logs from this request include requestId, userId, ip
});
```

### Domain Event Logging

Log domain events with context:

```typescript
import { logDomainEvent } from '@intelliflow/observability';

logDomainEvent('LeadScored', {
  leadId: '123',
  score: 85,
  model: 'gpt-4',
}, {
  userId: currentUserId,
});
```

### Specialized Logging Functions

```typescript
import {
  logApiRequest,
  logDatabaseQuery,
  logAiOperation,
  logSecurityEvent,
} from '@intelliflow/observability';

// API requests
logApiRequest('POST', '/api/leads', 201, 125);

// Database queries
logDatabaseQuery('INSERT', 'leads', 45, { leadId: '123' });

// AI operations
logAiOperation('gpt-4', 'lead-scoring', 1500, 0.003, { leadId: '123' });

// Security events
logSecurityEvent(
  'unauthorized_access_attempt',
  'high',
  { ip: '1.2.3.4', endpoint: '/admin' }
);
```

### Performance Logging Decorator

```typescript
import { LogPerformance } from '@intelliflow/observability';

class LeadService {
  @LogPerformance('LeadService.processLead')
  async processLead(leadId: string): Promise<void> {
    // Logs execution time automatically
    // Logs errors with stack traces
  }
}
```

### Sensitive Data Redaction

```typescript
import { redactSensitiveData } from '@intelliflow/observability';

const userData = {
  email: 'user@example.com',
  password: 'secret123',
  apiKey: 'key_abc123',
};

const safe = redactSensitiveData(userData);
// { email: 'user@example.com', password: '[REDACTED]', apiKey: '[REDACTED]' }

logger.info(safe, 'User data');
```

## Trace-Log-Metric Correlation

### Automatic Correlation

All three signals are automatically correlated:

1. **Trace ID** is automatically included in logs via mixin
2. **Span ID** is automatically included in logs via mixin
3. **Metrics** can be filtered by trace attributes

```typescript
import { trace, logger, metrics } from '@intelliflow/observability';

await trace('processLead', async (span) => {
  const traceId = span.spanContext().traceId;

  // This log automatically includes traceId and spanId
  logger.info({ leadId: '123' }, 'Processing lead');

  // Metrics also tagged with trace context
  incrementCounter(metrics.leadScored, 1, { leadId: '123' });
});
```

### Correlation IDs

Generate and propagate correlation IDs:

```typescript
import { createRequestLogger, trace } from '@intelliflow/observability';

// In middleware
const correlationId = req.headers['x-correlation-id'] || generateId();
req.logger = createRequestLogger(correlationId);

// In business logic
await trace('operation', async (span) => {
  span.setAttribute('correlation.id', correlationId);
  req.logger.info('Operation started');
});
```

### Querying Correlated Data

In Grafana, you can jump between signals:

1. **Trace → Logs**: Click "Logs for this span" in Tempo
2. **Logs → Trace**: Click trace ID in Loki to open in Tempo
3. **Metrics → Traces**: Create metric-to-trace exemplars

## Error Handling

### Recording Exceptions

```typescript
import { trace, recordException, logger } from '@intelliflow/observability';

await trace('operation', async (span) => {
  try {
    await riskyOperation();
  } catch (error) {
    // Record in span
    recordException(error);

    // Log with context
    logger.error({ err: error }, 'Operation failed');

    // Rethrow or handle
    throw error;
  }
});
```

### Automatic Error Recording

The `trace()` function automatically records exceptions:

```typescript
await trace('operation', async (span) => {
  // If this throws, it's automatically recorded in the span
  await riskyOperation();
});
```

## Best Practices

### 1. Initialize Early

Call `initObservability()` BEFORE any other imports:

```typescript
// ✅ Good
import { initObservability } from '@intelliflow/observability';
initObservability({ serviceName: 'my-service' });

import express from 'express';
// ... rest of app

// ❌ Bad
import express from 'express';
import { initObservability } from '@intelliflow/observability';
initObservability({ serviceName: 'my-service' });
```

### 2. Use Semantic Attributes

Use the provided semantic conventions:

```typescript
import { SemanticAttributes } from '@intelliflow/observability';

span.setAttribute(SemanticAttributes.LEAD_ID, leadId);
span.setAttribute(SemanticAttributes.AI_MODEL, 'gpt-4');
span.setAttribute(SemanticAttributes.DB_OPERATION, 'INSERT');
```

### 3. Add Business Context

Include business-relevant attributes:

```typescript
span.setAttribute('lead.score', 85);
span.setAttribute('lead.source', 'website');
span.setAttribute('opportunity.value', 50000);
span.setAttribute('ai.confidence', 0.92);
```

### 4. Minimize Cardinality

Avoid high-cardinality attributes (like IDs) in metric labels:

```typescript
// ✅ Good - low cardinality
incrementCounter(metrics.leadCreated, 1, { source: 'website' });

// ❌ Bad - high cardinality (unique per lead)
incrementCounter(metrics.leadCreated, 1, { leadId: '12345' });
```

### 5. Use Helpers

Prefer pre-built helpers over manual instrumentation:

```typescript
// ✅ Good
metricHelpers.recordLeadCreated('website');

// ❌ Verbose
incrementCounter(metrics.leadCreated, 1, { source: 'website' });
```

### 6. Graceful Shutdown

Ensure telemetry is flushed on shutdown:

```typescript
import { shutdownObservability } from '@intelliflow/observability';

process.on('SIGTERM', async () => {
  await shutdownObservability();
  process.exit(0);
});
```

## Testing

### Disable in Tests

Observability is automatically disabled when `NODE_ENV=test`:

```bash
NODE_ENV=test npm test
```

### Explicit Control

```typescript
initObservability({
  serviceName: 'my-service',
  tracingEnabled: process.env.NODE_ENV !== 'test',
  metricsEnabled: process.env.NODE_ENV !== 'test',
});
```

### Mock for Unit Tests

```typescript
import { vi } from 'vitest';

vi.mock('@intelliflow/observability', () => ({
  trace: vi.fn((name, fn) => fn({
    setAttribute: vi.fn(),
    addEvent: vi.fn(),
  })),
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
  metrics: {},
}));
```

## Troubleshooting

### No Data in Grafana

1. Check OTel Collector logs: `docker logs otel-collector`
2. Verify endpoint: `echo $OTEL_EXPORTER_OTLP_ENDPOINT`
3. Test connectivity: `curl http://localhost:4317`
4. Check service initialization logs for "✅ OpenTelemetry..."

### Missing Correlation

1. Ensure logging mixin is working (check log output for traceId)
2. Verify tracing was initialized before logging
3. Check that operations are wrapped in `trace()` calls

### High Memory Usage

1. Reduce batch size in OTel Collector config
2. Increase export interval
3. Add memory limiter processor
4. Sample traces in production (reduce sample rate)

### Performance Impact

OpenTelemetry has minimal overhead (<5% in most cases):

- Automatic instrumentation: ~2-3% CPU
- Manual spans: ~1-2% CPU
- Metrics: <1% CPU
- Logging: ~1-2% CPU

Optimize if needed:

```typescript
// Sample traces (only 10%)
initTracing({
  serviceName: 'my-service',
  sampleRate: 0.1,
});

// Reduce log level
initLogger({
  name: 'my-service',
  level: 'warn',  // instead of 'debug'
});
```

## Examples

See working examples in:

- `apps/api/src/server.ts` - API server initialization
- `apps/ai-worker/src/index.ts` - AI worker initialization
- `packages/application/src/use-cases/` - Business logic tracing
- `packages/adapters/src/repositories/` - Database tracing

## Next Steps

1. Read the [Instrumentation Checklist](./instrumentation-checklist.md)
2. Review [Correlation Patterns](./correlation-patterns.md)
3. Check service-specific examples in the codebase
4. Set up Grafana dashboards using provided templates

## Support

For issues or questions:

1. Check existing runbooks in `docs/operations/runbooks/`
2. Review OTel Collector logs
3. Consult OpenTelemetry documentation: https://opentelemetry.io/docs/
