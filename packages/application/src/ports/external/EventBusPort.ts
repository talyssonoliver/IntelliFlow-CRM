import { DomainEvent, RepositoryTransaction } from '@intelliflow/domain';

/**
 * Event Bus Port
 * Defines the contract for publishing domain events
 * Implementation lives in adapters layer (Redis, RabbitMQ, etc.)
 */

export interface EventBusPort {
  /**
   * Publish a single domain event
   */
  publish(event: DomainEvent): Promise<void>;

  /**
   * Publish multiple domain events.
   *
   * When a {@link RepositoryTransaction} is supplied, the events are written to
   * the outbox inside that same transaction, so the aggregate save and its
   * events commit or roll back together (ADR-011 zero-lost-events). Without a
   * transaction the implementation manages its own (backward-compatible).
   */
  publishAll(events: readonly DomainEvent[], tx?: RepositoryTransaction): Promise<void>;

  /**
   * Subscribe to domain events
   */
  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: (event: T) => Promise<void>
  ): Promise<void>;
}
