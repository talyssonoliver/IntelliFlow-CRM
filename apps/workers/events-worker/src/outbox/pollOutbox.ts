/**
 * Outbox Poller
 *
 * Polls the transactional outbox table for pending domain events
 * and dispatches them to handlers.
 *
 * Pattern from: docs/events/contracts-v1.yaml
 * - Poll interval: 100ms
 * - Batch size: 100
 * - Retry backoff: [1s, 5s, 30s] (from dlq-triage.md)
 *
 * @module events-worker/outbox
 * @task IFC-163
 * @artifact apps/workers/events-worker/src/outbox/pollOutbox.ts
 */

import pino from 'pino';
import type { EventDispatcher, OutboxEvent } from './event-dispatcher';

// ============================================================================
// Types
// ============================================================================

export interface OutboxPollerConfig {
  /** Polling interval in milliseconds (default: 100) */
  pollIntervalMs: number;
  /** Maximum events to fetch per poll (default: 100) */
  batchSize: number;
  /** Lock timeout for events being processed (default: 30000) */
  lockTimeoutMs: number;
  /** Retry backoff delays in milliseconds (default: [1000, 5000, 30000]) */
  retryBackoff: [number, number, number];
  /** Maximum retry attempts before moving to DLQ (default: 3) */
  maxRetries: number;
}

export interface OutboxRepository {
  /** Fetch pending events with lock */
  fetchPendingEvents(limit: number): Promise<OutboxEvent[]>;
  /** Mark event as published */
  markAsPublished(eventId: string): Promise<void>;
  /** Mark event as failed and schedule retry */
  scheduleRetry(eventId: string, retryCount: number, nextRetryAt: Date, error: string): Promise<void>;
  /** Move event to dead letter queue */
  moveToDeadLetter(eventId: string, error: string): Promise<void>;
  /** Get event by ID */
  getEventById(eventId: string): Promise<OutboxEvent | null>;
}

export interface OutboxPollerOptions {
  config: Partial<OutboxPollerConfig>;
  repository: OutboxRepository;
  dispatcher: EventDispatcher;
  logger?: pino.Logger;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: OutboxPollerConfig = {
  pollIntervalMs: 100, // From contracts-v1.yaml
  batchSize: 100, // From contracts-v1.yaml
  lockTimeoutMs: 30000,
  retryBackoff: [1000, 5000, 30000], // From dlq-triage.md
  maxRetries: 3,
};

// ============================================================================
// Implementation
// ============================================================================

export class OutboxPoller {
  private readonly config: OutboxPollerConfig;
  private readonly repository: OutboxRepository;
  private readonly dispatcher: EventDispatcher;
  private readonly logger: pino.Logger;

  private isPolling = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private processedCount = 0;
  private failedCount = 0;
  private dlqCount = 0;

  constructor(options: OutboxPollerOptions) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.repository = options.repository;
    this.dispatcher = options.dispatcher;
    this.logger =
      options.logger ??
      pino({
        name: 'outbox-poller',
        level: 'info',
      });
  }

  /**
   * Start polling for events
   */
  async start(): Promise<void> {
    if (this.isPolling) {
      this.logger.warn('Outbox poller is already running');
      return;
    }

    this.isPolling = true;
    this.logger.info(
      {
        pollIntervalMs: this.config.pollIntervalMs,
        batchSize: this.config.batchSize,
      },
      'Starting outbox poller'
    );

    // Start polling loop
    this.poll();
  }

  /**
   * Stop polling
   */
  async stop(): Promise<void> {
    this.isPolling = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    this.logger.info(
      {
        processed: this.processedCount,
        failed: this.failedCount,
        dlq: this.dlqCount,
      },
      'Outbox poller stopped'
    );
  }

  /**
   * Get polling statistics
   */
  getStats(): { processed: number; failed: number; dlq: number; isPolling: boolean } {
    return {
      processed: this.processedCount,
      failed: this.failedCount,
      dlq: this.dlqCount,
      isPolling: this.isPolling,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private poll(): void {
    if (!this.isPolling) return;

    this.processPendingEvents()
      .catch((error) => {
        this.logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Error in polling cycle'
        );
      })
      .finally(() => {
        if (this.isPolling) {
          this.pollTimer = setTimeout(() => this.poll(), this.config.pollIntervalMs);
        }
      });
  }

  private async processPendingEvents(): Promise<void> {
    // Fetch pending events (use FOR UPDATE SKIP LOCKED in repository)
    const events = await this.repository.fetchPendingEvents(this.config.batchSize);

    if (events.length === 0) {
      return;
    }

    this.logger.debug({ count: events.length }, 'Processing batch of events');

    // Process each event
    for (const event of events) {
      await this.processEvent(event);
    }
  }

  private async processEvent(event: OutboxEvent): Promise<void> {
    const eventLogger = this.logger.child({
      eventId: event.id,
      eventType: event.eventType,
      aggregateId: event.aggregateId,
    });

    try {
      // Dispatch event to handlers
      await this.dispatcher.dispatch(event);

      // Mark as published
      await this.repository.markAsPublished(event.id);

      this.processedCount++;
      eventLogger.debug('Event processed successfully');
    } catch (error) {
      await this.handleFailure(event, error as Error, eventLogger);
    }
  }

  private async handleFailure(
    event: OutboxEvent,
    error: Error,
    logger: pino.Logger
  ): Promise<void> {
    const attempts = event.retryCount + 1;

    if (attempts >= this.config.maxRetries) {
      // Move to dead letter queue
      await this.repository.moveToDeadLetter(event.id, error.message);

      this.dlqCount++;
      logger.error(
        {
          attempts,
          maxRetries: this.config.maxRetries,
          error: error.message,
        },
        'Event moved to dead letter queue after max retries'
      );
    } else {
      // Schedule retry with exponential backoff
      const backoffMs = this.config.retryBackoff[attempts - 1] || this.config.retryBackoff[2];

      // Add jitter (±10%)
      const jitter = backoffMs * 0.1 * (Math.random() * 2 - 1);
      const delayMs = backoffMs + jitter;

      const nextRetryAt = new Date(Date.now() + delayMs);

      await this.repository.scheduleRetry(event.id, attempts, nextRetryAt, error.message);

      this.failedCount++;
      logger.warn(
        {
          attempt: attempts,
          nextRetryAt: nextRetryAt.toISOString(),
          backoffMs: Math.round(delayMs),
          error: error.message,
        },
        'Event scheduled for retry'
      );
    }
  }
}

// ============================================================================
// In-Memory Repository (for testing)
// ============================================================================

export class InMemoryOutboxRepository implements OutboxRepository {
  private readonly events: Map<string, OutboxEvent> = new Map();
  private readonly dlq: Map<string, { event: OutboxEvent; error: string }> = new Map();

  async addEvent(event: OutboxEvent): Promise<void> {
    this.events.set(event.id, event);
  }

  async fetchPendingEvents(limit: number): Promise<OutboxEvent[]> {
    const now = new Date();
    const pending: OutboxEvent[] = [];

    for (const event of this.events.values()) {
      if (event.status === 'pending' && (!event.nextRetryAt || event.nextRetryAt <= now)) {
        pending.push(event);
        if (pending.length >= limit) break;
      }
    }

    return pending;
  }

  async markAsPublished(eventId: string): Promise<void> {
    const event = this.events.get(eventId);
    if (event) {
      event.status = 'published';
      event.publishedAt = new Date();
    }
  }

  async scheduleRetry(
    eventId: string,
    retryCount: number,
    nextRetryAt: Date,
    error: string
  ): Promise<void> {
    const event = this.events.get(eventId);
    if (event) {
      event.retryCount = retryCount;
      event.nextRetryAt = nextRetryAt;
      event.lastError = error;
    }
  }

  async moveToDeadLetter(eventId: string, error: string): Promise<void> {
    const event = this.events.get(eventId);
    if (event) {
      event.status = 'dead_letter';
      this.dlq.set(eventId, { event, error });
      this.events.delete(eventId);
    }
  }

  async getEventById(eventId: string): Promise<OutboxEvent | null> {
    return this.events.get(eventId) || null;
  }

  // Test helpers
  getEventCount(): number {
    return this.events.size;
  }

  getDLQCount(): number {
    return this.dlq.size;
  }

  clear(): void {
    this.events.clear();
    this.dlq.clear();
  }
}
