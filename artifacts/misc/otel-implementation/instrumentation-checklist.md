# Service Instrumentation Checklist

This checklist ensures comprehensive observability coverage when adding OpenTelemetry instrumentation to a new or existing service in IntelliFlow CRM.

## Pre-Instrumentation

### [ ] 1. Dependencies Installed

```bash
# Verify @intelliflow/observability is in package.json
pnpm add @intelliflow/observability
```

### [ ] 2. Environment Variables Set

```bash
# .env or deployment config
SERVICE_NAME=intelliflow-<service-name>
SERVICE_VERSION=<version>
ENVIRONMENT=<dev|staging|production>
OTEL_EXPORTER_OTLP_ENDPOINT=<collector-url>
LOG_LEVEL=<trace|debug|info|warn|error>
```

### [ ] 3. Service Name Convention

Follow naming convention: `intelliflow-<component>`

Examples:
- `intelliflow-api` - Main tRPC API
- `intelliflow-web` - Next.js frontend
- `intelliflow-ai-worker` - AI processing worker
- `intelliflow-email-worker` - Email queue worker

## Initialization

### [ ] 4. Import Observability Package

```typescript
import { initObservability } from '@intelliflow/observability';
```

### [ ] 5. Initialize Before Other Imports

```typescript
// ✅ Correct order
import { initObservability } from '@intelliflow/observability';

initObservability({
  serviceName: process.env.SERVICE_NAME || 'intelliflow-api',
  serviceVersion: process.env.SERVICE_VERSION || '0.1.0',
  environment: process.env.ENVIRONMENT || 'development',
});

// Now import other modules
import express from 'express';
import { prisma } from '@intelliflow/db';
```

### [ ] 6. Graceful Shutdown Handler

```typescript
import { shutdownObservability } from '@intelliflow/observability';

process.on('SIGTERM', async () => {
  await shutdownObservability();
  process.exit(0);
});
```

## Tracing Implementation

### [ ] 7. HTTP/API Routes Traced

Verify automatic instrumentation is working:

```typescript
// Express routes are auto-instrumented
app.get('/api/leads', async (req, res) => {
  // This is automatically traced
});
```

Test: Make a request and verify span appears in Tempo.

### [ ] 8. Database Queries Traced

Prisma and pg are auto-instrumented:

```typescript
// Automatically traced
const lead = await prisma.lead.findUnique({ where: { id: leadId } });
```

Test: Run a query and verify database span appears.

### [ ] 9. External API Calls Traced

HTTP calls are auto-instrumented:

```typescript
// Automatically traced
const response = await fetch('https://api.external.com/data');
```

Test: Make an external call and verify outbound span.

### [ ] 10. Business Operations Manually Traced

Wrap important business logic:

```typescript
import { trace } from '@intelliflow/observability';

export async function scoreLead(leadId: string): Promise<number> {
  return trace('scoreLead', async (span) => {
    span.setAttribute('lead.id', leadId);

    // Business logic here
    const score = await calculateScore(leadId);

    span.setAttribute('lead.score', score);
    return score;
  });
}
```

### [ ] 11. AI/LLM Operations Traced

```typescript
import { trace, SemanticAttributes } from '@intelliflow/observability';

async function generateResponse(prompt: string): Promise<string> {
  return trace('ai.generate', async (span) => {
    span.setAttribute(SemanticAttributes.AI_MODEL, 'gpt-4');
    span.setAttribute('ai.prompt.tokens', countTokens(prompt));

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    });

    span.setAttribute('ai.response.tokens', response.usage?.total_tokens);
    span.setAttribute('ai.cost', calculateCost(response.usage));

    return response.choices[0].message.content;
  });
}
```

### [ ] 12. Background Jobs Traced

```typescript
import { trace } from '@intelliflow/observability';

async function processEmailQueue(): Promise<void> {
  return trace('emailQueue.process', async (span) => {
    const jobs = await queue.getJobs();
    span.setAttribute('queue.size', jobs.length);

    for (const job of jobs) {
      await trace('emailQueue.processJob', async (jobSpan) => {
        jobSpan.setAttribute('job.id', job.id);
        await processEmailJob(job);
      });
    }
  });
}
```

### [ ] 13. Class Methods Use Decorators

```typescript
import { Trace } from '@intelliflow/observability';

export class LeadService {
  @Trace('LeadService.create')
  async create(data: CreateLeadDto): Promise<Lead> {
    // Automatically traced
  }

  @Trace('LeadService.score')
  async score(leadId: string): Promise<number> {
    // Automatically traced
  }
}
```

### [ ] 14. Error Handling Includes Exception Recording

```typescript
import { trace, recordException } from '@intelliflow/observability';

await trace('operation', async (span) => {
  try {
    await riskyOperation();
  } catch (error) {
    recordException(error);
    throw error; // Re-throw after recording
  }
});
```

## Metrics Implementation

### [ ] 15. Business Metrics Recorded

```typescript
import { metricHelpers } from '@intelliflow/observability';

// Record lead creation
metricHelpers.recordLeadCreated('website');

// Record lead scoring
metricHelpers.recordLeadScored(85, 0.92, 'v1.0.0');
```

### [ ] 16. API Performance Metrics

```typescript
import { metricHelpers } from '@intelliflow/observability';

app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    metricHelpers.recordApiRequest(
      req.method,
      req.route?.path || req.path,
      duration,
      res.statusCode
    );
  });

  next();
});
```

### [ ] 17. Database Performance Metrics

```typescript
import { metricHelpers } from '@intelliflow/observability';

const start = Date.now();
const result = await prisma.lead.create({ data });
const duration = Date.now() - start;

metricHelpers.recordDatabaseQuery('INSERT', 'lead', duration);
```

### [ ] 18. Cache Metrics

```typescript
import { metricHelpers } from '@intelliflow/observability';

const cached = await redis.get(key);
metricHelpers.recordCacheAccess(cached !== null);
```

### [ ] 19. AI/LLM Cost and Performance Metrics

```typescript
import { metricHelpers } from '@intelliflow/observability';

const start = Date.now();
const response = await openai.chat.completions.create({ ... });
const latency = Date.now() - start;
const cost = calculateCost(response.usage);

metricHelpers.recordAiInference('gpt-4', latency, cost, 0.92);
```

### [ ] 20. Custom Business Metrics (if needed)

```typescript
import { getMeter } from '@intelliflow/observability';

const meter = getMeter();
const opportunitiesWon = meter.createCounter('intelliflow.opportunities.won', {
  description: 'Number of opportunities won',
  unit: '1',
});

opportunitiesWon.add(1, { value_bucket: '10k-50k' });
```

## Logging Implementation

### [ ] 21. Structured Logging Used

```typescript
import { logger } from '@intelliflow/observability';

// ✅ Structured
logger.info({ userId: '123', action: 'login' }, 'User logged in');

// ❌ Unstructured
console.log('User 123 logged in');
```

### [ ] 22. Request-Scoped Logger for HTTP

```typescript
import { createRequestLogger } from '@intelliflow/observability';

app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || generateUuid();
  req.logger = createRequestLogger(requestId, {
    userId: req.user?.id,
    ip: req.ip,
  });
  next();
});
```

### [ ] 23. Domain Events Logged

```typescript
import { logDomainEvent } from '@intelliflow/observability';

logDomainEvent('LeadScored', {
  leadId: lead.id,
  score: 85,
  model: 'gpt-4',
});
```

### [ ] 24. Security Events Logged

```typescript
import { logSecurityEvent } from '@intelliflow/observability';

logSecurityEvent(
  'unauthorized_access',
  'high',
  { ip: req.ip, endpoint: req.path }
);
```

### [ ] 25. Performance Logging for Slow Operations

```typescript
import { LogPerformance } from '@intelliflow/observability';

class ReportService {
  @LogPerformance('ReportService.generateReport')
  async generateReport(type: string): Promise<Report> {
    // Logs execution time automatically
  }
}
```

### [ ] 26. Sensitive Data Redacted

```typescript
import { redactSensitiveData, logger } from '@intelliflow/observability';

const userData = {
  email: user.email,
  password: user.password, // Will be redacted
  apiKey: user.apiKey,     // Will be redacted
};

logger.info(redactSensitiveData(userData), 'User created');
```

## Correlation

### [ ] 27. Logs Include Trace Context

Verify log output contains `traceId` and `spanId`:

```json
{
  "level": "info",
  "msg": "Processing lead",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "spanId": "00f067aa0ba902b7"
}
```

### [ ] 28. Correlation IDs Propagated

```typescript
// In API gateway/middleware
const correlationId = req.headers['x-correlation-id'] || generateUuid();

// Pass to downstream services
await fetch('http://ai-worker/score', {
  headers: {
    'x-correlation-id': correlationId,
  },
});
```

### [ ] 29. Trace Context Propagated in Workers

```typescript
import { traceContext } from '@intelliflow/observability';

// In queue producer
const activeContext = traceContext.active();
await queue.add({
  data: jobData,
  traceContext: activeContext, // Propagate context
});

// In queue consumer
traceContext.with(job.data.traceContext, () => {
  // Process with parent trace context
});
```

## Testing & Validation

### [ ] 30. Local Testing Completed

```bash
# Start OTel stack
docker-compose -f infra/docker/docker-compose.monitoring.yml up -d

# Run service
pnpm dev

# Generate test traffic
curl http://localhost:3000/api/leads

# Verify in Grafana
open http://localhost:3001
```

### [ ] 31. Traces Visible in Tempo

- Navigate to Grafana → Explore → Tempo
- Query traces for your service
- Verify spans appear with correct attributes

### [ ] 32. Metrics Visible in Prometheus

- Navigate to Grafana → Explore → Prometheus
- Query: `{service_name="intelliflow-<service>"}`
- Verify metrics are being collected

### [ ] 33. Logs Visible in Loki

- Navigate to Grafana → Explore → Loki
- Query: `{service="intelliflow-<service>"}`
- Verify logs contain traceId and spanId

### [ ] 34. Correlation Works

- Find a trace in Tempo
- Click "Logs for this span"
- Verify logs from Loki appear
- Click trace ID in logs → jumps back to Tempo

### [ ] 35. Performance Acceptable

- Check service latency before/after instrumentation
- Target: <5% overhead
- If higher, reduce sampling or instrumentation

### [ ] 36. Tests Pass

```bash
# Unit tests should pass with observability disabled
NODE_ENV=test pnpm test

# Integration tests
pnpm test:integration
```

## Production Readiness

### [ ] 37. Environment Variables Set in Deployment

Railway/Vercel:
```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://<tailscale-ip>:4318
ENVIRONMENT=production
LOG_LEVEL=info
SERVICE_VERSION=$GIT_COMMIT_SHA
```

### [ ] 38. Sampling Configured (if high traffic)

```typescript
initTracing({
  serviceName: 'intelliflow-api',
  sampleRate: 0.1, // 10% sampling for high-traffic services
});
```

### [ ] 39. Dashboards Created

- Create Grafana dashboard for service
- Include: Request rate, latency, error rate, business metrics
- Save to `infra/monitoring/dashboards/`

### [ ] 40. Alerts Configured

Add alerts for:
- High error rate (>5%)
- High latency (p95 >200ms)
- Business metric anomalies

### [ ] 41. Runbook Created

Create runbook in `docs/operations/runbooks/`:
- Service overview
- Key metrics to monitor
- Common issues and solutions
- Escalation path

### [ ] 42. Documentation Updated

- Update service README with observability info
- Add examples to implementation guide
- Document custom metrics/attributes

## Sign-Off

### Service Information

- **Service Name**: _______________________
- **Owner**: _______________________
- **Date Instrumented**: _______________________

### Verification

- [ ] All checklist items completed
- [ ] Tested in local environment
- [ ] Verified in staging environment
- [ ] Production deployment successful
- [ ] Monitoring confirmed working

### Approvals

- **Developer**: _______________________ Date: _______
- **SRE Review**: _______________________ Date: _______
- **Tech Lead**: _______________________ Date: _______

## Notes

Use this space for service-specific notes, custom instrumentation, or known issues:

---

## Quick Reference

### Common Imports

```typescript
// Tracing
import { trace, Trace, SemanticAttributes } from '@intelliflow/observability';

// Metrics
import { metrics, metricHelpers, incrementCounter } from '@intelliflow/observability';

// Logging
import { logger, createRequestLogger, logDomainEvent } from '@intelliflow/observability';
```

### Environment Variables

```bash
SERVICE_NAME=intelliflow-<service>
SERVICE_VERSION=<version>
ENVIRONMENT=<dev|staging|production>
OTEL_EXPORTER_OTLP_ENDPOINT=<url>
LOG_LEVEL=<level>
```

### Test URLs

- Grafana: http://localhost:3001
- Prometheus: http://localhost:9090
- OTel Collector: http://localhost:4317 (gRPC), http://localhost:4318 (HTTP)

### Support

- Implementation Guide: `artifacts/misc/otel-implementation/implementation-guide.md`
- Correlation Patterns: `artifacts/misc/otel-implementation/correlation-patterns.md`
- Runbooks: `docs/operations/runbooks/`
