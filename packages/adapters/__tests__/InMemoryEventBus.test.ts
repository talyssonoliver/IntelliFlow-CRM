import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryEventBus } from '../src/external/InMemoryEventBus';
import { DomainEvent } from '@intelliflow/domain';

// Test event classes
class TestEvent extends DomainEvent {
  constructor(
    public readonly data: string,
    public readonly occurredAt: Date = new Date()
  ) {
    super();
  }

  get eventType(): string {
    return 'test.event';
  }
}

class AnotherTestEvent extends DomainEvent {
  constructor(
    public readonly value: number,
    public readonly occurredAt: Date = new Date()
  ) {
    super();
  }

  get eventType(): string {
    return 'another.test.event';
  }
}

class UserCreatedEvent extends DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly occurredAt: Date = new Date()
  ) {
    super();
  }

  get eventType(): string {
    return 'user.created';
  }
}

describe('InMemoryEventBus', () => {
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
  });

  describe('publish()', () => {
    it('should publish event and store it', async () => {
      const event = new TestEvent('test data');

      await eventBus.publish(event);

      const published = eventBus.getPublishedEvents();
      expect(published).toHaveLength(1);
      expect(published[0]).toBe(event);
    });

    it('should publish multiple events in order', async () => {
      const event1 = new TestEvent('first');
      const event2 = new TestEvent('second');
      const event3 = new TestEvent('third');

      await eventBus.publish(event1);
      await eventBus.publish(event2);
      await eventBus.publish(event3);

      const published = eventBus.getPublishedEvents();
      expect(published).toHaveLength(3);
      expect(published[0]).toBe(event1);
      expect(published[1]).toBe(event2);
      expect(published[2]).toBe(event3);
    });

    it('should publish different event types', async () => {
      const event1 = new TestEvent('test');
      const event2 = new AnotherTestEvent(42);

      await eventBus.publish(event1);
      await eventBus.publish(event2);

      const published = eventBus.getPublishedEvents();
      expect(published).toHaveLength(2);
      expect(published[0].eventType).toBe('test.event');
      expect(published[1].eventType).toBe('another.test.event');
    });

    it('should call registered handler when event published', async () => {
      const handler = vi.fn();
      await eventBus.subscribe('test.event', handler);

      const event = new TestEvent('test data');
      await eventBus.publish(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should call multiple handlers for same event type', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      await eventBus.subscribe('test.event', handler1);
      await eventBus.subscribe('test.event', handler2);
      await eventBus.subscribe('test.event', handler3);

      const event = new TestEvent('test data');
      await eventBus.publish(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
      expect(handler3).toHaveBeenCalledWith(event);
    });

    it('should only call handlers for matching event type', async () => {
      const testHandler = vi.fn();
      const anotherHandler = vi.fn();

      await eventBus.subscribe('test.event', testHandler);
      await eventBus.subscribe('another.test.event', anotherHandler);

      const event = new TestEvent('test data');
      await eventBus.publish(event);

      expect(testHandler).toHaveBeenCalledTimes(1);
      expect(anotherHandler).not.toHaveBeenCalled();
    });

    it('should handle async handlers', async () => {
      const results: string[] = [];
      const handler = vi.fn(async (event: TestEvent) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(event.data);
      });

      await eventBus.subscribe('test.event', handler);

      const event = new TestEvent('async test');
      await eventBus.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
      expect(results).toContain('async test');
    });

    it('should execute all handlers in parallel', async () => {
      const executionOrder: number[] = [];

      const handler1 = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        executionOrder.push(1);
      });

      const handler2 = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        executionOrder.push(2);
      });

      const handler3 = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        executionOrder.push(3);
      });

      await eventBus.subscribe('test.event', handler1);
      await eventBus.subscribe('test.event', handler2);
      await eventBus.subscribe('test.event', handler3);

      const event = new TestEvent('parallel test');
      await eventBus.publish(event);

      // Handler 2 should complete first (10ms), then 3 (20ms), then 1 (30ms)
      expect(executionOrder).toEqual([2, 3, 1]);
    });

    it('should not call handlers if no subscribers', async () => {
      const event = new TestEvent('no subscribers');

      await expect(eventBus.publish(event)).resolves.toBeUndefined();

      const published = eventBus.getPublishedEvents();
      expect(published).toHaveLength(1);
    });

    it('should preserve event data in published events list', async () => {
      const event = new UserCreatedEvent('user-123', 'test@example.com');

      await eventBus.publish(event);

      const published = eventBus.getPublishedEvents();
      const publishedEvent = published[0] as UserCreatedEvent;

      expect(publishedEvent.userId).toBe('user-123');
      expect(publishedEvent.email).toBe('test@example.com');
    });
  });

  describe('publishAll()', () => {
    it('should publish all events in array', async () => {
      const events = [
        new TestEvent('first'),
        new TestEvent('second'),
        new TestEvent('third'),
      ];

      await eventBus.publishAll(events);

      const published = eventBus.getPublishedEvents();
      expect(published).toHaveLength(3);
      expect(published).toEqual(events);
    });

    it('should publish events in order', async () => {
      const events = [
        new TestEvent('first'),
        new AnotherTestEvent(2),
        new TestEvent('third'),
      ];

      await eventBus.publishAll(events);

      const published = eventBus.getPublishedEvents();
      expect(published[0].eventType).toBe('test.event');
      expect(published[1].eventType).toBe('another.test.event');
      expect(published[2].eventType).toBe('test.event');
    });

    it('should call handlers for each published event', async () => {
      const handler = vi.fn();
      await eventBus.subscribe('test.event', handler);

      const events = [new TestEvent('first'), new TestEvent('second'), new TestEvent('third')];

      await eventBus.publishAll(events);

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('should handle empty array', async () => {
      await expect(eventBus.publishAll([])).resolves.toBeUndefined();

      const published = eventBus.getPublishedEvents();
      expect(published).toHaveLength(0);
    });

    it('should handle mixed event types', async () => {
      const testHandler = vi.fn();
      const anotherHandler = vi.fn();

      await eventBus.subscribe('test.event', testHandler);
      await eventBus.subscribe('another.test.event', anotherHandler);

      const events = [new TestEvent('test'), new AnotherTestEvent(42), new TestEvent('test2')];

      await eventBus.publishAll(events);

      expect(testHandler).toHaveBeenCalledTimes(2);
      expect(anotherHandler).toHaveBeenCalledTimes(1);
    });

    it('should process events sequentially', async () => {
      const processingOrder: string[] = [];

      const handler = vi.fn(async (event: TestEvent) => {
        processingOrder.push(`start-${event.data}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
        processingOrder.push(`end-${event.data}`);
      });

      await eventBus.subscribe('test.event', handler);

      const events = [new TestEvent('first'), new TestEvent('second')];

      await eventBus.publishAll(events);

      // Events are published sequentially, so should see start and end pairs in order
      expect(processingOrder).toEqual([
        'start-first',
        'end-first',
        'start-second',
        'end-second',
      ]);
    });
  });

  describe('subscribe()', () => {
    it('should register handler for event type', async () => {
      const handler = vi.fn();

      await eventBus.subscribe('test.event', handler);

      const event = new TestEvent('test');
      await eventBus.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should allow multiple subscriptions to same event type', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      await eventBus.subscribe('test.event', handler1);
      await eventBus.subscribe('test.event', handler2);

      const event = new TestEvent('test');
      await eventBus.publish(event);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should allow same handler to be subscribed multiple times', async () => {
      const handler = vi.fn();

      await eventBus.subscribe('test.event', handler);
      await eventBus.subscribe('test.event', handler);

      const event = new TestEvent('test');
      await eventBus.publish(event);

      // Handler will be called twice (registered twice)
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should handle subscriptions to different event types', async () => {
      const testHandler = vi.fn();
      const anotherHandler = vi.fn();

      await eventBus.subscribe('test.event', testHandler);
      await eventBus.subscribe('another.test.event', anotherHandler);

      await eventBus.publish(new TestEvent('test'));
      await eventBus.publish(new AnotherTestEvent(42));

      expect(testHandler).toHaveBeenCalledTimes(1);
      expect(anotherHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle subscription after events already published', async () => {
      const event = new TestEvent('test');
      await eventBus.publish(event);

      const handler = vi.fn();
      await eventBus.subscribe('test.event', handler);

      // Handler should not be called for already published events
      expect(handler).not.toHaveBeenCalled();

      // But should be called for new events
      await eventBus.publish(new TestEvent('new'));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should preserve handler context', async () => {
      class EventProcessor {
        public processedCount = 0;

        async handleEvent(event: TestEvent) {
          this.processedCount++;
        }
      }

      const processor = new EventProcessor();
      await eventBus.subscribe('test.event', processor.handleEvent.bind(processor));

      await eventBus.publish(new TestEvent('test'));

      expect(processor.processedCount).toBe(1);
    });
  });

  describe('getPublishedEvents()', () => {
    it('should return empty array initially', () => {
      const events = eventBus.getPublishedEvents();

      expect(events).toEqual([]);
      expect(events).toHaveLength(0);
    });

    it('should return copy of published events array', () => {
      const event = new TestEvent('test');
      eventBus.publish(event);

      const events1 = eventBus.getPublishedEvents();
      const events2 = eventBus.getPublishedEvents();

      // Should be different array instances
      expect(events1).not.toBe(events2);
      // But with same content
      expect(events1).toEqual(events2);
    });

    it('should not allow mutation of internal events array', async () => {
      await eventBus.publish(new TestEvent('test'));

      const events = eventBus.getPublishedEvents();
      events.push(new TestEvent('should not be added'));

      const actualEvents = eventBus.getPublishedEvents();
      expect(actualEvents).toHaveLength(1);
    });

    it('should return all published events in order', async () => {
      const event1 = new TestEvent('first');
      const event2 = new AnotherTestEvent(2);
      const event3 = new TestEvent('third');

      await eventBus.publish(event1);
      await eventBus.publish(event2);
      await eventBus.publish(event3);

      const events = eventBus.getPublishedEvents();

      expect(events).toHaveLength(3);
      expect(events[0]).toBe(event1);
      expect(events[1]).toBe(event2);
      expect(events[2]).toBe(event3);
    });

    it('should include events from publishAll', async () => {
      await eventBus.publish(new TestEvent('single'));
      await eventBus.publishAll([new TestEvent('batch1'), new TestEvent('batch2')]);

      const events = eventBus.getPublishedEvents();

      expect(events).toHaveLength(3);
    });

    it('should return events with their original data', async () => {
      const event = new UserCreatedEvent('user-123', 'test@example.com');
      await eventBus.publish(event);

      const events = eventBus.getPublishedEvents();
      const retrievedEvent = events[0] as UserCreatedEvent;

      expect(retrievedEvent.userId).toBe('user-123');
      expect(retrievedEvent.email).toBe('test@example.com');
      expect(retrievedEvent.eventType).toBe('user.created');
    });
  });

  describe('clearPublishedEvents()', () => {
    it('should clear all published events', async () => {
      await eventBus.publish(new TestEvent('test1'));
      await eventBus.publish(new TestEvent('test2'));
      await eventBus.publish(new TestEvent('test3'));

      eventBus.clearPublishedEvents();

      const events = eventBus.getPublishedEvents();
      expect(events).toHaveLength(0);
    });

    it('should not affect future event publishing', async () => {
      await eventBus.publish(new TestEvent('before'));
      eventBus.clearPublishedEvents();
      await eventBus.publish(new TestEvent('after'));

      const events = eventBus.getPublishedEvents();
      expect(events).toHaveLength(1);
      expect((events[0] as TestEvent).data).toBe('after');
    });

    it('should not affect subscribed handlers', async () => {
      const handler = vi.fn();
      await eventBus.subscribe('test.event', handler);

      await eventBus.publish(new TestEvent('test'));
      eventBus.clearPublishedEvents();
      await eventBus.publish(new TestEvent('test2'));

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should handle clearing empty events list', () => {
      expect(() => eventBus.clearPublishedEvents()).not.toThrow();

      const events = eventBus.getPublishedEvents();
      expect(events).toHaveLength(0);
    });

    it('should allow multiple consecutive clears', async () => {
      await eventBus.publish(new TestEvent('test'));
      eventBus.clearPublishedEvents();
      eventBus.clearPublishedEvents();
      eventBus.clearPublishedEvents();

      const events = eventBus.getPublishedEvents();
      expect(events).toHaveLength(0);
    });
  });

  describe('clearHandlers()', () => {
    it('should clear all event handlers', async () => {
      const handler = vi.fn();
      await eventBus.subscribe('test.event', handler);

      eventBus.clearHandlers();

      await eventBus.publish(new TestEvent('test'));

      expect(handler).not.toHaveBeenCalled();
    });

    it('should clear handlers for all event types', async () => {
      const testHandler = vi.fn();
      const anotherHandler = vi.fn();

      await eventBus.subscribe('test.event', testHandler);
      await eventBus.subscribe('another.test.event', anotherHandler);

      eventBus.clearHandlers();

      await eventBus.publish(new TestEvent('test'));
      await eventBus.publish(new AnotherTestEvent(42));

      expect(testHandler).not.toHaveBeenCalled();
      expect(anotherHandler).not.toHaveBeenCalled();
    });

    it('should not clear published events list', async () => {
      await eventBus.publish(new TestEvent('test'));

      eventBus.clearHandlers();

      const events = eventBus.getPublishedEvents();
      expect(events).toHaveLength(1);
    });

    it('should allow re-subscribing after clearing', async () => {
      const handler = vi.fn();
      await eventBus.subscribe('test.event', handler);

      eventBus.clearHandlers();

      await eventBus.subscribe('test.event', handler);
      await eventBus.publish(new TestEvent('test'));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle clearing when no handlers registered', () => {
      expect(() => eventBus.clearHandlers()).not.toThrow();
    });
  });

  describe('test isolation', () => {
    it('should provide independent event bus instances', async () => {
      const bus1 = new InMemoryEventBus();
      const bus2 = new InMemoryEventBus();

      await bus1.publish(new TestEvent('bus1'));
      await bus2.publish(new TestEvent('bus2'));

      expect(bus1.getPublishedEvents()).toHaveLength(1);
      expect(bus2.getPublishedEvents()).toHaveLength(1);
      expect(bus1.getPublishedEvents()[0]).not.toBe(bus2.getPublishedEvents()[0]);
    });

    it('should allow complete reset between tests', async () => {
      const handler = vi.fn();
      await eventBus.subscribe('test.event', handler);
      await eventBus.publish(new TestEvent('test'));

      eventBus.clearPublishedEvents();
      eventBus.clearHandlers();

      expect(eventBus.getPublishedEvents()).toHaveLength(0);

      await eventBus.publish(new TestEvent('after reset'));
      expect(handler).toHaveBeenCalledTimes(1); // Only called before reset
    });

    it('should handle beforeEach reset pattern', async () => {
      // Simulating a fresh instance in beforeEach
      const freshBus = new InMemoryEventBus();

      expect(freshBus.getPublishedEvents()).toHaveLength(0);

      await freshBus.publish(new TestEvent('test'));
      expect(freshBus.getPublishedEvents()).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('should continue publishing even if handler throws', async () => {
      const errorHandler = vi.fn(async () => {
        throw new Error('Handler error');
      });
      const normalHandler = vi.fn();

      await eventBus.subscribe('test.event', errorHandler);
      await eventBus.subscribe('test.event', normalHandler);

      const event = new TestEvent('test');

      // publish should reject because Promise.all will reject if any handler rejects
      await expect(eventBus.publish(event)).rejects.toThrow('Handler error');

      // Event should still be recorded
      const events = eventBus.getPublishedEvents();
      expect(events).toHaveLength(1);
    });

    it('should handle handler rejection', async () => {
      const rejectingHandler = vi.fn(async () => {
        return Promise.reject(new Error('Rejection'));
      });

      await eventBus.subscribe('test.event', rejectingHandler);

      const event = new TestEvent('test');

      await expect(eventBus.publish(event)).rejects.toThrow('Rejection');
    });
  });

  describe('type safety', () => {
    it('should preserve event type information', async () => {
      const handler = vi.fn(async (event: UserCreatedEvent) => {
        expect(event.userId).toBeDefined();
        expect(event.email).toBeDefined();
      });

      await eventBus.subscribe('user.created', handler);
      await eventBus.publish(new UserCreatedEvent('user-123', 'test@example.com'));

      expect(handler).toHaveBeenCalled();
    });

    it('should handle generic event types correctly', async () => {
      const events: DomainEvent[] = [
        new TestEvent('test'),
        new AnotherTestEvent(42),
        new UserCreatedEvent('user-123', 'test@example.com'),
      ];

      await eventBus.publishAll(events);

      const published = eventBus.getPublishedEvents();
      expect(published).toHaveLength(3);
      expect(published.every((e) => e instanceof DomainEvent)).toBe(true);
    });
  });
});
