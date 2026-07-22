import { DomainEvent, type RepositoryTransaction } from '@intelliflow/domain';
import { EventBusPort } from '@intelliflow/application';

/**
 * In-Memory Event Bus
 * Simple event bus for testing and development
 * For production, use Redis, RabbitMQ, or similar
 */
export class InMemoryEventBus implements EventBusPort {
  private handlers: Map<string, Array<(event: DomainEvent) => Promise<void>>> = new Map();
  private publishedEvents: DomainEvent[] = [];
  private readonly record: boolean;

  /**
   * @param opts.record  Keep an in-memory buffer of every published event for
   *   test inspection (`getPublishedEvents`). Defaults to `true` so tests work
   *   unchanged. The **production** container must pass `record: false` — the bus
   *   is a process-lifetime singleton, so buffering every domain event there was
   *   an unbounded memory leak (grew with traffic forever).
   */
  constructor(opts: { record?: boolean } = {}) {
    this.record = opts.record ?? true;
  }

  async publish(event: DomainEvent): Promise<void> {
    // Buffer for test inspection only (see constructor `record`).
    if (this.record) {
      this.publishedEvents.push(event);
    }

    // Call all handlers for this event type
    const handlers = this.handlers.get(event.eventType) ?? [];
    await Promise.all(handlers.map((handler) => handler(event)));
  }

  async publishAll(events: readonly DomainEvent[], tx?: RepositoryTransaction): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  async subscribe<T extends DomainEvent>(
    eventType: string,
    handler: (event: T) => Promise<void>
  ): Promise<void> {
    const handlers = this.handlers.get(eventType) ?? [];
    handlers.push(handler as (event: DomainEvent) => Promise<void>);
    this.handlers.set(eventType, handlers);
  }

  // Test helper methods
  getPublishedEvents(): DomainEvent[] {
    return [...this.publishedEvents];
  }

  clearPublishedEvents(): void {
    this.publishedEvents = [];
  }

  clearHandlers(): void {
    this.handlers.clear();
  }
}
