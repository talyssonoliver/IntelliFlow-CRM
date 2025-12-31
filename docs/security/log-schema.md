# Structured Log Schema

IntelliFlow CRM uses structured logging (JSON format) throughout all services to enable efficient aggregation, filtering, and analysis via Loki and the observability stack.

## Log Record Fields

### Core Fields (Required)

These fields MUST be present in every log record:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `timestamp` | ISO 8601 | Log event time in UTC | `2025-12-29T15:30:45.123Z` |
| `level` | string | Log level | `info`, `warn`, `error`, `debug`, `trace` |
| `service` | string | Service name | `intelliflow-api`, `intelliflow-web`, `ai-worker` |
| `trace_id` | string | Distributed trace identifier (W3C format) | `4bf92f3577b34da6a3ce929d0e0e4736` |
| `span_id` | string | Current span identifier | `00f067aa0ba902b7` |
| `message` | string | Human-readable message | `User created successfully` |

### Context Fields (Recommended)

These fields provide additional context for correlation and filtering:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `correlation_id` | string | Business correlation ID | `order-123`, `lead-456` |
| `user_id` | string | User identifier (redacted if sensitive) | `user-789` |
| `request_id` | string | HTTP request ID | `req-123456` |
| `environment` | string | Deployment environment | `development`, `staging`, `production` |
| `version` | string | Service version | `1.2.3` |

### Performance Fields (For performance logs)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `duration_ms` | number | Operation duration | `145` |
| `http.status_code` | number | HTTP response code | `200`, `404` |
| `http.method` | string | HTTP method | `GET`, `POST` |
| `http.url` | string | Request URL (PII-safe) | `/api/leads` |
| `db.query_time_ms` | number | Database query duration | `23` |

### Business Context Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `entity_type` | string | Business entity type | `lead`, `contact`, `opportunity` |
| `entity_id` | string | Entity identifier | `lead-123` |
| `action` | string | Business action | `create`, `update`, `delete`, `score` |

### Error Fields (For error logs)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `error.type` | string | Error class/type | `ValidationError`, `DatabaseError` |
| `error.message` | string | Error message | `Invalid email format` |
| `error.stack` | string | Stack trace (debug mode only) | `at leadService.create (...)` |
| `error.code` | string | Error code | `LEAD_VALIDATION_FAILED` |

### Security Fields (For security-relevant logs)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `security.event` | string | Security event type | `auth_success`, `auth_failure`, `rate_limit` |
| `security.risk_level` | string | Risk level | `low`, `medium`, `high` |
| `security.action_taken` | string | Action taken | `blocked`, `logged`, `escalated` |

## Log Levels and Usage

### INFO
- User actions (create, update, delete)
- Service startup/shutdown
- Significant state changes
- Business events

### WARN
- Deprecated API usage
- Recoverable errors
- Rate limit approaching
- Configuration issues

### ERROR
- Failed operations
- Exceptions with stack traces
- API errors
- Data validation failures

### DEBUG
- Function entry/exit
- Variable values
- Detailed operation steps
- Only enabled in development

### TRACE
- Low-level system details
- Verbose performance data
- Only enabled for diagnostics

## Log Aggregation Pipeline

All logs are automatically processed through this pipeline:

1. **Collection** - Services emit structured logs to stdout/stderr
2. **Shipping** - OpenTelemetry exporter sends to Loki via HTTP
3. **Indexing** - Loki indexes by service, level, trace_id
4. **Storage** - Local retention: 7 days, archival to S3
5. **Querying** - Grafana dashboards use LogQL to query
6. **Alerting** - Alert rules monitor error rates and latencies

## Example Log Records

### Successful API Request
```json
{
  "timestamp": "2025-12-29T15:30:45.123Z",
  "level": "info",
  "service": "intelliflow-api",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "message": "API request completed",
  "request_id": "req-123456",
  "user_id": "user-789",
  "http.method": "POST",
  "http.url": "/api/leads",
  "http.status_code": 201,
  "duration_ms": 145,
  "entity_type": "lead",
  "entity_id": "lead-123",
  "action": "create"
}
```

### AI Scoring Operation
```json
{
  "timestamp": "2025-12-29T15:30:46.456Z",
  "level": "info",
  "service": "ai-worker",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4737",
  "span_id": "00f067aa0ba902b8",
  "message": "Lead scoring completed",
  "correlation_id": "lead-123",
  "entity_type": "lead",
  "entity_id": "lead-123",
  "action": "score",
  "duration_ms": 1250,
  "ai.model": "lead-scoring-v2",
  "ai.confidence": 0.92,
  "ai.score": 78
}
```

### Error with Context
```json
{
  "timestamp": "2025-12-29T15:30:47.789Z",
  "level": "error",
  "service": "intelliflow-api",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4738",
  "span_id": "00f067aa0ba902b9",
  "message": "Lead creation failed",
  "request_id": "req-123457",
  "user_id": "user-790",
  "entity_type": "lead",
  "action": "create",
  "error.type": "ValidationError",
  "error.code": "INVALID_EMAIL",
  "error.message": "Email format is invalid",
  "duration_ms": 42
}
```

## Security and Privacy

### PII Redaction

All Personally Identifiable Information (PII) is redacted before logging:

- Email addresses: Replaced with hash
- Phone numbers: Last 4 digits only
- API keys/tokens: Replaced with `***`
- Credit cards: Replaced with `****-****-****-XXXX`

### Sensitive Field Filtering

These fields are automatically removed by the collector:
- `http.request.header.authorization`
- `http.request.header.cookie`
- `http.request.header.x-api-key`

### Access Control

Log access is controlled via:
- Role-based access (Grafana RBAC)
- Service mesh mTLS (all services authenticated)
- Audit trails (who queried what logs when)

## Performance Expectations

- **Log Emission**: <1ms per record
- **Collection**: <100ms end-to-end
- **Loki Query**: <500ms p95 for typical queries
- **Retention**: 7 days hot, 90 days archive
- **Disk Storage**: ~500MB/day per service

## Monitoring Log Health

Key metrics to watch:

- **Error Rate** - Should be <0.1% in production
- **Log Volume** - Alert if >50K logs/min from single service
- **Processing Latency** - Alert if >1000ms p95 to Loki
- **Storage Growth** - Alert if >1GB/day growth

## Integration Examples

### Node.js/Next.js
```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-opentelemetry',
  },
});

logger.info({
  message: 'Request processed',
  trace_id: context.traceId,
  span_id: context.spanId,
  user_id: req.userId,
  duration_ms: Date.now() - startTime,
});
```

### Python (if used)
```python
import logging
from opentelemetry import trace

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)

with tracer.start_as_current_span("operation"):
    logger.info("Operation started", extra={
        'trace_id': span.get_span_context().trace_id,
        'user_id': user_id,
    })
```
