# ADR-011: Domain Events Infrastructure

**Status:** Accepted

**Date:** 2025-12-29

**Deciders:** STOA-Domain, Tech Lead, Backend Team

**Technical Story:** IFC-150 - Domain Events Infrastructure: event contracts,
versioning, outbox pattern, idempotent publishing

## Context and Problem Statement

IntelliFlow CRM requires a robust event-driven architecture to support loose
coupling between bounded contexts, enable audit logging (ADR-008), support
workflow automation, and enable real-time notifications. We need to implement
domain events with reliable publishing, schema versioning, and idempotent
consumption. How should we design the domain events infrastructure to ensure
zero lost events while maintaining high performance?

## Decision Drivers

- **Reliability**: Zero lost events even during failures
- **Performance**: Publish latency p95 <200ms
- **Schema Safety**: 100% events schema-validated
- **Idempotency**: At-least-once delivery with safe re-consumption
- **Versioning**: Schema evolution without breaking consumers
- **Auditability**: All events support compliance logging (ADR-008)
- **Loose Coupling**: Bounded contexts communicate via events only
- **Developer Experience**: Clear contracts, easy to add new events

## Considered Options

- **Option 1**: Direct event publishing (synchronous)
- **Option 2**: Message queue only (RabbitMQ/Kafka)
- **Option 3**: Transactional Outbox Pattern
- **Option 4**: Event Sourcing (full CQRS)
- **Option 5**: Hybrid Outbox + Message Queue

## Decision Outcome

Chosen option: **"Transactional Outbox Pattern with Message Queue"** (Option 5),
because it provides reliable event publishing with zero lost events, supports
high throughput, and integrates well with our existing PostgreSQL database and
future message queue infrastructure.

### Positive Consequences

- **Zero Lost Events**: Events stored atomically with domain state changes
- **Consistent State**: No "dual write" problem between DB and message broker
- **High Performance**: Async polling doesn't block request path
- **Schema Validation**: All events validated before publishing
- **Idempotent Consumption**: Deduplication via event ID + idempotency key
- **Easy Debugging**: Events stored in database for inspection
- **Gradual Adoption**: Works without external message queue initially

### Negative Consequences

- **Additional Complexity**: Outbox table + polling mechanism required
- **Latency**: Slight delay (polling interval) before event delivery
- **Storage**: Outbox table grows, requires periodic cleanup
- **Ordering**: Cross-aggregate ordering not guaranteed

## Implementation Architecture

### Component Overview

```
+-------------------+     +-------------------+     +-------------------+
|   Domain Entity   |     |   Outbox Table    |     |  Event Handlers   |
|   (Aggregate)     |     |   (PostgreSQL)    |     |                   |
+--------+----------+     +--------+----------+     +--------+----------+
         |                         |                         |
         | 1. Emit Event           |                         |
         +------------------------>|                         |
         |                         | 2. Poll & Publish       |
         |                         +------------------------>|
         |                         |                         |
         |                         | 3. Mark Processed       |
         |                         |<------------------------+
         +                         +                         +
```

### Outbox Table Schema

```sql
CREATE TABLE domain_event_outbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Event identification
  event_id UUID NOT NULL UNIQUE,
  event_type VARCHAR(255) NOT NULL,
  event_version VARCHAR(10) NOT NULL DEFAULT 'v1',

  -- Aggregate information
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id UUID NOT NULL,
  tenant_id UUID NOT NULL,

  -- Event payload
  payload JSONB NOT NULL,
  metadata JSONB,

  -- Idempotency
  idempotency_key VARCHAR(500) NOT NULL,

  -- Processing state
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  -- pending, processing, published, failed, dead_letter

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,

  -- Retry handling
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,

  -- Ordering
  sequence_number BIGSERIAL
);

-- Indexes for efficient polling
CREATE INDEX idx_outbox_pending ON domain_event_outbox(status, created_at)
  WHERE status = 'pending';
CREATE INDEX idx_outbox_retry ON domain_event_outbox(status, next_retry_at)
  WHERE status = 'failed';
CREATE INDEX idx_outbox_aggregate ON domain_event_outbox(aggregate_type, aggregate_id);
CREATE INDEX idx_outbox_idempotency ON domain_event_outbox(idempotency_key);

-- Constraint for idempotency within 24 hours
CREATE UNIQUE INDEX idx_outbox_idempotency_unique
  ON domain_event_outbox(idempotency_key, tenant_id)
  WHERE created_at > NOW() - INTERVAL '24 hours';
```

### Domain Event Base Class

```typescript
// packages/domain/src/events/domain-event.ts
import { v4 as uuidv4 } from 'uuid';

export abstract class DomainEvent {
  public readonly id: string;
  public readonly occurredAt: Date;
  public readonly version: string = 'v1';

  constructor() {
    this.id = uuidv4();
    this.occurredAt = new Date();
  }

  abstract get eventType(): string;
  abstract get aggregateType(): string;
  abstract get aggregateId(): string;
  abstract get idempotencyKey(): string;
  abstract toPayload(): Record<string, unknown>;

  toOutboxEntry(tenantId: string): OutboxEntry {
    return {
      event_id: this.id,
      event_type: this.eventType,
      event_version: this.version,
      aggregate_type: this.aggregateType,
      aggregate_id: this.aggregateId,
      tenant_id: tenantId,
      payload: this.toPayload(),
      idempotency_key: this.idempotencyKey,
      status: 'pending',
      created_at: this.occurredAt,
    };
  }
}
```

### Example Domain Event

```typescript
// packages/domain/src/events/lead-events.ts
import { DomainEvent } from './domain-event';

export interface LeadCreatedPayload {
  leadId: string;
  email: string;
  source: string;
  tenantId: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  createdAt: string;
}

export class LeadCreatedEvent extends DomainEvent {
  constructor(
    private readonly leadId: string,
    private readonly payload: Omit<LeadCreatedPayload, 'leadId' | 'createdAt'>
  ) {
    super();
  }

  get eventType(): string {
    return 'LeadCreated';
  }

  get aggregateType(): string {
    return 'Lead';
  }

  get aggregateId(): string {
    return this.leadId;
  }

  get idempotencyKey(): string {
    return `LeadCreated:${this.leadId}`;
  }

  toPayload(): LeadCreatedPayload {
    return {
      leadId: this.leadId,
      ...this.payload,
      createdAt: this.occurredAt.toISOString(),
    };
  }
}
```

### Event Publisher (Outbox Writer)

```typescript
// packages/application/src/events/event-publisher.ts
import { DomainEvent } from '@intelliflow/domain';

export interface EventPublisher {
  /**
   * Publish events within a transaction.
   * Events are written to outbox table, not sent directly.
   */
  publish(events: DomainEvent[], tenantId: string): Promise<void>;

  /**
   * Publish a single event.
   */
  publishOne(event: DomainEvent, tenantId: string): Promise<void>;
}

// packages/adapters/src/events/prisma-event-publisher.ts
import { PrismaClient } from '@prisma/client';
import { EventPublisher } from '@intelliflow/application';
import { DomainEvent } from '@intelliflow/domain';
import { validateEventSchema } from './schema-validator';

export class PrismaEventPublisher implements EventPublisher {
  constructor(private readonly prisma: PrismaClient) {}

  async publish(events: DomainEvent[], tenantId: string): Promise<void> {
    const startTime = Date.now();

    // Validate all events against their schemas
    for (const event of events) {
      const validation = await validateEventSchema(event);
      if (!validation.valid) {
        throw new EventSchemaValidationError(
          event.eventType,
          validation.errors
        );
      }
    }

    // Write to outbox within transaction
    const entries = events.map(e => e.toOutboxEntry(tenantId));

    await this.prisma.domainEventOutbox.createMany({
      data: entries,
      skipDuplicates: true, // Idempotency
    });

    const latency = Date.now() - startTime;
    publishLatencyHistogram.observe(latency);
  }

  async publishOne(event: DomainEvent, tenantId: string): Promise<void> {
    return this.publish([event], tenantId);
  }
}
```

### Outbox Poller (Event Dispatcher)

```typescript
// packages/adapters/src/events/outbox-poller.ts
import { PrismaClient } from '@prisma/client';

export class OutboxPoller {
  private isRunning = false;
  private readonly pollIntervalMs = 100;
  private readonly batchSize = 100;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly handlers: Map<string, EventHandler[]>
  ) {}

  async start(): Promise<void> {
    this.isRunning = true;
    await this.pollLoop();
  }

  stop(): void {
    this.isRunning = false;
  }

  private async pollLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.processBatch();
      } catch (error) {
        console.error('Outbox polling error:', error);
      }
      await this.sleep(this.pollIntervalMs);
    }
  }

  private async processBatch(): Promise<void> {
    // Claim pending events (optimistic locking)
    const events = await this.prisma.$transaction(async (tx) => {
      const pending = await tx.domainEventOutbox.findMany({
        where: {
          status: 'pending',
        },
        orderBy: { sequence_number: 'asc' },
        take: this.batchSize,
      });

      if (pending.length === 0) return [];

      // Mark as processing
      await tx.domainEventOutbox.updateMany({
        where: {
          id: { in: pending.map(e => e.id) },
          status: 'pending',
        },
        data: { status: 'processing' },
      });

      return pending;
    });

    // Process each event
    for (const event of events) {
      await this.processEvent(event);
    }
  }

  private async processEvent(outboxEntry: OutboxEntry): Promise<void> {
    const handlers = this.handlers.get(outboxEntry.event_type) ?? [];

    try {
      // Execute all handlers
      await Promise.all(
        handlers.map(h => h.handle(outboxEntry.payload, {
          eventId: outboxEntry.event_id,
          eventType: outboxEntry.event_type,
          tenantId: outboxEntry.tenant_id,
          occurredAt: outboxEntry.created_at,
        }))
      );

      // Mark as published
      await this.prisma.domainEventOutbox.update({
        where: { id: outboxEntry.id },
        data: {
          status: 'published',
          processed_at: new Date(),
        },
      });

      publishedEventsCounter.inc({ event_type: outboxEntry.event_type });

    } catch (error) {
      await this.handleError(outboxEntry, error);
    }
  }

  private async handleError(
    outboxEntry: OutboxEntry,
    error: Error
  ): Promise<void> {
    const retryCount = outboxEntry.retry_count + 1;
    const maxRetries = 3;

    if (retryCount >= maxRetries) {
      // Move to dead letter
      await this.prisma.domainEventOutbox.update({
        where: { id: outboxEntry.id },
        data: {
          status: 'dead_letter',
          retry_count: retryCount,
          last_error: error.message,
        },
      });

      deadLetterCounter.inc({ event_type: outboxEntry.event_type });

    } else {
      // Schedule retry with exponential backoff
      const backoffMs = [1000, 5000, 30000][retryCount - 1] ?? 30000;

      await this.prisma.domainEventOutbox.update({
        where: { id: outboxEntry.id },
        data: {
          status: 'failed',
          retry_count: retryCount,
          next_retry_at: new Date(Date.now() + backoffMs),
          last_error: error.message,
        },
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Idempotent Event Handler

```typescript
// packages/application/src/events/idempotent-handler.ts
export abstract class IdempotentEventHandler implements EventHandler {
  constructor(
    private readonly processedCache: ProcessedEventCache
  ) {}

  async handle(
    payload: unknown,
    context: EventContext
  ): Promise<void> {
    const idempotencyKey = `${context.eventType}:${context.eventId}`;

    // Check if already processed
    if (await this.processedCache.has(idempotencyKey)) {
      console.log(`Skipping duplicate event: ${idempotencyKey}`);
      return;
    }

    // Process event
    await this.handleEvent(payload, context);

    // Mark as processed (24h TTL)
    await this.processedCache.set(idempotencyKey, true, 86400);
  }

  protected abstract handleEvent(
    payload: unknown,
    context: EventContext
  ): Promise<void>;
}
```

### Schema Validator

```typescript
// packages/adapters/src/events/schema-validator.ts
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFile } from 'fs/promises';
import { load } from 'js-yaml';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

let contractsCache: EventContracts | null = null;

export async function loadEventContracts(): Promise<EventContracts> {
  if (contractsCache) return contractsCache;

  const yamlContent = await readFile(
    'docs/events/contracts-v1.yaml',
    'utf-8'
  );
  contractsCache = load(yamlContent) as EventContracts;
  return contractsCache;
}

export async function validateEventSchema(
  event: DomainEvent
): Promise<ValidationResult> {
  const contracts = await loadEventContracts();
  const eventDef = contracts.events[event.eventType];

  if (!eventDef) {
    return {
      valid: false,
      errors: [`Unknown event type: ${event.eventType}`],
    };
  }

  // Check version compatibility
  if (event.version !== eventDef.version) {
    return {
      valid: false,
      errors: [
        `Version mismatch: event=${event.version}, contract=${eventDef.version}`
      ],
    };
  }

  // Validate payload against JSON Schema
  const validate = ajv.compile(eventDef.schema);
  const payload = event.toPayload();
  const valid = validate(payload);

  if (!valid) {
    return {
      valid: false,
      errors: validate.errors?.map(e => `${e.instancePath}: ${e.message}`) ?? [],
    };
  }

  schemaValidationCounter.inc({
    event_type: event.eventType,
    result: 'valid',
  });

  return { valid: true, errors: [] };
}
```

## KPIs and Monitoring

### Target KPIs

| KPI | Target | Measurement |
|-----|--------|-------------|
| Lost Events | 0 | Count of events not reaching outbox |
| Publish Latency | p95 <200ms | Time from event creation to outbox write |
| Schema Validation | 100% | All events validated before publish |
| Dead Letter Rate | <0.1% | Failed events after max retries |
| Processing Latency | p95 <500ms | Time from outbox to handler completion |

### Prometheus Metrics

```typescript
// packages/adapters/src/events/metrics.ts
import { Counter, Histogram } from 'prom-client';

export const publishLatencyHistogram = new Histogram({
  name: 'domain_events_publish_latency_ms',
  help: 'Time to write events to outbox',
  buckets: [10, 25, 50, 100, 200, 500, 1000],
});

export const publishedEventsCounter = new Counter({
  name: 'domain_events_published_total',
  help: 'Total published domain events',
  labelNames: ['event_type'],
});

export const deadLetterCounter = new Counter({
  name: 'domain_events_dead_letter_total',
  help: 'Events moved to dead letter queue',
  labelNames: ['event_type'],
});

export const schemaValidationCounter = new Counter({
  name: 'domain_events_schema_validation_total',
  help: 'Schema validation results',
  labelNames: ['event_type', 'result'],
});
```

## Event Versioning Strategy

### Backward Compatible Changes (no version bump)

- Adding optional fields
- Widening numeric constraints (e.g., min: 0 to min: -100)
- Adding new enum values at the end

### Breaking Changes (require version bump)

- Removing fields
- Changing field types
- Adding required fields
- Renaming fields
- Changing field semantics

### Version Deprecation Process

1. Announce deprecation (90-day grace period)
2. Update consumers to handle both versions
3. Stop publishing old version
4. Remove old version handling after grace period

## Testing Strategy

### Unit Tests

```typescript
describe('LeadCreatedEvent', () => {
  it('generates correct idempotency key', () => {
    const event = new LeadCreatedEvent('lead-123', { email: 'test@example.com', source: 'web', tenantId: 'tenant-1' });
    expect(event.idempotencyKey).toBe('LeadCreated:lead-123');
  });

  it('validates against schema', async () => {
    const event = new LeadCreatedEvent('lead-123', { email: 'test@example.com', source: 'web', tenantId: 'tenant-1' });
    const result = await validateEventSchema(event);
    expect(result.valid).toBe(true);
  });
});
```

### Integration Tests

```typescript
describe('OutboxPoller', () => {
  it('processes pending events', async () => {
    // Insert test event
    await prisma.domainEventOutbox.create({
      data: testEvent,
    });

    // Run poller once
    await poller.processBatch();

    // Verify processed
    const updated = await prisma.domainEventOutbox.findUnique({
      where: { id: testEvent.id },
    });
    expect(updated?.status).toBe('published');
  });

  it('retries failed events with backoff', async () => {
    // Test retry logic
  });

  it('moves to dead letter after max retries', async () => {
    // Test DLQ
  });
});
```

## Validation Criteria

- [x] Event contracts catalog created (`docs/events/contracts-v1.yaml`)
- [x] Outbox table schema defined
- [x] Event publisher with schema validation
- [x] Outbox poller with retry logic
- [x] Idempotent handler base class
- [x] Prometheus metrics defined
- [x] KPIs documented (0 lost, p95 <200ms, 100% validated)
- [ ] Integration tests passing
- [ ] Dead letter queue alerting configured
- [ ] Documentation updated

## Rollback Plan

If the outbox pattern proves too complex:

1. Simplify to direct synchronous event publishing
2. Add basic retry logic in application layer
3. Accept potential event loss during failures
4. Migrate to external message queue (RabbitMQ/Kafka) for reliability

## Related Decisions

- [ADR-008: Audit Logging](../planning/adr/ADR-008-audit-logging.md) - Uses
  domain events for audit trail
- [ADR-010: Architecture Boundary Enforcement](../planning/adr/ADR-010-architecture-boundary-enforcement.md) -
  Defines layer dependencies

## References

- [Transactional Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)
- [Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)
- [Schema Registry](https://docs.confluent.io/platform/current/schema-registry/index.html)
- [IFC-150 Sprint Plan Task](../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv)
- [Event Contracts Catalog](../events/contracts-v1.yaml)
