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
  };
  status: OutboxEventStatus;
  retryCount: number;
  nextRetryAt?: Date;
  lastError?: string;
  createdAt: Date;
  publishedAt?: Date;
}

export type EventHandler = (event: OutboxEvent) => Promise<void>;

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
      name: name || `handler-${pattern}`,
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
  async dispatch(event: OutboxEvent): Promise<void> {
    const matchingHandlers = this.findHandlers(event.eventType);

    if (matchingHandlers.length === 0) {
      this.logger.warn(
        { eventType: event.eventType, eventId: event.id },
        'No handlers registered for event type'
      );
      return;
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
          this.logger.debug(
            { eventId: event.id, handler: config.name },
            'Handler completed'
          );
        } catch (error) {
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

    // Check if any handler failed
    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );

    if (failures.length > 0) {
      const firstError = failures[0].reason;
      throw firstError instanceof Error ? firstError : new Error(String(firstError));
    }
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

  // Task events
  TASK_CREATED: 'task.created',
  TASK_COMPLETED: 'task.completed',
  TASK_ASSIGNED: 'task.assigned',

  // Notification events
  NOTIFICATION_CREATED: 'notification.created',
  NOTIFICATION_SENT: 'notification.sent',
  NOTIFICATION_FAILED: 'notification.failed',

  // AI events
  AI_ANALYSIS_COMPLETED: 'ai.analysis_completed',
  AI_PREDICTION_MADE: 'ai.prediction_made',
} as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[keyof typeof DOMAIN_EVENT_TYPES];
