/**
 * Event Dispatcher
 *
 * Routes domain events to registered handlers based on event type.
 *
 * @module events-worker/outbox
 * @task IFC-163
 */

import pino from 'pino';

// ============================================================================
// Types
// ============================================================================

export type OutboxEventStatus = 'pending' | 'published' | 'failed' | 'dead_letter';

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
    /**
     * Names of the handlers that already succeeded for this event (IFC-151).
     * A retry skips them, so a handler that succeeded is not run twice when
     * another handler of the same event failed.
     */
    handledBy?: string[];
  };
  status: OutboxEventStatus;
  retryCount: number;
  nextRetryAt?: Date;
  lastError?: string;
  createdAt: Date;
  publishedAt?: Date;
}

export type EventHandler = (event: OutboxEvent) => Promise<void>;

/**
 * Thrown by a handler when the event can never be processed (a malformed or
 * impossible payload). The poller moves it straight to the dead-letter queue
 * instead of retrying it (IFC-151 poison-message handling).
 */
export class PoisonMessageError extends Error {
  readonly poison = true;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PoisonMessageError';
  }
}

/** True for a PoisonMessageError, also across module copies (checked by shape). */
export function isPoisonMessage(error: unknown): boolean {
  return (
    error instanceof PoisonMessageError ||
    (error instanceof Error && (error as { poison?: unknown }).poison === true)
  );
}

export interface DispatchOptions {
  /** Handlers that already succeeded for this event; they are skipped. */
  alreadyHandled?: ReadonlySet<string>;
  /** Called after each handler succeeds, to record it (idempotent retries). */
  onHandled?: (handlerName: string) => Promise<void>;
}

export interface DispatchResult {
  /** Handlers run by this dispatch. */
  ran: string[];
  /** Handlers skipped because they had already succeeded. */
  skipped: string[];
}

export interface EventHandlerConfig {
  /** Event type pattern (supports wildcards like 'lead.*') */
  pattern: string;
  /** Handler function */
  handler: EventHandler;
  /** Handler name for logging */
  name: string;
}

// ============================================================================
// Implementation
// ============================================================================

export class EventDispatcher {
  private readonly handlers: Map<string, EventHandlerConfig[]> = new Map();
  private readonly wildcardHandlers: EventHandlerConfig[] = [];
  /** Every name in use: handler names key the per-event idempotency record. */
  private readonly names = new Set<string>();
  private readonly logger: pino.Logger;

  constructor(logger?: pino.Logger) {
    this.logger =
      logger ??
      pino({
        name: 'event-dispatcher',
        level: 'info',
      });
  }

  /**
   * Register an event handler
   *
   * @example
   * // Handle specific event type
   * dispatcher.register('lead.created', handler);
   *
   * // Handle all events of an aggregate
   * dispatcher.register('lead.*', handler);
   *
   * // Handle all events
   * dispatcher.register('*', handler);
   */
  register(pattern: string, handler: EventHandler, name?: string): void {
    const config: EventHandlerConfig = {
      pattern,
      handler,
      name: this.uniqueName(name || `handler-${pattern}`),
    };

    if (pattern === '*') {
      this.wildcardHandlers.push(config);
      this.logger.debug({ pattern, name: config.name }, 'Registered wildcard handler');
      return;
    }

    if (pattern.endsWith('.*')) {
      // Aggregate wildcard (e.g., 'lead.*')
      const prefix = pattern.slice(0, -2);
      if (!this.handlers.has(prefix)) {
        this.handlers.set(prefix, []);
      }
      this.handlers.get(prefix)!.push(config);
    } else {
      // Exact match
      if (!this.handlers.has(pattern)) {
        this.handlers.set(pattern, []);
      }
      this.handlers.get(pattern)!.push(config);
    }

    this.logger.debug({ pattern, name: config.name }, 'Registered event handler');
  }

  /**
   * Unregister handlers for a pattern
   */
  unregister(pattern: string): void {
    const removed =
      pattern === '*'
        ? [...this.wildcardHandlers]
        : (this.handlers.get(pattern.endsWith('.*') ? pattern.slice(0, -2) : pattern) ?? []);
    for (const config of removed) this.names.delete(config.name);

    if (pattern === '*') {
      this.wildcardHandlers.length = 0;
    } else if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      this.handlers.delete(prefix);
    } else {
      this.handlers.delete(pattern);
    }

    this.logger.debug({ pattern }, 'Unregistered event handler(s)');
  }

  /**
   * Dispatch an event to all matching handlers
   */
  async dispatch(event: OutboxEvent, options: DispatchOptions = {}): Promise<DispatchResult> {
    const allHandlers = this.findHandlers(event.eventType);

    if (allHandlers.length === 0) {
      this.logger.warn(
        { eventType: event.eventType, eventId: event.id },
        'No handlers registered for event type'
      );
      return { ran: [], skipped: [] };
    }

    const done = options.alreadyHandled ?? new Set<string>();
    const skipped = allHandlers.filter((h) => done.has(h.name)).map((h) => h.name);
    const matchingHandlers = allHandlers.filter((h) => !done.has(h.name));
    if (skipped.length > 0) {
      this.logger.info(
        { eventId: event.id, skipped },
        'Skipping handlers that already succeeded for this event'
      );
    }

    this.logger.debug(
      {
        eventType: event.eventType,
        eventId: event.id,
        handlerCount: matchingHandlers.length,
      },
      'Dispatching event to handlers'
    );

    // Execute all handlers (in parallel by default)
    const results = await Promise.allSettled(
      matchingHandlers.map(async (config) => {
        try {
          await config.handler(event);
          this.logger.debug({ eventId: event.id, handler: config.name }, 'Handler completed');
        } catch (error) {
          if (isPoisonMessage(error)) {
            this.logger.warn(
              { eventId: event.id, handler: config.name, error: (error as Error).message },
              'Handler rejected the event as unprocessable (poison message)'
            );
            throw error;
          }
          this.logger.error(
            {
              eventId: event.id,
              handler: config.name,
              error: error instanceof Error ? error.message : String(error),
            },
            'Handler failed'
          );
          throw error;
        }
      })
    );

    // Record each success before reporting failures, so a retry skips it.
    const ran = matchingHandlers.map((h) => h.name);
    if (options.onHandled) {
      for (const [i, r] of results.entries()) {
        if (r.status === 'fulfilled') await options.onHandled(ran[i]!);
      }
    }

    // Check if any handler failed; a poison message wins so it skips the retries.
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    if (failures.length > 0) {
      const chosen = failures.find((f) => isPoisonMessage(f.reason)) ?? failures[0]!;
      const reason = chosen.reason;
      throw reason instanceof Error ? reason : new Error(String(reason));
    }
    return { ran, skipped };
  }

  /**
   * Get all registered handler patterns
   */
  getRegisteredPatterns(): string[] {
    const patterns = Array.from(this.handlers.keys());
    if (this.wildcardHandlers.length > 0) {
      patterns.push('*');
    }
    return patterns;
  }

  /**
   * Check if there are handlers for an event type
   */
  hasHandlers(eventType: string): boolean {
    return this.findHandlers(eventType).length > 0;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Handler names must be unique: the idempotency record (metadata.handledBy)
   * skips a handler by name, so two handlers sharing one would skip each other.
   */
  private uniqueName(base: string): string {
    let name = base;
    for (let n = 2; this.names.has(name); n++) name = `${base}#${n}`;
    this.names.add(name);
    return name;
  }

  private findHandlers(eventType: string): EventHandlerConfig[] {
    const handlers: EventHandlerConfig[] = [];

    // Exact match
    const exactHandlers = this.handlers.get(eventType);
    if (exactHandlers) {
      handlers.push(...exactHandlers);
    }

    // Aggregate wildcard match (e.g., 'lead.created' matches 'lead.*')
    const parts = eventType.split('.');
    if (parts.length >= 2) {
      const prefix = parts[0];
      const prefixHandlers = this.handlers.get(prefix);
      if (prefixHandlers) {
        handlers.push(...prefixHandlers.filter((h) => h.pattern.endsWith('.*')));
      }
    }

    // Global wildcard handlers
    handlers.push(...this.wildcardHandlers);

    return handlers;
  }
}

// ============================================================================
// Common Event Types
// ============================================================================

export const DOMAIN_EVENT_TYPES = {
  // Lead events
  LEAD_CREATED: 'lead.created',
  LEAD_SCORED: 'lead.scored',
  LEAD_QUALIFIED: 'lead.qualified',
  LEAD_CONVERTED: 'lead.converted',
  LEAD_UPDATED: 'lead.updated',

  // Contact events
  CONTACT_CREATED: 'contact.created',
  CONTACT_UPDATED: 'contact.updated',

  // Opportunity events
  OPPORTUNITY_CREATED: 'opportunity.created',
  OPPORTUNITY_STAGE_CHANGED: 'opportunity.stage_changed',
  OPPORTUNITY_WON: 'opportunity.won',
  OPPORTUNITY_LOST: 'opportunity.lost',
  // IFC-283 W-02: description changes now emit a domain event
  OPPORTUNITY_DESCRIPTION_UPDATED: 'opportunity.description_updated',
  // IFC-314: enriched deal-won event → portal delivery/billing sync
  DEAL_WON_ENRICHED: 'opportunity.deal_won_enriched',
  // Stripe engine-subscription status → portal push, enqueued by the API webhook
  SUBSCRIPTION_PORTAL_SYNC_REQUESTED: 'subscription.portal_sync_requested',

  // Task events
  TASK_CREATED: 'task.created',
  TASK_COMPLETED: 'task.completed',
  TASK_ASSIGNED: 'task.assigned',
  TASK_LINKED_TO_ENTITY: 'task.linked_to_entity',
  TASK_STATUS_CHANGED: 'task.status_changed',
  TASK_PRIORITY_CHANGED: 'task.priority_changed',
  TASK_DUE_DATE_CHANGED: 'task.due_date_changed',
  TASK_CANCELLED: 'task.cancelled',
  TASK_UPDATED: 'task.updated',
  TASK_DELETED: 'task.deleted',

  // Notification events
  NOTIFICATION_CREATED: 'notification.created',
  NOTIFICATION_SENT: 'notification.sent',
  NOTIFICATION_FAILED: 'notification.failed',

  // AI events
  AI_ANALYSIS_COMPLETED: 'ai.analysis_completed',
  AI_PREDICTION_MADE: 'ai.prediction_made',
} as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[keyof typeof DOMAIN_EVENT_TYPES];
