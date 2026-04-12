# Trace-Log-Metric Correlation Patterns

## Overview

This document describes how traces, logs, and metrics are correlated in IntelliFlow CRM's observability stack. Proper correlation enables:

- **Root Cause Analysis**: Jump from metric spike → trace → logs in <2 minutes (MTTD target)
- **End-to-End Visibility**: Follow a request across all microservices
- **Context Preservation**: Maintain business context throughout the stack

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Application Code                       │
│                                                              │
│  ┌─────────┐      ┌─────────┐      ┌─────────┐             │
│  │ Traces  │◄────►│  Logs   │◄────►│ Metrics │             │
│  └─────────┘      └─────────┘      └─────────┘             │
│       │                 │                 │                  │
└───────┼─────────────────┼─────────────────┼──────────────────┘
        │                 │                 │
        │    Correlation  │                 │
        │    via IDs      │                 │
        ▼                 ▼                 ▼
┌──────────────────────────────────────────────────────────────┐
│               OpenTelemetry Collector                        │
│  ┌──────────┐   ┌──────────┐   ┌────────────┐              │
│  │ Trace ID │   │ Span ID  │   │ Resource   │              │
│  │ Span ID  │   │ Trace ID │   │ Attributes │              │
│  │ Attrs    │   │ Attrs    │   │ Labels     │              │
│  └──────────┘   └──────────┘   └────────────┘              │
└──────────────────────────────────────────────────────────────┘
        │                 │                 │
        ▼                 ▼                 ▼
┌──────────┐      ┌──────────┐      ┌──────────┐
│  Tempo   │      │   Loki   │      │Prometheus│
│ (Traces) │      │  (Logs)  │      │(Metrics) │
└──────────┘      └──────────┘      └──────────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          ▼
                    ┌──────────┐
                    │ Grafana  │
                    │ (Unified │
                    │   View)  │
                    └──────────┘
```

## Correlation Methods

### 1. Trace ID Correlation (Primary)

**How it works**: Every span has a `trace_id` that groups related operations. Logs automatically include this ID via the Pino mixin.

**Implementation**:

```typescript
import { trace, logger } from '@intelliflow/observability';

await trace('processLead', async (span) => {
  const traceId = span.spanContext().traceId;

  // Log automatically includes traceId via mixin
  logger.info({ leadId: '123' }, 'Processing lead');
  // Output: { "traceId": "4bf92f3577b34da6a3ce929d0e0e4736", "leadId": "123", ... }
});
```

**Benefits**:
- Automatic correlation between traces and logs
- No manual ID propagation needed
- Works across service boundaries

**Usage**:
1. Find slow trace in Tempo
2. Copy trace ID
3. Query Loki: `{traceId="4bf92f3577b34da6a3ce929d0e0e4736"}`
4. See all logs for that request

### 2. Span ID Correlation (Fine-Grained)

**How it works**: Each operation within a trace has a unique `span_id`. Logs include the active span ID.

**Implementation**:

```typescript
await trace('processLead', async (parentSpan) => {
  logger.info('Starting lead processing'); // spanId = parentSpan.id

  await trace('validateLead', async (childSpan) => {
    logger.info('Validating lead'); // spanId = childSpan.id
  });

  await trace('scoreLead', async (childSpan) => {
    logger.info('Scoring lead'); // spanId = childSpan.id
  });
});
```

**Benefits**:
- Pinpoint exact operation that logged a message
- Useful for debugging nested operations

**Usage**:
1. Find specific span in trace
2. Copy span ID
3. Query Loki: `{spanId="00f067aa0ba902b7"}`
4. See logs from that specific operation

### 3. Correlation ID Propagation (Cross-Service)

**How it works**: A `correlation_id` is generated at the API gateway and propagated through all services.

**Implementation**:

```typescript
// In API gateway
import { createRequestLogger } from '@intelliflow/observability';

app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || generateUuid();

  // Attach logger with correlation ID
  req.logger = createRequestLogger(correlationId, {
    userId: req.user?.id,
  });

  // Propagate to downstream services
  res.setHeader('x-correlation-id', correlationId);

  next();
});

// In downstream service
import { trace } from '@intelliflow/observability';

async function scoreLeadHandler(req: Request) {
  const correlationId = req.headers['x-correlation-id'];

  await trace('scoreLead', async (span) => {
    span.setAttribute('correlation.id', correlationId);

    // All logs/traces now share correlation ID
  });
}
```

**Benefits**:
- Track requests across multiple services
- Business-friendly ID (can share with customers)
- Works even if trace context is lost

**Usage**:
1. Get correlation ID from user/logs
2. Query across all services:
   - Tempo: `{correlation.id="abc-123"}`
   - Loki: `{correlationId="abc-123"}`

### 4. Resource Attributes (Service-Level)

**How it works**: All telemetry includes resource attributes identifying the service.

**Implementation**:

```typescript
initObservability({
  serviceName: 'intelliflow-api',
  serviceVersion: '1.0.0',
  environment: 'production',
});

// Automatically added to all traces, logs, metrics:
// {
//   "service.name": "intelliflow-api",
//   "service.version": "1.0.0",
//   "deployment.environment": "production",
//   "service.namespace": "intelliflow"
// }
```

**Benefits**:
- Filter telemetry by service
- Track multi-service deployments
- Aggregate metrics by environment

**Usage**:
- Prometheus: `{service_name="intelliflow-api"}`
- Loki: `{service="intelliflow-api"}`
- Tempo: Filter by service in UI

### 5. Business Context Attributes (Domain-Level)

**How it works**: Propagate business entities (leadId, userId, etc.) through the stack.

**Implementation**:

```typescript
import { trace, logger, SemanticAttributes } from '@intelliflow/observability';

await trace('processLead', async (span) => {
  // Add to span
  span.setAttribute(SemanticAttributes.LEAD_ID, leadId);
  span.setAttribute(SemanticAttributes.USER_ID, userId);

  // Add to logs
  logger.info({ leadId, userId }, 'Processing lead');

  // Add to metrics (but avoid high cardinality!)
  // ❌ Don't: metricHelpers.recordLeadCreated({ leadId });
  // ✅ Do:   metricHelpers.recordLeadCreated('website');
});
```

**Benefits**:
- Filter telemetry by business entity
- Debug specific customer issues
- Track entity lifecycle

**Usage**:
1. Get lead ID from support ticket
2. Query all telemetry:
   - Tempo: `{lead.id="lead_123"}`
   - Loki: `{leadId="lead_123"}`
3. See entire lead processing history

### 6. Metric-to-Trace Exemplars

**How it works**: Metrics can link to example traces that contributed to them.

**Implementation**:

```typescript
import { trace, metrics, incrementCounter } from '@intelliflow/observability';

await trace('apiRequest', async (span) => {
  const traceId = span.spanContext().traceId;

  // Record metric with exemplar
  incrementCounter(metrics.apiRequestCount, 1, {
    endpoint: '/api/leads',
    method: 'POST',
    // Exemplar automatically added by OTel SDK
  });
});
```

**Benefits**:
- Jump from metric spike to example trace
- Understand what caused metric change

**Usage**:
1. See metric spike in Grafana
2. Click "Exemplars" button
3. Opens example trace in Tempo
4. Investigate root cause

## Correlation Scenarios

### Scenario 1: Debug Slow API Request

**Problem**: API endpoint is slow (p95 > 200ms)

**Steps**:
1. **Find metric spike**:
   - Grafana → Prometheus
   - Query: `histogram_quantile(0.95, rate(intelliflow_api_request_duration_bucket[5m]))`
   - See spike at 10:30 AM

2. **Find slow traces**:
   - Grafana → Tempo
   - Query: `{service.name="intelliflow-api"} && duration > 200ms`
   - Filter by timestamp: 10:25-10:35
   - Find slow trace: `trace_id=abc123`

3. **Examine trace**:
   - See spans: API → DB → AI Worker
   - AI Worker span took 180ms (culprit!)
   - Span attributes show: `ai.model=gpt-4`, `lead.id=lead_456`

4. **Check logs**:
   - Grafana → Loki
   - Query: `{traceId="abc123"}`
   - Find logs: "AI model timeout", "Retrying with backoff"

5. **Root cause**: AI model timeout, retry added latency

### Scenario 2: Track User Journey

**Problem**: User reports "lead creation failed"

**Steps**:
1. **Get correlation ID**:
   - Ask user for request ID or check support logs
   - Correlation ID: `corr_xyz789`

2. **Find traces**:
   - Tempo: `{correlation.id="corr_xyz789"}`
   - See trace: API → Lead Service → Email Worker
   - Email Worker span shows error

3. **Check logs**:
   - Loki: `{correlationId="corr_xyz789"}`
   - Find error: "SMTP connection refused"

4. **Check metrics**:
   - Prometheus: `intelliflow_email_error_count{correlationId="corr_xyz789"}`
   - See spike in email errors at same time

5. **Root cause**: Email service outage, lead created but welcome email failed

### Scenario 3: Monitor AI Costs

**Problem**: AI inference costs spiking

**Steps**:
1. **Check metric**:
   - Prometheus: `sum(rate(intelliflow_ai_inference_cost[1h]))`
   - See $5/hour (normally $2/hour)

2. **Find expensive traces**:
   - Tempo: `{service.name="intelliflow-ai-worker"} && ai.cost > 0.01`
   - Find traces with high cost

3. **Analyze patterns**:
   - Group by `ai.model`: Most expensive calls use `gpt-4`
   - Group by operation: `lead-scoring` using gpt-4 instead of gpt-3.5

4. **Check logs**:
   - Loki: `{service="intelliflow-ai-worker"} |= "gpt-4"`
   - Find: "Model upgraded to gpt-4 for high-value leads"

5. **Root cause**: New feature upgraded model for some leads, increasing cost

### Scenario 4: Debug Cross-Service Issue

**Problem**: Opportunities not being created after lead conversion

**Steps**:
1. **Find traces**:
   - Tempo: `{service.name="intelliflow-api"} && name="convertLead"`
   - See trace: API → Lead Service → Opportunity Service
   - Opportunity Service span shows success, but no opportunity created

2. **Check logs with trace ID**:
   - Loki: `{traceId="def456"}`
   - Lead Service: "Lead converted successfully"
   - Opportunity Service: "Validation failed: missing account_id"

3. **Check span attributes**:
   - Lead Service span: `lead.id=lead_123`, `account.id=null`
   - Opportunity Service span: `validation.error="account_id required"`

4. **Root cause**: Lead converted without account association

## Best Practices

### 1. Consistent Naming

Use consistent attribute names across the stack:

```typescript
// ✅ Good - consistent naming
span.setAttribute('lead.id', leadId);
logger.info({ leadId }, 'Processing lead');
metrics.leadCreated.add(1, { source: 'website' });

// ❌ Bad - inconsistent naming
span.setAttribute('lead_id', leadId);
logger.info({ lead: leadId }, 'Processing lead');
metrics.leadCreated.add(1, { leadSource: 'website' });
```

### 2. Propagate Context

Always propagate trace context to async operations:

```typescript
import { traceContext, trace } from '@intelliflow/observability';

// In producer
const activeContext = traceContext.active();
await queue.add({
  data: jobData,
  traceContext: activeContext,
});

// In consumer
await trace('processJob', async (span) => {
  // Span is child of original trace
}, { parent: job.data.traceContext });
```

### 3. Add Business Context Early

Add important attributes at the root span:

```typescript
await trace('processLead', async (span) => {
  // Add at the top
  span.setAttribute('lead.id', leadId);
  span.setAttribute('user.id', userId);
  span.setAttribute('source', 'website');

  // Now all child spans inherit context
  await validateLead(leadId);
  await scoreLead(leadId);
  await notifyUser(userId);
});
```

### 4. Use Semantic Attributes

Use predefined semantic conventions:

```typescript
import { SemanticAttributes } from '@intelliflow/observability';

span.setAttribute(SemanticAttributes.LEAD_ID, leadId);
span.setAttribute(SemanticAttributes.AI_MODEL, 'gpt-4');
span.setAttribute(SemanticAttributes.DB_OPERATION, 'INSERT');
```

### 5. Avoid High-Cardinality in Metrics

Don't use unique IDs in metric labels:

```typescript
// ❌ Bad - high cardinality
metrics.apiRequest.add(1, { leadId: 'lead_123' }); // Millions of labels

// ✅ Good - low cardinality
metrics.apiRequest.add(1, { endpoint: '/api/leads', method: 'POST' });
```

### 6. Log Level Appropriately

Use appropriate log levels for correlation:

```typescript
// INFO - normal operations
logger.info({ leadId }, 'Lead created');

// WARN - recoverable errors
logger.warn({ leadId, err }, 'AI scoring timeout, using default');

// ERROR - failures requiring attention
logger.error({ leadId, err }, 'Failed to create lead');
```

## Grafana Queries

### Find Traces with High Latency

```promql
# Tempo
{service.name="intelliflow-api"} && duration > 200ms
```

### Find Logs for a Trace

```logql
# Loki
{traceId="4bf92f3577b34da6a3ce929d0e0e4736"}
```

### Find Traces for a Lead

```promql
# Tempo
{lead.id="lead_123"}
```

### Metric with Exemplars

```promql
# Prometheus
rate(intelliflow_api_request_duration_sum[5m])
```

Click "Exemplars" → Opens trace in Tempo

### Multi-Service Trace

```logql
# Loki (all services for correlation ID)
{correlationId="corr_abc123"}
```

## Troubleshooting

### Trace ID Missing from Logs

**Symptom**: Logs don't have `traceId` field

**Causes**:
1. Tracing not initialized
2. Logging initialized before tracing
3. Code not wrapped in `trace()` call

**Solution**:

```typescript
// ✅ Correct order
initTracing({ ... });
initLogger({ ... });

// Use trace wrapper
await trace('operation', async (span) => {
  logger.info('Message'); // Now has traceId
});
```

### Correlation ID Lost Across Services

**Symptom**: Correlation ID not propagating to downstream services

**Solution**:

```typescript
// Propagate in HTTP headers
await fetch('http://downstream-service/api', {
  headers: {
    'x-correlation-id': correlationId,
  },
});

// Extract in downstream service
const correlationId = req.headers['x-correlation-id'];
span.setAttribute('correlation.id', correlationId);
```

### Exemplars Not Showing

**Symptom**: Can't click from metric to trace

**Causes**:
1. Prometheus not configured for exemplars
2. Metric cardinality too high
3. No traces sampled

**Solution**:
- Enable remote write in Prometheus
- Reduce metric cardinality
- Increase trace sampling rate

## Tools & Commands

### Verify Correlation Locally

```bash
# Start services
docker-compose -f infra/docker/docker-compose.monitoring.yml up -d

# Make request
curl -H "x-correlation-id: test-123" http://localhost:3000/api/leads

# Check trace
# Grafana → Tempo → {correlation.id="test-123"}

# Check logs
# Grafana → Loki → {correlationId="test-123"}
```

### Generate Test Data

```bash
# In scripts/ directory
node generate-test-traffic.js --requests 100 --correlation-id test-456
```

### Query from CLI

```bash
# Query Loki
logcli query '{traceId="abc123"}' --addr=http://localhost:3100

# Query Prometheus
curl 'http://localhost:9090/api/v1/query?query=intelliflow_api_request_count'
```

## References

- OpenTelemetry Semantic Conventions: https://opentelemetry.io/docs/specs/semconv/
- W3C Trace Context: https://www.w3.org/TR/trace-context/
- Grafana Correlation: https://grafana.com/docs/grafana/latest/explore/correlations/
