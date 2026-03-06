/**
 * PrismaOutboxRepository
 *
 * Prisma-based implementation of the OutboxRepository interface
 * for the transactional outbox pattern.
 *
 * Uses FOR UPDATE SKIP LOCKED for concurrent access safety.
 *
 * @task IFC-150
 * @phase Phase 2 GREEN - Step 2.2
 */

import { PrismaClient, EventStatus, Prisma } from '@intelliflow/db';

/**
 * Outbox event status
 */
export type OutboxEventStatus = 'pending' | 'published' | 'failed' | 'dead_letter';

/**
 * Outbox event interface
 */
export interface OutboxEvent {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  metadata: {
    correlationId: string;
    causationId?: string;
    userId?: string;
    tenantId?: string;
    timestamp: string;
    version: string;
  };
  status: OutboxEventStatus;
  retryCount: number;
  nextRetryAt?: Date;
  lastError?: string;
  createdAt: Date;
  publishedAt?: Date;
}

/**
 * Outbox repository interface
 */
export interface OutboxRepository {
  /** Fetch pending events with lock */
  fetchPendingEvents(limit: number): Promise<OutboxEvent[]>;
  /** Mark event as published */
  markAsPublished(eventId: string): Promise<void>;
  /** Mark event as failed and schedule retry */
  scheduleRetry(
    eventId: string,
    retryCount: number,
    nextRetryAt: Date,
    error: string
  ): Promise<void>;
  /** Move event to dead letter queue */
  moveToDeadLetter(eventId: string, error: string): Promise<void>;
  /** Get event by ID */
  getEventById(eventId: string): Promise<OutboxEvent | null>;
}

/**
 * Maps Prisma EventStatus to OutboxEventStatus
 */
function mapPrismaStatus(status: EventStatus): OutboxEventStatus {
  const mapping: Record<EventStatus, OutboxEventStatus> = {
    PENDING: 'pending',
    PROCESSING: 'pending', // Treat PROCESSING as pending for retry purposes
    PROCESSED: 'published',
    FAILED: 'failed',
    DEAD_LETTER: 'dead_letter',
    ARCHIVED: 'published', // Archived events are treated as published/completed
  };
  return mapping[status];
}

/**
 * Maps a Prisma DomainEvent to OutboxEvent interface
 */
function mapToOutboxEvent(event: {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
  status: EventStatus;
  retryCount: number;
  nextRetryAt: Date | null;
  lastError: string | null;
  occurredAt: Date;
  publishedAt: Date | null;
}): OutboxEvent {
  const metadata = (event.metadata as Record<string, unknown>) ?? {};

  return {
    id: event.id,
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payload: (event.payload as Record<string, unknown>) ?? {},
    metadata: {
      correlationId: (metadata.correlationId as string) ?? '',
      causationId: metadata.causationId as string | undefined,
      userId: metadata.userId as string | undefined,
      tenantId: metadata.tenantId as string | undefined,
      timestamp: (metadata.timestamp as string) ?? event.occurredAt.toISOString(),
      version: (metadata.version as string) ?? '1.0',
    },
    status: mapPrismaStatus(event.status),
    retryCount: event.retryCount,
    nextRetryAt: event.nextRetryAt ?? undefined,
    lastError: event.lastError ?? undefined,
    createdAt: event.occurredAt,
    publishedAt: event.publishedAt ?? undefined,
  };
}

export class PrismaOutboxRepository implements OutboxRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Fetch pending events that are ready to be processed.
   *
   * Uses raw SQL with FOR UPDATE SKIP LOCKED to prevent
   * concurrent pollers from processing the same event.
   */
  async fetchPendingEvents(limit: number): Promise<OutboxEvent[]> {
    const now = new Date();

    // Use raw query with FOR UPDATE SKIP LOCKED for concurrent access safety
    // Note: This syntax works with PostgreSQL. For other databases, adjust accordingly.
    const events = await this.prisma.$queryRaw<
      Array<{
        id: string;
        eventType: string;
        aggregateType: string;
        aggregateId: string;
        payload: Prisma.JsonValue;
        metadata: Prisma.JsonValue;
        status: EventStatus;
        retryCount: number;
        nextRetryAt: Date | null;
        lastError: string | null;
        occurredAt: Date;
        publishedAt: Date | null;
      }>
    >`
      SELECT
        id,
        "eventType",
        "aggregateType",
        "aggregateId",
        payload,
        metadata,
        status,
        "retryCount",
        "nextRetryAt",
        "lastError",
        "occurredAt",
        "publishedAt"
      FROM domain_events
      WHERE status = 'PENDING'
        AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= ${now})
      ORDER BY "occurredAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;

    return events.map(mapToOutboxEvent);
  }

  /**
   * Mark an event as successfully published.
   */
  async markAsPublished(eventId: string): Promise<void> {
    const now = new Date();

    await this.prisma.domainEvent.update({
      where: { id: eventId },
      data: {
        status: EventStatus.PROCESSED,
        publishedAt: now,
        processedAt: now,
      },
    });
  }

  /**
   * Schedule a retry for a failed event.
   *
   * The event remains in PENDING status but with an updated
   * retryCount and nextRetryAt timestamp.
   */
  async scheduleRetry(
    eventId: string,
    retryCount: number,
    nextRetryAt: Date,
    error: string
  ): Promise<void> {
    await this.prisma.domainEvent.update({
      where: { id: eventId },
      data: {
        status: EventStatus.PENDING,
        retryCount,
        nextRetryAt,
        lastError: error,
      },
    });
  }

  /**
   * Move an event to the dead letter queue after exhausting retries.
   */
  async moveToDeadLetter(eventId: string, error: string): Promise<void> {
    await this.prisma.domainEvent.update({
      where: { id: eventId },
      data: {
        status: EventStatus.DEAD_LETTER,
        lastError: error,
      },
    });
  }

  /**
   * Get a single event by ID.
   */
  async getEventById(eventId: string): Promise<OutboxEvent | null> {
    const event = await this.prisma.domainEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return null;
    }

    return mapToOutboxEvent(event);
  }

  /**
   * Create a new event in the outbox.
   *
   * This is used by OutboxEventBusAdapter.publish().
   */
  async createEvent(data: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
    tenantId: string;
  }): Promise<OutboxEvent> {
    const event = await this.prisma.domainEvent.create({
      data: {
        eventType: data.eventType,
        aggregateType: data.aggregateType,
        aggregateId: data.aggregateId,
        payload: data.payload as Prisma.InputJsonValue,
        metadata: data.metadata as Prisma.InputJsonValue,
        tenantId: data.tenantId,
        status: EventStatus.PENDING,
        retryCount: 0,
      },
    });

    return mapToOutboxEvent(event);
  }

  /**
   * Check if an event with the given idempotency key already exists.
   */
  async existsByIdempotencyKey(idempotencyKey: string): Promise<boolean> {
    const event = await this.prisma.domainEvent.findFirst({
      where: {
        metadata: {
          path: ['idempotencyKey'],
          equals: idempotencyKey,
        },
      },
      select: { id: true },
    });

    return event !== null;
  }

  /**
   * Get statistics about the outbox.
   */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    processed: number;
    failed: number;
    deadLetter: number;
  }> {
    const counts = await this.prisma.domainEvent.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const stats = {
      pending: 0,
      processing: 0,
      processed: 0,
      failed: 0,
      deadLetter: 0,
    };

    for (const item of counts) {
      switch (item.status) {
        case EventStatus.PENDING:
          stats.pending = item._count.status;
          break;
        case EventStatus.PROCESSING:
          stats.processing = item._count.status;
          break;
        case EventStatus.PROCESSED:
          stats.processed = item._count.status;
          break;
        case EventStatus.FAILED:
          stats.failed = item._count.status;
          break;
        case EventStatus.DEAD_LETTER:
          stats.deadLetter = item._count.status;
          break;
      }
    }

    return stats;
  }
}
