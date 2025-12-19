import { Entity } from './Entity';
import { DomainEvent } from './DomainEvent';

/**
 * Base Aggregate Root class
 * Aggregates are consistency boundaries and emit domain events
 */
export abstract class AggregateRoot<TId> extends Entity<TId> {
  private _domainEvents: DomainEvent[] = [];
  private _version: number = 0;

  protected constructor(id: TId) {
    super(id);
  }

  get domainEvents(): ReadonlyArray<DomainEvent> {
    return [...this._domainEvents];
  }

  getDomainEvents(): ReadonlyArray<DomainEvent> {
    return this.domainEvents;
  }

  get version(): number {
    return this._version;
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  clearDomainEvents(): void {
    this._domainEvents = [];
  }

  incrementVersion(): void {
    this._version++;
  }
}
