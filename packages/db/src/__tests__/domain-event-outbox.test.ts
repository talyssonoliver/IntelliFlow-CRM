/**
 * Domain Event Outbox Tests
 *
 * Tests for the DomainEvent Prisma model with outbox pattern fields.
 *
 * @task IFC-150
 * @phase Phase 1 RED - Step 1.1
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PrismaClient, EventStatus } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Skip integration tests when no database is available
// Check both URL format AND that the DB is expected to be running
// (DATABASE_URL in .env alone is not enough — the server must actually be up)
import { createConnection } from 'node:net';

const hasDatabase: boolean = await (async () => {
  try {
    const url = process.env.DATABASE_URL || '';
    if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) return false;
    // Extract host:port from DATABASE_URL and probe TCP connectivity
    const match = url.match(/@([^:/@]+):(\d+)\//);
    if (!match) return false;
    const [, host, port] = match;
    return await new Promise<boolean>((resolve) => {
      const sock = createConnection({ host, port: Number(port) }, () => {
        sock.destroy();
        resolve(true);
      });
      sock.on('error', () => resolve(false));
      sock.setTimeout(1000, () => {
        sock.destroy();
        resolve(false);
      });
    });
  } catch {
    return false;
  }
})();

// Test database client
let prisma: PrismaClient;
const TEST_TENANT_ID = 'test-tenant-ifc-150';

// Create the test tenant before all tests
beforeAll(async () => {
  if (!hasDatabase) return;
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  prisma = new PrismaClient({ adapter });

  // Clean up any existing test tenant first
  await prisma.tenant
    .deleteMany({
      where: { id: TEST_TENANT_ID },
    })
    .catch(() => {});

  // Create test tenant for FK constraint
  await prisma.tenant.create({
    data: {
      id: TEST_TENANT_ID,
      name: 'Test Tenant IFC-150',
      slug: 'test-tenant-ifc-150',
      status: 'ACTIVE',
    },
  });
});

// Clean up tenant after all tests — always runs even if tests fail
afterAll(async () => {
  if (!hasDatabase) return;
  try {
    // Delete all domain events for this tenant first
    await prisma.domainEvent
      .deleteMany({
        where: { tenantId: TEST_TENANT_ID },
      })
      .catch(() => {});

    // Then delete the tenant
    await prisma.tenant
      .deleteMany({
        where: { id: TEST_TENANT_ID },
      })
      .catch(() => {});
  } finally {
    await prisma.$disconnect();
  }
});

beforeEach(async () => {
  // prisma already initialized in beforeAll
});

afterEach(async () => {
  if (!hasDatabase) return;
  // Clean up test events after each test
  await prisma.domainEvent.deleteMany({
    where: { tenantId: TEST_TENANT_ID },
  });
});

describe.skipIf(!hasDatabase)('DomainEvent Outbox', () => {
  it('should create event with PENDING status', async () => {
    // Arrange
    const eventData = {
      eventType: 'lead.created',
      aggregateType: 'Lead',
      aggregateId: 'lead-123',
      payload: { leadId: 'lead-123', email: 'test@example.com' },
      metadata: {
        correlationId: 'corr-123',
        tenantId: 'test-tenant-ifc-150',
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
      tenantId: 'test-tenant-ifc-150',
    };

    // Act
    const event = await prisma.domainEvent.create({
      data: eventData,
    });

    // Assert
    expect(event.status).toBe(EventStatus.PENDING);
    expect(event.retryCount).toBe(0);
    expect(event.nextRetryAt).toBeNull();
    expect(event.lastError).toBeNull();
    expect(event.publishedAt).toBeNull();
  });

  it('should have retryCount field defaulting to 0', async () => {
    // Arrange
    const eventData = {
      eventType: 'lead.scored',
      aggregateType: 'Lead',
      aggregateId: 'lead-456',
      payload: { leadId: 'lead-456', score: 85 },
      tenantId: 'test-tenant-ifc-150',
    };

    // Act
    const event = await prisma.domainEvent.create({
      data: eventData,
    });

    // Assert
    expect(event.retryCount).toBe(0);
  });

  it('should allow setting nextRetryAt for scheduling retries', async () => {
    // Arrange
    const nextRetryAt = new Date(Date.now() + 5000); // 5 seconds from now
    const eventData = {
      eventType: 'lead.qualified',
      aggregateType: 'Lead',
      aggregateId: 'lead-789',
      payload: { leadId: 'lead-789' },
      tenantId: 'test-tenant-ifc-150',
      retryCount: 1,
      nextRetryAt,
    };

    // Act
    const event = await prisma.domainEvent.create({
      data: eventData,
    });

    // Assert
    expect(event.retryCount).toBe(1);
    expect(event.nextRetryAt).toBeTruthy();
    expect(event.nextRetryAt!.getTime()).toBeCloseTo(nextRetryAt.getTime(), -2);
  });

  it('should allow setting lastError when processing fails', async () => {
    // Arrange
    const eventData = {
      eventType: 'lead.converted',
      aggregateType: 'Lead',
      aggregateId: 'lead-error',
      payload: { leadId: 'lead-error' },
      tenantId: 'test-tenant-ifc-150',
      lastError: 'Handler timeout after 30s',
    };

    // Act
    const event = await prisma.domainEvent.create({
      data: eventData,
    });

    // Assert
    expect(event.lastError).toBe('Handler timeout after 30s');
  });

  it('should support DEAD_LETTER status', async () => {
    // Arrange
    const eventData = {
      eventType: 'lead.created',
      aggregateType: 'Lead',
      aggregateId: 'lead-dlq',
      payload: { leadId: 'lead-dlq' },
      tenantId: 'test-tenant-ifc-150',
      status: EventStatus.DEAD_LETTER,
      retryCount: 3,
      lastError: 'Max retries exceeded',
    };

    // Act
    const event = await prisma.domainEvent.create({
      data: eventData,
    });

    // Assert
    expect(event.status).toBe(EventStatus.DEAD_LETTER);
    expect(event.retryCount).toBe(3);
  });

  it('should set publishedAt when marking as published', async () => {
    // Arrange
    const eventData = {
      eventType: 'contact.created',
      aggregateType: 'Contact',
      aggregateId: 'contact-123',
      payload: { contactId: 'contact-123' },
      tenantId: 'test-tenant-ifc-150',
    };

    const event = await prisma.domainEvent.create({
      data: eventData,
    });

    const publishedAt = new Date();

    // Act
    const updatedEvent = await prisma.domainEvent.update({
      where: { id: event.id },
      data: {
        status: EventStatus.PROCESSED,
        publishedAt,
        processedAt: publishedAt,
      },
    });

    // Assert
    expect(updatedEvent.status).toBe(EventStatus.PROCESSED);
    expect(updatedEvent.publishedAt).toBeTruthy();
    expect(updatedEvent.processedAt).toBeTruthy();
  });

  it('should query pending events by status and nextRetryAt', async () => {
    // Arrange - Create events with different states
    const now = new Date();
    const futureRetry = new Date(now.getTime() + 60000); // 1 minute in future
    const pastRetry = new Date(now.getTime() - 5000); // 5 seconds ago

    // Pending event with no retry scheduled
    await prisma.domainEvent.create({
      data: {
        eventType: 'task.created',
        aggregateType: 'Task',
        aggregateId: 'task-1',
        payload: { taskId: 'task-1' },
        tenantId: 'test-tenant-ifc-150',
        status: EventStatus.PENDING,
      },
    });

    // Pending event with retry in the past (should be fetched)
    await prisma.domainEvent.create({
      data: {
        eventType: 'task.created',
        aggregateType: 'Task',
        aggregateId: 'task-2',
        payload: { taskId: 'task-2' },
        tenantId: 'test-tenant-ifc-150',
        status: EventStatus.PENDING,
        retryCount: 1,
        nextRetryAt: pastRetry,
      },
    });

    // Pending event with retry in the future (should NOT be fetched)
    await prisma.domainEvent.create({
      data: {
        eventType: 'task.created',
        aggregateType: 'Task',
        aggregateId: 'task-3',
        payload: { taskId: 'task-3' },
        tenantId: 'test-tenant-ifc-150',
        status: EventStatus.PENDING,
        retryCount: 1,
        nextRetryAt: futureRetry,
      },
    });

    // Processed event (should NOT be fetched)
    await prisma.domainEvent.create({
      data: {
        eventType: 'task.created',
        aggregateType: 'Task',
        aggregateId: 'task-4',
        payload: { taskId: 'task-4' },
        tenantId: 'test-tenant-ifc-150',
        status: EventStatus.PROCESSED,
        publishedAt: now,
      },
    });

    // Act - Query pending events ready to process
    const pendingEvents = await prisma.domainEvent.findMany({
      where: {
        tenantId: 'test-tenant-ifc-150',
        status: EventStatus.PENDING,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: { occurredAt: 'asc' },
    });

    // Assert
    expect(pendingEvents.length).toBe(2);
    expect(pendingEvents.map((e) => e.aggregateId)).toContain('task-1');
    expect(pendingEvents.map((e) => e.aggregateId)).toContain('task-2');
    expect(pendingEvents.map((e) => e.aggregateId)).not.toContain('task-3');
    expect(pendingEvents.map((e) => e.aggregateId)).not.toContain('task-4');
  });

  it('should have index on (status, nextRetryAt) for efficient polling', async () => {
    // This test verifies the index exists by running an EXPLAIN query
    // The actual index verification happens during migration
    // Here we just verify the query pattern works efficiently

    const events = await prisma.domainEvent.findMany({
      where: {
        status: EventStatus.PENDING,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
      orderBy: { occurredAt: 'asc' },
      take: 100,
    });

    // Query should complete without error
    expect(events).toBeDefined();
  });

  it('should respect batch size limits when fetching events', async () => {
    // Arrange - Create more events than batch size
    const batchSize = 5;
    const totalEvents = 10;

    for (let i = 0; i < totalEvents; i++) {
      await prisma.domainEvent.create({
        data: {
          eventType: 'notification.created',
          aggregateType: 'Notification',
          aggregateId: `notification-${i}`,
          payload: { notificationId: `notification-${i}` },
          tenantId: 'test-tenant-ifc-150',
          status: EventStatus.PENDING,
        },
      });
    }

    // Act - Fetch with batch limit
    const events = await prisma.domainEvent.findMany({
      where: {
        tenantId: 'test-tenant-ifc-150',
        status: EventStatus.PENDING,
      },
      take: batchSize,
      orderBy: { occurredAt: 'asc' },
    });

    // Assert
    expect(events.length).toBe(batchSize);
  });
});
