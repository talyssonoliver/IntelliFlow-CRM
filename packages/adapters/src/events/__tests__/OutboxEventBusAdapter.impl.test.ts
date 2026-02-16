/**
 * OutboxEventBusAdapter Implementation Tests
 *
 * Tests the actual OutboxEventBusAdapter class (not mocks).
 * Covers: publish, publishAll, subscribe, idempotency, aggregate extraction.
 *
 * @task IFC-150
 * @phase Phase 2 GREEN - Implementation coverage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DomainEvent } from '@intelliflow/domain';

// Mock the @intelliflow/db module before importing adapter
vi.mock('@intelliflow/db', () => ({
  withTransaction: vi.fn(async (callback: (tx: any) => Promise<any>) => {
    // Create a mock transaction client
    const mockTx = {
      domainEvent: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'created-id' }),
      },
    };
    return callback(mockTx);
  }),
  EventStatus: {
    PENDING: 'PENDING',
    PROCESSING: 'PROCESSING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
  },
  Prisma: {
    JsonNull: null,
  },
}));

import { OutboxEventBusAdapter, type ContextAccessors } from '../OutboxEventBusAdapter';

// --- Test event classes ---

class TestLeadCreatedEvent extends DomainEvent {
  public readonly eventType = 'lead.created';

  constructor(
    public readonly leadId: string,
    public readonly email: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return { leadId: this.leadId, email: this.email };
  }
}

class TestContactUpdatedEvent extends DomainEvent {
  public readonly eventType = 'contact.updated';

  constructor(
    public readonly contactId: string,
    public readonly name: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return { contactId: this.contactId, name: this.name };
  }
}

class TestGenericEvent extends DomainEvent {
  public readonly eventType = 'system.notification';

  constructor(public readonly id: string) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return { id: this.id };
  }
}

class TestAggregateIdEvent extends DomainEvent {
  public readonly eventType = 'task.completed';

  constructor(public readonly aggregateId: string) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return { aggregateId: this.aggregateId };
  }
}

class TestNoIdEvent extends DomainEvent {
  public readonly eventType = 'audit.log';

  constructor(public readonly message: string) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return { message: this.message };
  }
}

// --- Mock Prisma client ---

function createMockPrisma() {
  const mockTx = {
    domainEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'created-id' }),
    },
  };

  return {
    domainEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'created-id' }),
    },
    $transaction: vi.fn(async (callback: (tx: any) => Promise<any>) => {
      // Mock transaction by calling callback with mockTx and returning its result
      return await callback(mockTx);
    }),
    _tx: mockTx,
  };
}

describe('OutboxEventBusAdapter (Implementation)', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let adapter: OutboxEventBusAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    adapter = new OutboxEventBusAdapter({
      prisma: mockPrisma as any,
    });
  });

  describe('constructor', () => {
    it('should use default context accessors when none provided', () => {
      const a = new OutboxEventBusAdapter({ prisma: mockPrisma as any });
      // If no context provided, defaults are used (all return undefined).
      // This should not throw.
      expect(a).toBeDefined();
    });

    it('should use the provided default tenant ID', async () => {
      const a = new OutboxEventBusAdapter({
        prisma: mockPrisma as any,
        defaultTenantId: 'custom-tenant',
      });

      const event = new TestLeadCreatedEvent('lead-1', 'test@example.com');
      await a.publish(event);

      expect(mockPrisma.domainEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'custom-tenant',
          }),
        })
      );
    });

    it('should use "default" as tenant ID when none provided', async () => {
      const event = new TestLeadCreatedEvent('lead-1', 'test@example.com');
      await adapter.publish(event);

      expect(mockPrisma.domainEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'default',
          }),
        })
      );
    });

    it('should accept custom context accessors', async () => {
      const context: ContextAccessors = {
        getCorrelationId: () => 'corr-123',
        getCausationId: () => 'caus-456',
        getUserId: () => 'user-789',
        getTenantId: () => 'tenant-abc',
      };

      const a = new OutboxEventBusAdapter({
        prisma: mockPrisma as any,
        context,
      });

      const event = new TestLeadCreatedEvent('lead-1', 'test@example.com');
      await a.publish(event);

      expect(mockPrisma.domainEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-abc',
            metadata: expect.objectContaining({
              correlationId: 'corr-123',
              causationId: 'caus-456',
              userId: 'user-789',
              tenantId: 'tenant-abc',
            }),
          }),
        })
      );
    });
  });

  describe('publish', () => {
    it('should create an event in the outbox with PENDING status', async () => {
      const event = new TestLeadCreatedEvent('lead-1', 'test@example.com');

      await adapter.publish(event);

      expect(mockPrisma.domainEvent.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.domainEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'lead.created',
            status: 'PENDING',
            aggregateType: 'Lead',
            aggregateId: 'lead-1',
          }),
        })
      );
    });

    it('should check for duplicates before creating', async () => {
      const event = new TestLeadCreatedEvent('lead-1', 'test@example.com');

      await adapter.publish(event);

      expect(mockPrisma.domainEvent.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrisma.domainEvent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            metadata: expect.objectContaining({
              path: ['idempotencyKey'],
            }),
          }),
        })
      );
    });

    it('should silently ignore duplicate events', async () => {
      mockPrisma.domainEvent.findFirst.mockResolvedValue({ id: 'existing-id' });

      const event = new TestLeadCreatedEvent('lead-dup', 'test@example.com');
      await adapter.publish(event);

      expect(mockPrisma.domainEvent.create).not.toHaveBeenCalled();
    });

    it('should include the event payload in the created record', async () => {
      const event = new TestLeadCreatedEvent('lead-payload', 'payload@example.com');

      await adapter.publish(event);

      const createCall = mockPrisma.domainEvent.create.mock.calls[0][0];
      expect(createCall.data.payload).toEqual({
        leadId: 'lead-payload',
        email: 'payload@example.com',
      });
    });

    it('should include metadata with version, timestamp, and idempotencyKey', async () => {
      const event = new TestLeadCreatedEvent('lead-meta', 'meta@example.com');

      await adapter.publish(event);

      const createCall = mockPrisma.domainEvent.create.mock.calls[0][0];
      const metadata = createCall.data.metadata;

      expect(metadata.version).toBe('1.0');
      expect(metadata.timestamp).toBeDefined();
      expect(metadata.idempotencyKey).toContain('lead.created:lead-meta:');
    });

    it('should use event eventId as correlationId when context returns undefined', async () => {
      const event = new TestLeadCreatedEvent('lead-corr', 'corr@example.com');

      await adapter.publish(event);

      const createCall = mockPrisma.domainEvent.create.mock.calls[0][0];
      expect(createCall.data.metadata.correlationId).toBe(event.eventId);
    });

    it('should set occurredAt from the event', async () => {
      const event = new TestLeadCreatedEvent('lead-time', 'time@example.com');

      await adapter.publish(event);

      const createCall = mockPrisma.domainEvent.create.mock.calls[0][0];
      expect(createCall.data.occurredAt).toBe(event.occurredAt);
    });
  });

  describe('publishAll', () => {
    it('should do nothing for empty array', async () => {
      const { withTransaction } = await import('@intelliflow/db');
      vi.mocked(withTransaction).mockClear();

      await adapter.publishAll([]);

      expect(withTransaction).not.toHaveBeenCalled();
    });

    it('should publish all events within a transaction', async () => {
      const { withTransaction } = await import('@intelliflow/db');
      const mockCreate = vi.fn().mockResolvedValue({ id: 'created-id' });
      const mockFindFirst = vi.fn().mockResolvedValue(null);

      vi.mocked(withTransaction).mockImplementation(async (callback: any) => {
        const mockTx = {
          domainEvent: {
            findFirst: mockFindFirst,
            create: mockCreate,
          },
        };
        return callback(mockTx);
      });

      const events = [
        new TestLeadCreatedEvent('lead-1', 'a@example.com'),
        new TestContactUpdatedEvent('contact-1', 'Alice'),
      ];

      await adapter.publishAll(events);

      expect(withTransaction).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should skip duplicates within the batch', async () => {
      const { withTransaction } = await import('@intelliflow/db');
      const mockCreate = vi.fn().mockResolvedValue({ id: 'created-id' });
      const mockFindFirst = vi
        .fn()
        .mockResolvedValueOnce(null) // first event is new
        .mockResolvedValueOnce({ id: 'existing-id' }); // second is duplicate

      vi.mocked(withTransaction).mockImplementation(async (callback: any) => {
        const mockTx = {
          domainEvent: {
            findFirst: mockFindFirst,
            create: mockCreate,
          },
        };
        return callback(mockTx);
      });

      const events = [
        new TestLeadCreatedEvent('lead-1', 'a@example.com'),
        new TestContactUpdatedEvent('contact-1', 'Alice'),
      ];

      await adapter.publishAll(events);

      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should use correct aggregate types for different events', async () => {
      const { withTransaction } = await import('@intelliflow/db');
      const mockCreate = vi.fn().mockResolvedValue({ id: 'created-id' });
      const mockFindFirst = vi.fn().mockResolvedValue(null);

      vi.mocked(withTransaction).mockImplementation(async (callback: any) => {
        const mockTx = {
          domainEvent: {
            findFirst: mockFindFirst,
            create: mockCreate,
          },
        };
        return callback(mockTx);
      });

      const events = [
        new TestLeadCreatedEvent('lead-1', 'a@example.com'),
        new TestContactUpdatedEvent('contact-1', 'Bob'),
      ];

      await adapter.publishAll(events);

      const calls = mockCreate.mock.calls;
      expect(calls[0][0].data.aggregateType).toBe('Lead');
      expect(calls[1][0].data.aggregateType).toBe('Contact');
    });

    it('should handle a single event in the batch', async () => {
      const { withTransaction } = await import('@intelliflow/db');
      const mockCreate = vi.fn().mockResolvedValue({ id: 'created-id' });
      const mockFindFirst = vi.fn().mockResolvedValue(null);

      vi.mocked(withTransaction).mockImplementation(async (callback: any) => {
        const mockTx = {
          domainEvent: {
            findFirst: mockFindFirst,
            create: mockCreate,
          },
        };
        return callback(mockTx);
      });

      const events = [new TestLeadCreatedEvent('lead-only', 'only@example.com')];

      await adapter.publishAll(events);

      expect(withTransaction).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribe', () => {
    it('should throw an error directing to EventDispatcher', async () => {
      const handler = vi.fn();

      await expect(adapter.subscribe('lead.created', handler)).rejects.toThrow(
        'Use EventDispatcher.register() for subscriptions'
      );
    });

    it('should throw an error mentioning outbox limitation', async () => {
      const handler = vi.fn();

      await expect(adapter.subscribe('any.event', handler)).rejects.toThrow(
        'OutboxEventBusAdapter only handles publishing to the outbox'
      );
    });
  });

  describe('aggregate type extraction', () => {
    it('should capitalize the first part of the event type', async () => {
      const event = new TestLeadCreatedEvent('lead-1', 'a@example.com');
      await adapter.publish(event);

      const createCall = mockPrisma.domainEvent.create.mock.calls[0][0];
      expect(createCall.data.aggregateType).toBe('Lead');
    });

    it('should extract "Contact" from "contact.updated"', async () => {
      const event = new TestContactUpdatedEvent('contact-1', 'Alice');
      await adapter.publish(event);

      const createCall = mockPrisma.domainEvent.create.mock.calls[0][0];
      expect(createCall.data.aggregateType).toBe('Contact');
    });

    it('should extract "System" from "system.notification"', async () => {
      const event = new TestGenericEvent('gen-1');
      await adapter.publish(event);

      const createCall = mockPrisma.domainEvent.create.mock.calls[0][0];
      expect(createCall.data.aggregateType).toBe('System');
    });
  });

  describe('aggregate ID extraction', () => {
    it('should extract leadId from lead events', async () => {
      const event = new TestLeadCreatedEvent('lead-abc-123', 'a@example.com');
      await adapter.publish(event);

      const createCall = mockPrisma.domainEvent.create.mock.calls[0][0];
      expect(createCall.data.aggregateId).toBe('lead-abc-123');
    });

    it('should extract contactId from contact events', async () => {
      const event = new TestContactUpdatedEvent('contact-xyz', 'Alice');
      await adapter.publish(event);

      const createCall = mockPrisma.domainEvent.create.mock.calls[0][0];
      expect(createCall.data.aggregateId).toBe('contact-xyz');
    });

    it('should fall back to "id" field when aggregate-specific field is absent', async () => {
      const event = new TestGenericEvent('sys-notification-1');
      await adapter.publish(event);

      // system.notification -> systemId not found -> falls back to id
      const createCall = mockPrisma.domainEvent.create.mock.calls[0][0];
      expect(createCall.data.aggregateId).toBe('sys-notification-1');
    });

    it('should fall back to "aggregateId" field', async () => {
      const event = new TestAggregateIdEvent('agg-fallback');
      await adapter.publish(event);

      // task.completed -> taskId not found -> id not found -> aggregateId found
      const createCall = mockPrisma.domainEvent.create.mock.calls[0][0];
      expect(createCall.data.aggregateId).toBe('agg-fallback');
    });

    it('should use eventId as last resort when no ID fields exist', async () => {
      const event = new TestNoIdEvent('something happened');
      await adapter.publish(event);

      const createCall = mockPrisma.domainEvent.create.mock.calls[0][0];
      // auditId, id, aggregateId are all absent -> falls back to event.eventId
      expect(createCall.data.aggregateId).toBe(event.eventId);
    });
  });

  describe('idempotency key generation', () => {
    it('should generate key in format eventType:aggregateId:eventId', async () => {
      const event = new TestLeadCreatedEvent('lead-key', 'a@example.com');
      await adapter.publish(event);

      const createCall = mockPrisma.domainEvent.create.mock.calls[0][0];
      const expectedKey = `lead.created:lead-key:${event.eventId}`;
      expect(createCall.data.metadata.idempotencyKey).toBe(expectedKey);
    });

    it('should produce unique keys for events with different eventIds', async () => {
      const event1 = new TestLeadCreatedEvent('lead-1', 'a@example.com');
      const event2 = new TestLeadCreatedEvent('lead-1', 'a@example.com');

      await adapter.publish(event1);
      // Reset findFirst mock for second publish
      mockPrisma.domainEvent.findFirst.mockResolvedValue(null);
      await adapter.publish(event2);

      const key1 = mockPrisma.domainEvent.create.mock.calls[0][0].data.metadata.idempotencyKey;
      const key2 = mockPrisma.domainEvent.create.mock.calls[1][0].data.metadata.idempotencyKey;

      expect(key1).not.toBe(key2);
    });
  });

  describe('context integration', () => {
    it('should use tenant from context over default', async () => {
      const context: ContextAccessors = {
        getCorrelationId: () => undefined,
        getCausationId: () => undefined,
        getUserId: () => undefined,
        getTenantId: () => 'ctx-tenant',
      };

      const a = new OutboxEventBusAdapter({
        prisma: mockPrisma as any,
        context,
        defaultTenantId: 'fallback-tenant',
      });

      const event = new TestLeadCreatedEvent('lead-1', 'a@example.com');
      await a.publish(event);

      const createCall = mockPrisma.domainEvent.create.mock.calls[0][0];
      expect(createCall.data.tenantId).toBe('ctx-tenant');
    });

    it('should fall back to defaultTenantId when context returns undefined', async () => {
      const context: ContextAccessors = {
        getCorrelationId: () => undefined,
        getCausationId: () => undefined,
        getUserId: () => undefined,
        getTenantId: () => undefined,
      };

      const a = new OutboxEventBusAdapter({
        prisma: mockPrisma as any,
        context,
        defaultTenantId: 'fallback-tenant',
      });

      const event = new TestLeadCreatedEvent('lead-1', 'a@example.com');
      await a.publish(event);

      const createCall = mockPrisma.domainEvent.create.mock.calls[0][0];
      expect(createCall.data.tenantId).toBe('fallback-tenant');
    });
  });

  describe('error propagation', () => {
    it('should propagate Prisma create errors', async () => {
      mockPrisma.domainEvent.create.mockRejectedValue(new Error('DB write failed'));

      const event = new TestLeadCreatedEvent('lead-err', 'err@example.com');
      await expect(adapter.publish(event)).rejects.toThrow('DB write failed');
    });

    it('should propagate Prisma findFirst errors', async () => {
      mockPrisma.domainEvent.findFirst.mockRejectedValue(new Error('DB read failed'));

      const event = new TestLeadCreatedEvent('lead-err', 'err@example.com');
      await expect(adapter.publish(event)).rejects.toThrow('DB read failed');
    });

    it('should propagate transaction errors in publishAll', async () => {
      const { withTransaction } = await import('@intelliflow/db');
      vi.mocked(withTransaction).mockRejectedValue(new Error('Transaction failed'));

      const events = [new TestLeadCreatedEvent('lead-1', 'a@example.com')];
      await expect(adapter.publishAll(events)).rejects.toThrow('Transaction failed');
    });
  });
});
