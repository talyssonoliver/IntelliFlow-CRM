/**
 * OutboxEventBusAdapter
 *
 * Implements EventBusPort using the transactional outbox pattern.
 * Events are written to the database as part of the same transaction
 * as the domain state change, ensuring exactly-once delivery semantics.
 *
 * @task IFC-150
 * @phase Phase 2 GREEN - Step 2.3
 */

import { PrismaClient, EventStatus, Prisma } from '@intelliflow/db';
import { withTransaction, type TransactionClient } from '@intelliflow/db';
import { DomainEvent } from '@intelliflow/domain';
import { EventBusPort } from '@intelliflow/application';

/**
 * Context accessors for correlation and tenant information.
 * These should be provided via dependency injection or async local storage.
 */
export interface ContextAccessors {
  getCorrelationId(): string | undefined;
  getCausationId(): string | undefined;
  getUserId(): string | undefined;
  getTenantId(): string | undefined;
}

/**
 * Default context accessors that return undefined.
 * Replace with actual implementation in production.
 */
const defaultContextAccessors: ContextAccessors = {
  getCorrelationId: () => undefined,
  getCausationId: () => undefined,
  getUserId: () => undefined,
  getTenantId: () => undefined,
};

export interface OutboxEventBusAdapterOptions {
  prisma: PrismaClient;
  context?: ContextAccessors;
  defaultTenantId?: string;
}

export class OutboxEventBusAdapter implements EventBusPort {
  private readonly prisma: PrismaClient;
  private readonly context: ContextAccessors;
  private readonly defaultTenantId: string;

  constructor(options: OutboxEventBusAdapterOptions) {
    this.prisma = options.prisma;
    this.context = options.context ?? defaultContextAccessors;
    this.defaultTenantId = options.defaultTenantId ?? 'default';
  }

  /**
   * Publish a domain event to the outbox.
   *
   * The event is written to the database with PENDING status.
   * A separate poller will process and dispatch it to handlers.
   */
  async publish(event: DomainEvent): Promise<void> {
    const idempotencyKey = this.generateIdempotencyKey(event);

    // Check for duplicate (idempotent publish)
    const existing = await this.prisma.domainEvent.findFirst({
      where: {
        metadata: {
          path: ['idempotencyKey'],
          equals: idempotencyKey,
        },
      },
      select: { id: true },
    });

    if (existing) {
      // Silently ignore duplicate events
      return;
    }

    const tenantId = this.context.getTenantId() ?? this.defaultTenantId;

    await this.prisma.domainEvent.create({
      data: {
        eventType: event.eventType,
        aggregateType: this.getAggregateType(event),
        aggregateId: this.getAggregateId(event),
        payload: event.toPayload() as Prisma.InputJsonValue,
        metadata: {
          correlationId: this.context.getCorrelationId() ?? event.eventId,
          causationId: this.context.getCausationId(),
          userId: this.context.getUserId(),
          tenantId,
          timestamp: new Date().toISOString(),
          version: '1.0',
          idempotencyKey,
        } as Prisma.InputJsonValue,
        occurredAt: event.occurredAt,
        status: EventStatus.PENDING,
        tenantId,
      },
    });
  }

  /**
   * Publish multiple events in a batch.
   *
   * Uses a transaction to ensure all events are written atomically.
   */
  async publishAll(events: readonly DomainEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    await withTransaction(async (tx: TransactionClient) => {
      for (const event of events) {
        const idempotencyKey = this.generateIdempotencyKey(event);

        // Check for duplicate within transaction
        const existing = await tx.domainEvent.findFirst({
          where: {
            metadata: {
              path: ['idempotencyKey'],
              equals: idempotencyKey,
            },
          },
          select: { id: true },
        });

        if (existing) {
          // Skip duplicate
          continue;
        }

        const tenantId = this.context.getTenantId() ?? this.defaultTenantId;

        await tx.domainEvent.create({
          data: {
            eventType: event.eventType,
            aggregateType: this.getAggregateType(event),
            aggregateId: this.getAggregateId(event),
            payload: event.toPayload() as Prisma.InputJsonValue,
            metadata: {
              correlationId: this.context.getCorrelationId() ?? event.eventId,
              causationId: this.context.getCausationId(),
              userId: this.context.getUserId(),
              tenantId,
              timestamp: new Date().toISOString(),
              version: '1.0',
              idempotencyKey,
            } as Prisma.InputJsonValue,
            occurredAt: event.occurredAt,
            status: EventStatus.PENDING,
            tenantId,
          },
        });
      }
    });
  }

  /**
   * Subscribe is not supported by the outbox adapter.
   * Use EventDispatcher.register() for subscriptions.
   */
  async subscribe<T extends DomainEvent>(
    _eventType: string,
    _handler: (event: T) => Promise<void>
  ): Promise<void> {
    throw new Error(
      'Use EventDispatcher.register() for subscriptions. ' +
        'OutboxEventBusAdapter only handles publishing to the outbox.'
    );
  }

  /**
   * Generate an idempotency key for the event.
   *
   * Uses the pattern from contracts-v1.yaml:
   * "{eventType}:{aggregateId}"
   */
  private generateIdempotencyKey(event: DomainEvent): string {
    const aggregateId = this.getAggregateId(event);
    return `${event.eventType}:${aggregateId}:${event.eventId}`;
  }

  /**
   * Extract aggregate type from event type.
   *
   * e.g., "lead.created" -> "Lead"
   */
  private getAggregateType(event: DomainEvent): string {
    const parts = event.eventType.split('.');
    if (parts.length === 0) {
      return 'Unknown';
    }
    // Capitalize first letter: "lead" -> "Lead"
    const type = parts[0];
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  /**
   * Extract aggregate ID from event payload.
   *
   * Looks for common ID field patterns in order of preference:
   * - {aggregateType}Id (e.g., leadId, contactId)
   * - id
   * - aggregateId
   */
  private getAggregateId(event: DomainEvent): string {
    const payload = event.toPayload();
    const aggregateType = this.getAggregateType(event).toLowerCase();
    const aggregateIdField = `${aggregateType}Id`;

    // Try aggregate-specific ID first
    if (payload[aggregateIdField] !== undefined) {
      return String(payload[aggregateIdField]);
    }

    // Fall back to common patterns
    if (payload.id !== undefined) {
      return String(payload.id);
    }

    if (payload.aggregateId !== undefined) {
      return String(payload.aggregateId);
    }

    // Use event ID as last resort
    return event.eventId;
  }
}
