/**
 * PrismaOutboxRepository Implementation Tests
 *
 * Tests the actual PrismaOutboxRepository class (not the interface mock).
 * The original test file only tests the interface contract with mocked fns.
 * This file tests the real implementation with a mock Prisma client.
 *
 * @task IFC-150
 * Coverage target: 100% of PrismaOutboxRepository
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaOutboxRepository } from '../PrismaOutboxRepository';

// Create a mock EventStatus enum to match @prisma/client
const EventStatus = {
  PENDING: 'PENDING' as const,
  PROCESSING: 'PROCESSING' as const,
  PROCESSED: 'PROCESSED' as const,
  FAILED: 'FAILED' as const,
  DEAD_LETTER: 'DEAD_LETTER' as const,
  ARCHIVED: 'ARCHIVED' as const,
};

// Mock Prisma Client
const createMockPrismaClient = () => ({
  $queryRaw: vi.fn(),
  domainEvent: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    groupBy: vi.fn(),
  },
});

// Helper to create a mock domain event from DB
const createMockDbEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'evt-001',
  eventType: 'lead.created',
  aggregateType: 'Lead',
  aggregateId: 'lead-001',
  payload: { leadId: 'lead-001', source: 'WEBSITE' },
  metadata: {
    correlationId: 'corr-001',
    causationId: 'cause-001',
    userId: 'user-001',
    tenantId: 'tenant-001',
    timestamp: '2025-06-15T10:00:00Z',
    version: '1.0',
  },
  status: EventStatus.PENDING,
  retryCount: 0,
  nextRetryAt: null,
  lastError: null,
  occurredAt: new Date('2025-06-15T10:00:00Z'),
  publishedAt: null,
  tenantId: 'tenant-001',
  processedAt: null,
  ...overrides,
});

describe('PrismaOutboxRepository', () => {
  let repository: PrismaOutboxRepository;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    repository = new PrismaOutboxRepository(mockPrisma as any);
  });

  describe('fetchPendingEvents()', () => {
    it('should execute raw SQL query with correct limit', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([createMockDbEvent()]);

      const result = await repository.fetchPendingEvents(10);

      expect(result).toHaveLength(1);
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it('should map raw query results to OutboxEvent objects', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([createMockDbEvent()]);

      const result = await repository.fetchPendingEvents(10);

      expect(result[0]).toEqual({
        id: 'evt-001',
        eventType: 'lead.created',
        aggregateType: 'Lead',
        aggregateId: 'lead-001',
        payload: { leadId: 'lead-001', source: 'WEBSITE' },
        metadata: {
          correlationId: 'corr-001',
          causationId: 'cause-001',
          userId: 'user-001',
          tenantId: 'tenant-001',
          timestamp: '2025-06-15T10:00:00Z',
          version: '1.0',
        },
        status: 'pending',
        retryCount: 0,
        nextRetryAt: undefined,
        lastError: undefined,
        createdAt: new Date('2025-06-15T10:00:00Z'),
        publishedAt: undefined,
      });
    });

    it('should return empty array when no pending events', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await repository.fetchPendingEvents(100);

      expect(result).toHaveLength(0);
    });

    it('should handle events with nextRetryAt set', async () => {
      const retryAt = new Date('2025-06-15T10:05:00Z');
      mockPrisma.$queryRaw.mockResolvedValue([
        createMockDbEvent({ nextRetryAt: retryAt, retryCount: 2 }),
      ]);

      const result = await repository.fetchPendingEvents(10);

      expect(result[0].nextRetryAt).toEqual(retryAt);
      expect(result[0].retryCount).toBe(2);
    });

    it('should handle events with lastError set', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        createMockDbEvent({ lastError: 'Connection timeout' }),
      ]);

      const result = await repository.fetchPendingEvents(10);

      expect(result[0].lastError).toBe('Connection timeout');
    });
  });

  describe('markAsPublished()', () => {
    it('should update event status to PROCESSED with timestamps', async () => {
      mockPrisma.domainEvent.update.mockResolvedValue({});

      await repository.markAsPublished('evt-001');

      expect(mockPrisma.domainEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-001' },
        data: {
          status: 'PROCESSED',
          publishedAt: expect.any(Date),
          processedAt: expect.any(Date),
        },
      });
    });

    it('should set publishedAt and processedAt to current time', async () => {
      mockPrisma.domainEvent.update.mockResolvedValue({});
      const beforeCall = Date.now();

      await repository.markAsPublished('evt-002');

      const afterCall = Date.now();
      const callData = mockPrisma.domainEvent.update.mock.calls[0][0].data;
      const publishedAt = callData.publishedAt as Date;
      const processedAt = callData.processedAt as Date;

      expect(publishedAt.getTime()).toBeGreaterThanOrEqual(beforeCall);
      expect(publishedAt.getTime()).toBeLessThanOrEqual(afterCall);
      expect(processedAt.getTime()).toBeGreaterThanOrEqual(beforeCall);
      expect(processedAt.getTime()).toBeLessThanOrEqual(afterCall);
    });
  });

  describe('scheduleRetry()', () => {
    it('should update event with retry info keeping status PENDING', async () => {
      mockPrisma.domainEvent.update.mockResolvedValue({});
      const nextRetryAt = new Date('2025-06-15T10:10:00Z');

      await repository.scheduleRetry('evt-001', 2, nextRetryAt, 'Temporary failure');

      expect(mockPrisma.domainEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-001' },
        data: {
          status: 'PENDING',
          retryCount: 2,
          nextRetryAt,
          lastError: 'Temporary failure',
        },
      });
    });

    it('should handle first retry (retryCount = 1)', async () => {
      mockPrisma.domainEvent.update.mockResolvedValue({});
      const nextRetryAt = new Date();

      await repository.scheduleRetry('evt-003', 1, nextRetryAt, 'First failure');

      expect(mockPrisma.domainEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-003' },
        data: expect.objectContaining({
          retryCount: 1,
          lastError: 'First failure',
        }),
      });
    });
  });

  describe('moveToDeadLetter()', () => {
    it('should update event status to DEAD_LETTER with error', async () => {
      mockPrisma.domainEvent.update.mockResolvedValue({});

      await repository.moveToDeadLetter('evt-001', 'Max retries exceeded');

      expect(mockPrisma.domainEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-001' },
        data: {
          status: 'DEAD_LETTER',
          lastError: 'Max retries exceeded',
        },
      });
    });

    it('should record the final error message', async () => {
      mockPrisma.domainEvent.update.mockResolvedValue({});
      const longError = 'A'.repeat(500);

      await repository.moveToDeadLetter('evt-002', longError);

      const callData = mockPrisma.domainEvent.update.mock.calls[0][0].data;
      expect(callData.lastError).toBe(longError);
    });
  });

  describe('getEventById()', () => {
    it('should return mapped event when found', async () => {
      mockPrisma.domainEvent.findUnique.mockResolvedValue(
        createMockDbEvent({ publishedAt: new Date('2025-06-15T10:05:00Z'), status: 'PROCESSED' })
      );

      const result = await repository.getEventById('evt-001');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('evt-001');
      expect(result!.eventType).toBe('lead.created');
      expect(result!.status).toBe('published'); // PROCESSED maps to published
      expect(result!.publishedAt).toEqual(new Date('2025-06-15T10:05:00Z'));
    });

    it('should return null when event not found', async () => {
      mockPrisma.domainEvent.findUnique.mockResolvedValue(null);

      const result = await repository.getEventById('non-existent');

      expect(result).toBeNull();
    });

    it('should query by event ID', async () => {
      mockPrisma.domainEvent.findUnique.mockResolvedValue(null);

      await repository.getEventById('specific-id');

      expect(mockPrisma.domainEvent.findUnique).toHaveBeenCalledWith({
        where: { id: 'specific-id' },
      });
    });
  });

  describe('createEvent()', () => {
    it('should create a new event with PENDING status', async () => {
      const dbEvent = createMockDbEvent();
      mockPrisma.domainEvent.create.mockResolvedValue(dbEvent);

      const result = await repository.createEvent({
        eventType: 'lead.created',
        aggregateType: 'Lead',
        aggregateId: 'lead-001',
        payload: { leadId: 'lead-001' },
        metadata: { correlationId: 'corr-001' },
        tenantId: 'tenant-001',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('evt-001');
      expect(result.status).toBe('pending');

      expect(mockPrisma.domainEvent.create).toHaveBeenCalledWith({
        data: {
          eventType: 'lead.created',
          aggregateType: 'Lead',
          aggregateId: 'lead-001',
          payload: { leadId: 'lead-001' },
          metadata: { correlationId: 'corr-001' },
          tenantId: 'tenant-001',
          status: 'PENDING',
          retryCount: 0,
        },
      });
    });

    it('should return mapped OutboxEvent from created event', async () => {
      const publishDate = new Date('2025-06-15T10:05:00Z');
      mockPrisma.domainEvent.create.mockResolvedValue(
        createMockDbEvent({ publishedAt: publishDate })
      );

      const result = await repository.createEvent({
        eventType: 'lead.scored',
        aggregateType: 'Lead',
        aggregateId: 'lead-002',
        payload: { score: 85 },
        metadata: { correlationId: 'corr-002' },
        tenantId: 'tenant-001',
      });

      expect(result.publishedAt).toEqual(publishDate);
    });
  });

  describe('existsByIdempotencyKey()', () => {
    it('should return true when event with idempotency key exists', async () => {
      mockPrisma.domainEvent.findFirst.mockResolvedValue({ id: 'evt-existing' });

      const result = await repository.existsByIdempotencyKey('idem-key-123');

      expect(result).toBe(true);
      expect(mockPrisma.domainEvent.findFirst).toHaveBeenCalledWith({
        where: {
          metadata: {
            path: ['idempotencyKey'],
            equals: 'idem-key-123',
          },
        },
        select: { id: true },
      });
    });

    it('should return false when no event with idempotency key exists', async () => {
      mockPrisma.domainEvent.findFirst.mockResolvedValue(null);

      const result = await repository.existsByIdempotencyKey('non-existent-key');

      expect(result).toBe(false);
    });
  });

  describe('getStats()', () => {
    it('should return counts grouped by status', async () => {
      mockPrisma.domainEvent.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { status: 10 } },
        { status: 'PROCESSING', _count: { status: 5 } },
        { status: 'PROCESSED', _count: { status: 100 } },
        { status: 'FAILED', _count: { status: 3 } },
        { status: 'DEAD_LETTER', _count: { status: 1 } },
      ]);

      const stats = await repository.getStats();

      expect(stats).toEqual({
        pending: 10,
        processing: 5,
        processed: 100,
        failed: 3,
        deadLetter: 1,
      });
    });

    it('should return zeros for missing statuses', async () => {
      mockPrisma.domainEvent.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { status: 2 } },
      ]);

      const stats = await repository.getStats();

      expect(stats).toEqual({
        pending: 2,
        processing: 0,
        processed: 0,
        failed: 0,
        deadLetter: 0,
      });
    });

    it('should return all zeros when no events exist', async () => {
      mockPrisma.domainEvent.groupBy.mockResolvedValue([]);

      const stats = await repository.getStats();

      expect(stats).toEqual({
        pending: 0,
        processing: 0,
        processed: 0,
        failed: 0,
        deadLetter: 0,
      });
    });

    it('should call groupBy with correct parameters', async () => {
      mockPrisma.domainEvent.groupBy.mockResolvedValue([]);

      await repository.getStats();

      expect(mockPrisma.domainEvent.groupBy).toHaveBeenCalledWith({
        by: ['status'],
        _count: { status: true },
      });
    });
  });

  describe('status mapping (mapPrismaStatus)', () => {
    // Test status mapping via getEventById which uses mapToOutboxEvent/mapPrismaStatus

    it('should map PENDING to pending', async () => {
      mockPrisma.domainEvent.findUnique.mockResolvedValue(createMockDbEvent({ status: 'PENDING' }));
      const result = await repository.getEventById('test');
      expect(result!.status).toBe('pending');
    });

    it('should map PROCESSING to pending', async () => {
      mockPrisma.domainEvent.findUnique.mockResolvedValue(
        createMockDbEvent({ status: 'PROCESSING' })
      );
      const result = await repository.getEventById('test');
      expect(result!.status).toBe('pending');
    });

    it('should map PROCESSED to published', async () => {
      mockPrisma.domainEvent.findUnique.mockResolvedValue(
        createMockDbEvent({ status: 'PROCESSED' })
      );
      const result = await repository.getEventById('test');
      expect(result!.status).toBe('published');
    });

    it('should map FAILED to failed', async () => {
      mockPrisma.domainEvent.findUnique.mockResolvedValue(createMockDbEvent({ status: 'FAILED' }));
      const result = await repository.getEventById('test');
      expect(result!.status).toBe('failed');
    });

    it('should map DEAD_LETTER to dead_letter', async () => {
      mockPrisma.domainEvent.findUnique.mockResolvedValue(
        createMockDbEvent({ status: 'DEAD_LETTER' })
      );
      const result = await repository.getEventById('test');
      expect(result!.status).toBe('dead_letter');
    });

    it('should map ARCHIVED to published', async () => {
      mockPrisma.domainEvent.findUnique.mockResolvedValue(
        createMockDbEvent({ status: 'ARCHIVED' })
      );
      const result = await repository.getEventById('test');
      expect(result!.status).toBe('published');
    });
  });

  describe('metadata mapping (mapToOutboxEvent)', () => {
    it('should use default values for missing metadata fields', async () => {
      mockPrisma.domainEvent.findUnique.mockResolvedValue(createMockDbEvent({ metadata: {} }));

      const result = await repository.getEventById('test');

      expect(result!.metadata.correlationId).toBe('');
      expect(result!.metadata.causationId).toBeUndefined();
      expect(result!.metadata.userId).toBeUndefined();
      expect(result!.metadata.tenantId).toBeUndefined();
      expect(result!.metadata.version).toBe('1.0');
      // timestamp should fallback to occurredAt ISO string
      expect(result!.metadata.timestamp).toBe(new Date('2025-06-15T10:00:00Z').toISOString());
    });

    it('should handle null metadata', async () => {
      mockPrisma.domainEvent.findUnique.mockResolvedValue(createMockDbEvent({ metadata: null }));

      const result = await repository.getEventById('test');

      expect(result!.metadata.correlationId).toBe('');
      expect(result!.metadata.version).toBe('1.0');
    });

    it('should handle null payload', async () => {
      mockPrisma.domainEvent.findUnique.mockResolvedValue(createMockDbEvent({ payload: null }));

      const result = await repository.getEventById('test');

      expect(result!.payload).toEqual({});
    });
  });
});
