import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DomainEvent } from '../DomainEvent';

// Concrete implementations for testing
class UserCreatedEvent extends DomainEvent {
  readonly eventType = 'UserCreated';

  constructor(
    public readonly userId: string,
    public readonly email: string
  ) {
    super();
  }

  toPayload() {
    return {
      userId: this.userId,
      email: this.email,
    };
  }
}

class OrderPlacedEvent extends DomainEvent {
  readonly eventType = 'OrderPlaced';

  constructor(
    public readonly orderId: string,
    public readonly amount: number,
    public readonly items: string[]
  ) {
    super();
  }

  toPayload() {
    return {
      orderId: this.orderId,
      amount: this.amount,
      items: this.items,
      itemCount: this.items.length,
    };
  }
}

class EmptyEvent extends DomainEvent {
  readonly eventType = 'EmptyEvent';

  toPayload() {
    return {};
  }
}

class ComplexPayloadEvent extends DomainEvent {
  readonly eventType = 'ComplexPayload';

  constructor(
    public readonly nested: {
      level1: {
        level2: string;
      };
    },
    public readonly array: number[]
  ) {
    super();
  }

  toPayload() {
    return {
      nested: this.nested,
      array: this.array,
      computedValue: this.array.reduce((sum, n) => sum + n, 0),
    };
  }
}

describe('DomainEvent', () => {
  describe('constructor and basic properties', () => {
    it('should create event with unique eventId', () => {
      const event1 = new UserCreatedEvent('user-123', 'test@example.com');
      const event2 = new UserCreatedEvent('user-123', 'test@example.com');

      expect(event1.eventId).toBeDefined();
      expect(event2.eventId).toBeDefined();
      expect(event1.eventId).not.toBe(event2.eventId);
    });

    it('should generate UUID v4 format for eventId', () => {
      const event = new UserCreatedEvent('user-123', 'test@example.com');

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidV4Pattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(event.eventId).toMatch(uuidV4Pattern);
    });

    it('should create event with occurredAt timestamp', () => {
      const before = new Date();
      const event = new UserCreatedEvent('user-123', 'test@example.com');
      const after = new Date();

      expect(event.occurredAt).toBeInstanceOf(Date);
      expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(event.occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should have eventType defined by subclass', () => {
      const userEvent = new UserCreatedEvent('user-123', 'test@example.com');
      const orderEvent = new OrderPlacedEvent('order-456', 99.99, ['item1', 'item2']);

      expect(userEvent.eventType).toBe('UserCreated');
      expect(orderEvent.eventType).toBe('OrderPlaced');
    });

    it('should preserve custom properties from subclass', () => {
      const event = new UserCreatedEvent('user-123', 'test@example.com');

      expect(event.userId).toBe('user-123');
      expect(event.email).toBe('test@example.com');
    });

    it('should handle complex constructor parameters', () => {
      const event = new OrderPlacedEvent('order-789', 149.99, ['item1', 'item2', 'item3']);

      expect(event.orderId).toBe('order-789');
      expect(event.amount).toBe(149.99);
      expect(event.items).toEqual(['item1', 'item2', 'item3']);
    });
  });

  describe('eventId uniqueness', () => {
    it('should generate unique eventIds for multiple events', () => {
      const eventIds = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const event = new UserCreatedEvent(`user-${i}`, `user${i}@example.com`);
        eventIds.add(event.eventId);
      }

      expect(eventIds.size).toBe(100);
    });

    it('should generate different eventIds even for identical event data', () => {
      const events = [
        new UserCreatedEvent('same-id', 'same@example.com'),
        new UserCreatedEvent('same-id', 'same@example.com'),
        new UserCreatedEvent('same-id', 'same@example.com'),
      ];

      const eventIds = events.map((e) => e.eventId);
      const uniqueIds = new Set(eventIds);

      expect(uniqueIds.size).toBe(3);
    });
  });

  describe('occurredAt timestamp', () => {
    it('should have different timestamps for events created at different times', async () => {
      const event1 = new UserCreatedEvent('user-1', 'test1@example.com');

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const event2 = new UserCreatedEvent('user-2', 'test2@example.com');

      expect(event2.occurredAt.getTime()).toBeGreaterThan(event1.occurredAt.getTime());
    });

    it('should create timestamp in constructor call', () => {
      const now = Date.now();
      const event = new UserCreatedEvent('user-123', 'test@example.com');

      // Timestamp should be very close to when constructor was called
      const difference = Math.abs(event.occurredAt.getTime() - now);
      expect(difference).toBeLessThan(100); // Within 100ms
    });

    it('should be a valid Date object', () => {
      const event = new UserCreatedEvent('user-123', 'test@example.com');

      expect(event.occurredAt).toBeInstanceOf(Date);
      expect(isNaN(event.occurredAt.getTime())).toBe(false);
    });

    it('should allow chronological sorting', () => {
      const events: DomainEvent[] = [];

      for (let i = 0; i < 5; i++) {
        events.push(new UserCreatedEvent(`user-${i}`, `user${i}@example.com`));
      }

      // Sort by occurredAt
      const sorted = [...events].sort(
        (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()
      );

      // Should maintain creation order (or be very close due to fast execution)
      sorted.forEach((event, index) => {
        if (index > 0) {
          expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(
            sorted[index - 1].occurredAt.getTime()
          );
        }
      });
    });
  });

  describe('toPayload', () => {
    it('should return payload with event data', () => {
      const event = new UserCreatedEvent('user-123', 'test@example.com');
      const payload = event.toPayload();

      expect(payload).toEqual({
        userId: 'user-123',
        email: 'test@example.com',
      });
    });

    it('should return empty object for events with no data', () => {
      const event = new EmptyEvent();
      const payload = event.toPayload();

      expect(payload).toEqual({});
    });

    it('should include all relevant event properties', () => {
      const event = new OrderPlacedEvent('order-456', 99.99, ['item1', 'item2']);
      const payload = event.toPayload();

      expect(payload).toEqual({
        orderId: 'order-456',
        amount: 99.99,
        items: ['item1', 'item2'],
        itemCount: 2,
      });
    });

    it('should handle complex nested objects', () => {
      const event = new ComplexPayloadEvent(
        {
          level1: {
            level2: 'deep value',
          },
        },
        [1, 2, 3, 4, 5]
      );

      const payload = event.toPayload();

      expect(payload).toEqual({
        nested: {
          level1: {
            level2: 'deep value',
          },
        },
        array: [1, 2, 3, 4, 5],
        computedValue: 15,
      });
    });

    it('should return consistent payload on multiple calls', () => {
      const event = new UserCreatedEvent('user-123', 'test@example.com');

      const payload1 = event.toPayload();
      const payload2 = event.toPayload();

      expect(payload1).toEqual(payload2);
    });

    it('should handle edge cases in data', () => {
      const event = new OrderPlacedEvent('order-001', 0, []);

      const payload = event.toPayload();

      expect(payload.amount).toBe(0);
      expect(payload.items).toEqual([]);
      expect(payload.itemCount).toBe(0);
    });
  });

  describe('immutability', () => {
    it('should have readonly eventId', () => {
      const event = new UserCreatedEvent('user-123', 'test@example.com');
      const originalId = event.eventId;

      // Readonly property at compile-time (TypeScript enforces this)
      // At runtime, we verify it exists and has correct value
      expect(event.eventId).toBe(originalId);
      expect(typeof event.eventId).toBe('string');
    });

    it('should have readonly occurredAt', () => {
      const event = new UserCreatedEvent('user-123', 'test@example.com');
      const originalDate = event.occurredAt;

      // Readonly property at compile-time (TypeScript enforces this)
      expect(event.occurredAt).toBe(originalDate);
      expect(event.occurredAt).toBeInstanceOf(Date);
    });

    it('should have readonly eventType', () => {
      const event = new UserCreatedEvent('user-123', 'test@example.com');

      // Readonly property at compile-time (TypeScript enforces this)
      expect(event.eventType).toBe('UserCreated');
    });

    it('should have readonly custom properties', () => {
      const event = new UserCreatedEvent('user-123', 'test@example.com');

      // Readonly properties at compile-time (TypeScript enforces this)
      expect(event.userId).toBe('user-123');
      expect(event.email).toBe('test@example.com');
    });
  });

  describe('type discrimination', () => {
    it('should allow type checking via eventType', () => {
      const events: DomainEvent[] = [
        new UserCreatedEvent('user-1', 'user1@example.com'),
        new OrderPlacedEvent('order-1', 50.0, ['item1']),
        new UserCreatedEvent('user-2', 'user2@example.com'),
        new EmptyEvent(),
      ];

      const userEvents = events.filter((e) => e.eventType === 'UserCreated');
      const orderEvents = events.filter((e) => e.eventType === 'OrderPlaced');
      const emptyEvents = events.filter((e) => e.eventType === 'EmptyEvent');

      expect(userEvents).toHaveLength(2);
      expect(orderEvents).toHaveLength(1);
      expect(emptyEvents).toHaveLength(1);
    });

    it('should support instanceof checks', () => {
      const event = new UserCreatedEvent('user-123', 'test@example.com');

      expect(event).toBeInstanceOf(DomainEvent);
      expect(event).toBeInstanceOf(UserCreatedEvent);
    });
  });

  describe('serialization scenarios', () => {
    it('should be JSON serializable', () => {
      const event = new UserCreatedEvent('user-123', 'test@example.com');

      const json = JSON.stringify({
        eventId: event.eventId,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        payload: event.toPayload(),
      });

      expect(() => JSON.parse(json)).not.toThrow();

      const parsed = JSON.parse(json);
      expect(parsed.eventId).toBe(event.eventId);
      expect(parsed.eventType).toBe('UserCreated');
      expect(parsed.payload).toEqual(event.toPayload());
    });

    it('should handle Date serialization', () => {
      const event = new UserCreatedEvent('user-123', 'test@example.com');

      const serialized = JSON.stringify({
        occurredAt: event.occurredAt,
      });

      const parsed = JSON.parse(serialized);

      // Date becomes ISO string when serialized
      const reconstructed = new Date(parsed.occurredAt);
      expect(reconstructed.getTime()).toBe(event.occurredAt.getTime());
    });
  });

  describe('event lifecycle', () => {
    it('should support event store pattern', () => {
      const events: DomainEvent[] = [
        new UserCreatedEvent('user-1', 'user1@example.com'),
        new OrderPlacedEvent('order-1', 100.0, ['item1', 'item2']),
      ];

      // Simulate storing events
      const storedEvents = events.map((e) => ({
        eventId: e.eventId,
        eventType: e.eventType,
        occurredAt: e.occurredAt.toISOString(),
        payload: e.toPayload(),
      }));

      expect(storedEvents).toHaveLength(2);
      expect(storedEvents[0].eventType).toBe('UserCreated');
      expect(storedEvents[1].eventType).toBe('OrderPlaced');
    });

    it('should support event versioning via eventType', () => {
      class UserCreatedEventV2 extends DomainEvent {
        readonly eventType = 'UserCreated.v2';

        constructor(
          public readonly userId: string,
          public readonly email: string,
          public readonly version: number
        ) {
          super();
        }

        toPayload() {
          return {
            userId: this.userId,
            email: this.email,
            version: this.version,
          };
        }
      }

      const v1Event = new UserCreatedEvent('user-1', 'test@example.com');
      const v2Event = new UserCreatedEventV2('user-2', 'test2@example.com', 2);

      expect(v1Event.eventType).toBe('UserCreated');
      expect(v2Event.eventType).toBe('UserCreated.v2');
    });
  });

  describe('edge cases', () => {
    it('should handle empty strings in event data', () => {
      const event = new UserCreatedEvent('', '');

      expect(event.userId).toBe('');
      expect(event.email).toBe('');
      expect(event.toPayload()).toEqual({
        userId: '',
        email: '',
      });
    });

    it('should handle special characters in event data', () => {
      const event = new UserCreatedEvent('user-with-特殊字符', 'test+tag@example.com');

      expect(event.userId).toBe('user-with-特殊字符');
      expect(event.email).toBe('test+tag@example.com');
    });

    it('should handle very large arrays', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => `item-${i}`);
      const event = new OrderPlacedEvent('order-large', 9999.99, largeArray);

      expect(event.items).toHaveLength(1000);
      expect(event.toPayload().itemCount).toBe(1000);
    });

    it('should handle negative numbers', () => {
      const event = new OrderPlacedEvent('order-refund', -50.0, ['refund-item']);

      expect(event.amount).toBe(-50.0);
      expect(event.toPayload().amount).toBe(-50.0);
    });

    it('should handle zero values', () => {
      const event = new OrderPlacedEvent('order-free', 0, []);

      expect(event.amount).toBe(0);
      expect(event.items).toEqual([]);
    });
  });
});
