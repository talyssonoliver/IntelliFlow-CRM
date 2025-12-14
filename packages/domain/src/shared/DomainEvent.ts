import { v4 as uuidv4 } from 'uuid';

/**
 * Base Domain Event class
 * Domain events represent something that happened in the domain
 */
export abstract class DomainEvent {
  public readonly eventId: string;
  public readonly occurredAt: Date;
  public abstract readonly eventType: string;

  protected constructor() {
    this.eventId = uuidv4();
    this.occurredAt = new Date();
  }

  abstract toPayload(): Record<string, unknown>;
}

/**
 * Event publisher interface - to be implemented by infrastructure
 */
export interface DomainEventPublisher {
  publish(event: DomainEvent): Promise<void>;
  publishAll(events: DomainEvent[]): Promise<void>;
}
