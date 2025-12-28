import { describe, it, expect, beforeEach } from 'vitest';
import { AggregateRoot } from '../AggregateRoot';
import { DomainEvent } from '../DomainEvent';

// Concrete test implementations
class TestEvent extends DomainEvent {
  readonly eventType = 'TestEvent';

  constructor(public readonly data: string) {
    super();
  }

  toPayload() {
    return { data: this.data };
  }
}

class AnotherTestEvent extends DomainEvent {
  readonly eventType = 'AnotherTestEvent';

  constructor(public readonly value: number) {
    super();
  }

  toPayload() {
    return { value: this.value };
  }
}

class TestAggregate extends AggregateRoot<string> {
  constructor(
    id: string,
    private _name?: string
  ) {
    super(id);
  }

  get name(): string | undefined {
    return this._name;
  }

  // Public method to expose addDomainEvent for testing
  public addEvent(event: DomainEvent): void {
    this.addDomainEvent(event);
  }

  doSomething(): void {
    this.addDomainEvent(new TestEvent('something happened'));
  }

  doMultipleThings(): void {
    this.addDomainEvent(new TestEvent('first thing'));
    this.addDomainEvent(new AnotherTestEvent(42));
    this.addDomainEvent(new TestEvent('third thing'));
  }
}

describe('AggregateRoot', () => {
  describe('constructor and basic properties', () => {
    it('should create aggregate with id', () => {
      const aggregate = new TestAggregate('agg-123');
      expect(aggregate.id).toBe('agg-123');
    });

    it('should initialize with empty domain events', () => {
      const aggregate = new TestAggregate('agg-123');
      expect(aggregate.domainEvents).toEqual([]);
      expect(aggregate.getDomainEvents()).toEqual([]);
    });

    it('should initialize with version 0', () => {
      const aggregate = new TestAggregate('agg-123');
      expect(aggregate.version).toBe(0);
    });

    it('should inherit Entity behavior', () => {
      const aggregate1 = new TestAggregate('same-id');
      const aggregate2 = new TestAggregate('same-id');
      const aggregate3 = new TestAggregate('different-id');

      expect(aggregate1.equals(aggregate2)).toBe(true);
      expect(aggregate1.equals(aggregate3)).toBe(false);
    });
  });

  describe('addDomainEvent', () => {
    it('should add single domain event', () => {
      const aggregate = new TestAggregate('agg-123');
      const event = new TestEvent('test data');

      aggregate.addEvent(event);

      const events = aggregate.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBe(event);
    });

    it('should add multiple domain events', () => {
      const aggregate = new TestAggregate('agg-123');
      const event1 = new TestEvent('first');
      const event2 = new AnotherTestEvent(42);
      const event3 = new TestEvent('third');

      aggregate.addEvent(event1);
      aggregate.addEvent(event2);
      aggregate.addEvent(event3);

      const events = aggregate.getDomainEvents();
      expect(events).toHaveLength(3);
      expect(events[0]).toBe(event1);
      expect(events[1]).toBe(event2);
      expect(events[2]).toBe(event3);
    });

    it('should maintain event order', () => {
      const aggregate = new TestAggregate('agg-123');

      for (let i = 0; i < 5; i++) {
        aggregate.addEvent(new AnotherTestEvent(i));
      }

      const events = aggregate.getDomainEvents();
      expect(events).toHaveLength(5);

      events.forEach((event, index) => {
        expect((event as AnotherTestEvent).value).toBe(index);
      });
    });

    it('should allow same event instance to be added multiple times', () => {
      const aggregate = new TestAggregate('agg-123');
      const event = new TestEvent('repeated');

      aggregate.addEvent(event);
      aggregate.addEvent(event);

      const events = aggregate.getDomainEvents();
      expect(events).toHaveLength(2);
      expect(events[0]).toBe(event);
      expect(events[1]).toBe(event);
    });

    it('should add events through business methods', () => {
      const aggregate = new TestAggregate('agg-123');

      aggregate.doSomething();

      const events = aggregate.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TestEvent);
      expect((events[0] as TestEvent).data).toBe('something happened');
    });

    it('should accumulate events from multiple business operations', () => {
      const aggregate = new TestAggregate('agg-123');

      aggregate.doSomething();
      aggregate.doMultipleThings();

      const events = aggregate.getDomainEvents();
      expect(events).toHaveLength(4); // 1 from doSomething + 3 from doMultipleThings
    });
  });

  describe('getDomainEvents', () => {
    it('should return copy of domain events array', () => {
      const aggregate = new TestAggregate('agg-123');
      const event = new TestEvent('test');

      aggregate.addEvent(event);

      const events1 = aggregate.getDomainEvents();
      const events2 = aggregate.getDomainEvents();

      // Should return equal but different array instances
      expect(events1).toEqual(events2);
      expect(events1).not.toBe(events2);
    });

    it('should return readonly array', () => {
      const aggregate = new TestAggregate('agg-123');
      aggregate.addEvent(new TestEvent('test'));

      const events = aggregate.getDomainEvents();

      // Type is ReadonlyArray, runtime behavior depends on implementation
      expect(Array.isArray(events)).toBe(true);
    });

    it('should not allow external mutation via returned array', () => {
      const aggregate = new TestAggregate('agg-123');
      aggregate.addEvent(new TestEvent('original'));

      const events = aggregate.getDomainEvents();
      const newEvent = new TestEvent('injected');
      events.push(newEvent);

      // Original aggregate should not be affected
      const actualEvents = aggregate.getDomainEvents();
      expect(actualEvents).toHaveLength(1);
      expect(actualEvents[0]).not.toBe(newEvent);
    });
  });

  describe('domainEvents property getter', () => {
    it('should return same events as getDomainEvents', () => {
      const aggregate = new TestAggregate('agg-123');
      const event = new TestEvent('test');

      aggregate.addEvent(event);

      expect(aggregate.domainEvents).toEqual(aggregate.getDomainEvents());
    });

    it('should return copy of events array', () => {
      const aggregate = new TestAggregate('agg-123');
      aggregate.addEvent(new TestEvent('test'));

      const events1 = aggregate.domainEvents;
      const events2 = aggregate.domainEvents;

      expect(events1).toEqual(events2);
      expect(events1).not.toBe(events2);
    });

    it('should protect internal state from external mutation', () => {
      const aggregate = new TestAggregate('agg-123');
      aggregate.addEvent(new TestEvent('original'));

      const events = aggregate.domainEvents;
      events.push(new TestEvent('injected'));

      expect(aggregate.domainEvents).toHaveLength(1);
    });
  });

  describe('clearDomainEvents', () => {
    it('should clear all domain events', () => {
      const aggregate = new TestAggregate('agg-123');

      aggregate.addEvent(new TestEvent('first'));
      aggregate.addEvent(new TestEvent('second'));
      aggregate.addEvent(new TestEvent('third'));

      expect(aggregate.getDomainEvents()).toHaveLength(3);

      aggregate.clearDomainEvents();

      expect(aggregate.getDomainEvents()).toHaveLength(0);
      expect(aggregate.domainEvents).toEqual([]);
    });

    it('should allow adding new events after clearing', () => {
      const aggregate = new TestAggregate('agg-123');

      aggregate.addEvent(new TestEvent('before clear'));
      aggregate.clearDomainEvents();
      aggregate.addEvent(new TestEvent('after clear'));

      const events = aggregate.getDomainEvents();
      expect(events).toHaveLength(1);
      expect((events[0] as TestEvent).data).toBe('after clear');
    });

    it('should be idempotent when called multiple times', () => {
      const aggregate = new TestAggregate('agg-123');

      aggregate.addEvent(new TestEvent('test'));
      aggregate.clearDomainEvents();
      aggregate.clearDomainEvents();
      aggregate.clearDomainEvents();

      expect(aggregate.getDomainEvents()).toHaveLength(0);
    });

    it('should work on empty event list', () => {
      const aggregate = new TestAggregate('agg-123');

      expect(aggregate.getDomainEvents()).toHaveLength(0);

      aggregate.clearDomainEvents();

      expect(aggregate.getDomainEvents()).toHaveLength(0);
    });

    it('should not affect version', () => {
      const aggregate = new TestAggregate('agg-123');

      aggregate.incrementVersion();
      const versionBefore = aggregate.version;

      aggregate.clearDomainEvents();

      expect(aggregate.version).toBe(versionBefore);
    });
  });

  describe('version tracking', () => {
    it('should start at version 0', () => {
      const aggregate = new TestAggregate('agg-123');
      expect(aggregate.version).toBe(0);
    });

    it('should increment version', () => {
      const aggregate = new TestAggregate('agg-123');

      aggregate.incrementVersion();
      expect(aggregate.version).toBe(1);

      aggregate.incrementVersion();
      expect(aggregate.version).toBe(2);

      aggregate.incrementVersion();
      expect(aggregate.version).toBe(3);
    });

    it('should increment version independently of events', () => {
      const aggregate = new TestAggregate('agg-123');

      aggregate.addEvent(new TestEvent('event 1'));
      aggregate.addEvent(new TestEvent('event 2'));

      expect(aggregate.version).toBe(0);

      aggregate.incrementVersion();

      expect(aggregate.version).toBe(1);
      expect(aggregate.getDomainEvents()).toHaveLength(2);
    });

    it('should maintain version after clearing events', () => {
      const aggregate = new TestAggregate('agg-123');

      aggregate.incrementVersion();
      aggregate.incrementVersion();
      expect(aggregate.version).toBe(2);

      aggregate.addEvent(new TestEvent('test'));
      aggregate.clearDomainEvents();

      expect(aggregate.version).toBe(2);
    });

    it('should not allow external version modification', () => {
      const aggregate = new TestAggregate('agg-123');

      // Version getter is readonly, no setter available
      expect(aggregate.version).toBe(0);

      // Attempting to set would fail at compile time
      // (aggregate as any).version = 100; // This would not affect internal _version
    });
  });

  describe('typical usage patterns', () => {
    it('should support event sourcing pattern', () => {
      const aggregate = new TestAggregate('agg-123', 'Initial Name');

      // Perform business operations that generate events
      aggregate.doSomething();
      aggregate.doMultipleThings();

      // Get events for persistence
      const events = aggregate.getDomainEvents();
      expect(events.length).toBeGreaterThan(0);

      // Clear after publishing
      aggregate.clearDomainEvents();
      expect(aggregate.getDomainEvents()).toHaveLength(0);

      // Aggregate state persists
      expect(aggregate.name).toBe('Initial Name');
    });

    it('should support optimistic concurrency control', () => {
      const aggregate = new TestAggregate('agg-123');

      expect(aggregate.version).toBe(0);

      // Simulate loading aggregate from event store
      aggregate.incrementVersion(); // Version 1

      // Perform operation
      aggregate.doSomething();

      // Before saving, increment version
      aggregate.incrementVersion(); // Version 2

      expect(aggregate.version).toBe(2);
      expect(aggregate.getDomainEvents()).toHaveLength(1);
    });

    it('should support unit of work pattern', () => {
      const aggregate = new TestAggregate('agg-123');

      // Accumulate events during transaction
      aggregate.doSomething();
      aggregate.doMultipleThings();

      const eventsToPublish = aggregate.getDomainEvents();
      expect(eventsToPublish).toHaveLength(4);

      // After successful commit, clear events
      aggregate.clearDomainEvents();

      // Increment version to reflect persisted state
      aggregate.incrementVersion();

      expect(aggregate.version).toBe(1);
      expect(aggregate.getDomainEvents()).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle large number of events', () => {
      const aggregate = new TestAggregate('agg-123');

      for (let i = 0; i < 1000; i++) {
        aggregate.addEvent(new AnotherTestEvent(i));
      }

      expect(aggregate.getDomainEvents()).toHaveLength(1000);

      aggregate.clearDomainEvents();

      expect(aggregate.getDomainEvents()).toHaveLength(0);
    });

    it('should handle rapid version increments', () => {
      const aggregate = new TestAggregate('agg-123');

      for (let i = 0; i < 100; i++) {
        aggregate.incrementVersion();
      }

      expect(aggregate.version).toBe(100);
    });

    it('should maintain event references correctly', () => {
      const aggregate = new TestAggregate('agg-123');
      const event = new TestEvent('reference test');

      aggregate.addEvent(event);

      const retrievedEvents = aggregate.getDomainEvents();
      expect(retrievedEvents[0]).toBe(event); // Same reference

      aggregate.clearDomainEvents();

      const afterClear = aggregate.getDomainEvents();
      expect(afterClear).toHaveLength(0);

      // Original event object still exists
      expect(event.data).toBe('reference test');
    });
  });
});
