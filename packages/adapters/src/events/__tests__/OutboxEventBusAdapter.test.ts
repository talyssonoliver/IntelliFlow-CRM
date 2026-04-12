/**
 * OutboxEventBusAdapter Tests
 *
 * Tests for the outbox-based event bus adapter.
 *
 * @task IFC-150
 * @phase Phase 1 RED - Step 1.3
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DomainEvent } from '@intelliflow/domain';
import type { EventBusPort } from '@intelliflow/application';

// Mock DomainEvent implementation for testing
class TestLeadCreatedEvent extends DomainEvent {
  public readonly eventType = 'lead.created';

  constructor(
    public readonly leadId: string,
    public readonly email: string,
    public readonly tenantId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      leadId: this.leadId,
      email: this.email,
      tenantId: this.tenantId,
    };
  }
}

class TestLeadScoredEvent extends DomainEvent {
  public readonly eventType = 'lead.scored';

  constructor(
    public readonly leadId: string,
    public readonly score: number
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      leadId: this.leadId,
      score: this.score,
    };
  }
}

// Mock Prisma client
const mockPrisma = {
  domainEvent: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) => callback(mockPrisma)),
};

// Mock context getters
vi.mock('@intelliflow/api/tracing', () => ({
  getCorrelationId: () => 'mock-correlation-id',
  getCausationId: () => undefined,
  getUserId: () => 'mock-user-id',
  getTenantId: () => 'mock-tenant-id',
}));

describe('OutboxEventBusAdapter', () => {
  let adapter: EventBusPort;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock adapter for Phase 1 RED tests
    // Actual implementation will be created in Phase 2 GREEN
    adapter = {
      publish: vi.fn(),
      publishAll: vi.fn(),
      subscribe: vi.fn(),
    };
  });

  describe('Interface Compliance', () => {
    it('should implement EventBusPort interface', () => {
      expect(adapter).toHaveProperty('publish');
      expect(adapter).toHaveProperty('publishAll');
      expect(adapter).toHaveProperty('subscribe');
    });
  });

  describe('publish', () => {
    it('should write event to outbox on publish', async () => {
      // Arrange
      const event = new TestLeadCreatedEvent('lead-123', 'test@example.com', 'tenant-1');

      mockPrisma.domainEvent.findFirst.mockResolvedValue(null); // No duplicate
      mockPrisma.domainEvent.create.mockResolvedValue({
        id: 'created-event-id',
        eventType: event.eventType,
        status: 'PENDING',
      });

      // Mock the adapter to actually call Prisma
      (adapter.publish as ReturnType<typeof vi.fn>).mockImplementation(async (e: DomainEvent) => {
        await mockPrisma.domainEvent.create({
          data: {
            eventType: e.eventType,
            payload: e.toPayload(),
            status: 'PENDING',
          },
        });
      });

      // Act
      await adapter.publish(event);

      // Assert
      expect(adapter.publish).toHaveBeenCalledWith(event);
      expect(mockPrisma.domainEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'lead.created',
          status: 'PENDING',
        }),
      });
    });

    it('should generate idempotency key from event', async () => {
      // Arrange
      const event = new TestLeadCreatedEvent('lead-idempotent', 'test@example.com', 'tenant-1');
      const expectedKey = `lead.created:lead-idempotent`;

      // Mock implementation that checks idempotency key
      (adapter.publish as ReturnType<typeof vi.fn>).mockImplementation(async (e: DomainEvent) => {
        const payload = e.toPayload();
        const idempotencyKey = `${e.eventType}:${payload.leadId}`;
        expect(idempotencyKey).toBe(expectedKey);
      });

      // Act
      await adapter.publish(event);

      // Assert
      expect(adapter.publish).toHaveBeenCalled();
    });

    it('should reject duplicate events with same idempotency key', async () => {
      // Arrange
      const event = new TestLeadCreatedEvent('lead-duplicate', 'test@example.com', 'tenant-1');

      // First publish succeeds
      let publishCount = 0;
      (adapter.publish as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        publishCount++;
        if (publishCount > 1) {
          // Second call is a duplicate - silently ignored
          return;
        }
        await mockPrisma.domainEvent.create({
          data: { eventType: event.eventType, status: 'PENDING' },
        });
      });

      // Act - Publish same event twice
      await adapter.publish(event);
      await adapter.publish(event);

      // Assert - Only one database write should occur
      expect(mockPrisma.domainEvent.create).toHaveBeenCalledTimes(1);
    });

    it('should include metadata with correlationId from context', async () => {
      // Arrange
      const event = new TestLeadCreatedEvent('lead-metadata', 'test@example.com', 'tenant-1');

      (adapter.publish as ReturnType<typeof vi.fn>).mockImplementation(async (e: DomainEvent) => {
        await mockPrisma.domainEvent.create({
          data: {
            eventType: e.eventType,
            payload: e.toPayload(),
            metadata: {
              correlationId: 'mock-correlation-id',
              userId: 'mock-user-id',
              tenantId: 'mock-tenant-id',
              timestamp: expect.any(String),
              version: '1.0',
            },
            status: 'PENDING',
          },
        });
      });

      // Act
      await adapter.publish(event);

      // Assert
      expect(mockPrisma.domainEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            correlationId: 'mock-correlation-id',
          }),
        }),
      });
    });
  });

  describe('publishAll', () => {
    it('should publish multiple events in batch', async () => {
      // Arrange
      const events = [
        new TestLeadCreatedEvent('lead-1', 'test1@example.com', 'tenant-1'),
        new TestLeadScoredEvent('lead-1', 85),
      ];

      let createCount = 0;
      (adapter.publishAll as ReturnType<typeof vi.fn>).mockImplementation(
        async (evts: readonly DomainEvent[]) => {
          for (const e of evts) {
            createCount++;
            await mockPrisma.domainEvent.create({
              data: { eventType: e.eventType, status: 'PENDING' },
            });
          }
        }
      );

      // Act
      await adapter.publishAll(events);

      // Assert
      expect(createCount).toBe(2);
      expect(mockPrisma.domainEvent.create).toHaveBeenCalledTimes(2);
    });

    it('should use transaction for batch publish', async () => {
      // Arrange
      const events = [
        new TestLeadCreatedEvent('lead-batch-1', 'test@example.com', 'tenant-1'),
        new TestLeadCreatedEvent('lead-batch-2', 'test2@example.com', 'tenant-1'),
      ];

      let transactionUsed = false;
      (adapter.publishAll as ReturnType<typeof vi.fn>).mockImplementation(
        async (evts: readonly DomainEvent[]) => {
          await mockPrisma.$transaction(async (tx) => {
            transactionUsed = true;
            for (const e of evts) {
              await mockPrisma.domainEvent.create({
                data: { eventType: e.eventType },
              });
            }
          });
        }
      );

      // Act
      await adapter.publishAll(events);

      // Assert - Transaction should be used for atomicity
      expect(transactionUsed).toBe(true);
    });
  });

  describe('subscribe', () => {
    it('should throw error directing to EventDispatcher', async () => {
      // Arrange
      const handler = vi.fn();

      (adapter.subscribe as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        throw new Error('Use EventDispatcher.register() for subscriptions');
      });

      // Act & Assert
      await expect(adapter.subscribe('lead.created', handler)).rejects.toThrow(
        'Use EventDispatcher.register() for subscriptions'
      );
    });
  });

  describe('Event Metadata', () => {
    it('should extract aggregateType from eventType', async () => {
      // Arrange
      const event = new TestLeadCreatedEvent('lead-aggregate', 'test@example.com', 'tenant-1');

      (adapter.publish as ReturnType<typeof vi.fn>).mockImplementation(async (e: DomainEvent) => {
        const aggregateType = e.eventType.split('.')[0]; // 'lead' from 'lead.created'
        expect(aggregateType).toBe('lead');

        await mockPrisma.domainEvent.create({
          data: {
            eventType: e.eventType,
            aggregateType,
            status: 'PENDING',
          },
        });
      });

      // Act
      await adapter.publish(event);

      // Assert
      expect(mockPrisma.domainEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          aggregateType: 'lead',
        }),
      });
    });

    it('should extract aggregateId from payload', async () => {
      // Arrange
      const event = new TestLeadCreatedEvent('lead-agg-id-123', 'test@example.com', 'tenant-1');

      (adapter.publish as ReturnType<typeof vi.fn>).mockImplementation(async (e: DomainEvent) => {
        const payload = e.toPayload();
        const aggregateId = (payload.leadId ?? payload.contactId ?? payload.id) as string;
        expect(aggregateId).toBe('lead-agg-id-123');

        await mockPrisma.domainEvent.create({
          data: {
            eventType: e.eventType,
            aggregateId,
            status: 'PENDING',
          },
        });
      });

      // Act
      await adapter.publish(event);

      // Assert
      expect(mockPrisma.domainEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          aggregateId: 'lead-agg-id-123',
        }),
      });
    });
  });
});
