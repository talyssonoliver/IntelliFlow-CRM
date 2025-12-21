import { DomainEvent } from '@intelliflow/domain';

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
   * Publish multiple domain events
   */
  publishAll(events: readonly DomainEvent[]): Promise<void>;

  /**
   * Subscribe to domain events
   */
  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: (event: T) => Promise<void>
  ): Promise<void>;
}
