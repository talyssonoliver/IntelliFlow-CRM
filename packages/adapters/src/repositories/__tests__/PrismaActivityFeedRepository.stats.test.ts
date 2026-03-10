import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaActivityFeedRepository } from '../PrismaActivityFeedRepository';
import type { PrismaClient } from '@intelliflow/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-stats-test';
const WINDOW_START = new Date('2026-03-01T00:00:00Z');
const WINDOW_END = new Date('2026-03-10T12:00:00Z');

function createMockPrisma(): Record<string, any> {
  const makeModel = () => ({
    groupBy: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  });
  return {
    leadActivity: makeModel(),
    contactActivity: makeModel(),
    activityEvent: makeModel(),
    ticketActivity: makeModel(),
    emailRecord: makeModel(),
    callRecord: makeModel(),
    chatMessage: makeModel(),
    // Stubs for other methods used by getUnifiedFeed/getEntityFeed
    $transaction: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PrismaActivityFeedRepository.getStats', () => {
  let mockPrisma: Record<string, any>;
  let repo: PrismaActivityFeedRepository;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    repo = new PrismaActivityFeedRepository(mockPrisma as unknown as PrismaClient);
  });

  it('counts across all 7 source tables', async () => {
    const stats = await repo.getStats(TENANT_ID, WINDOW_START, WINDOW_END, {});

    // Should have called groupBy on all 7 tables
    expect(mockPrisma.leadActivity.groupBy).toHaveBeenCalled();
    expect(mockPrisma.contactActivity.groupBy).toHaveBeenCalled();
    expect(mockPrisma.activityEvent.groupBy).toHaveBeenCalled();
    expect(mockPrisma.ticketActivity.groupBy).toHaveBeenCalled();
    expect(mockPrisma.emailRecord.count).toHaveBeenCalled();
    expect(mockPrisma.callRecord.count).toHaveBeenCalled();
    expect(mockPrisma.chatMessage.count).toHaveBeenCalled();

    expect(stats.total).toBe(0);
    expect(stats.byType).toEqual([]);
    expect(stats.bySource).toEqual([]);
    expect(stats.byEntityType).toEqual([]);
  });

  it('uses timestamp field for LeadActivity, ContactActivity, ActivityEvent, TicketActivity', async () => {
    await repo.getStats(TENANT_ID, WINDOW_START, WINDOW_END, {});

    for (const model of ['leadActivity', 'contactActivity', 'activityEvent', 'ticketActivity']) {
      const call = mockPrisma[model].groupBy.mock.calls[0];
      const where = call[0].where;
      expect(where.timestamp).toBeDefined();
      expect(where.timestamp.gte).toEqual(WINDOW_START);
      expect(where.timestamp.lte).toEqual(WINDOW_END);
    }
  });

  it('uses createdAt field for EmailRecord and ChatMessage', async () => {
    await repo.getStats(TENANT_ID, WINDOW_START, WINDOW_END, {});

    for (const model of ['emailRecord', 'chatMessage']) {
      const call = mockPrisma[model].count.mock.calls[0];
      const where = call[0].where;
      expect(where.createdAt).toBeDefined();
      expect(where.createdAt.gte).toEqual(WINDOW_START);
      expect(where.createdAt.lte).toEqual(WINDOW_END);
    }
  });

  it('uses startedAt field for CallRecord', async () => {
    await repo.getStats(TENANT_ID, WINDOW_START, WINDOW_END, {});

    const call = mockPrisma.callRecord.count.mock.calls[0];
    const where = call[0].where;
    expect(where.startedAt).toBeDefined();
    expect(where.startedAt.gte).toEqual(WINDOW_START);
    expect(where.startedAt.lte).toEqual(WINDOW_END);
  });

  it('applies tenantId filter to all queries', async () => {
    await repo.getStats(TENANT_ID, WINDOW_START, WINDOW_END, {});

    // groupBy models
    for (const model of ['leadActivity', 'contactActivity', 'activityEvent', 'ticketActivity']) {
      const where = mockPrisma[model].groupBy.mock.calls[0][0].where;
      expect(where.tenantId).toBe(TENANT_ID);
    }

    // count models
    for (const model of ['emailRecord', 'callRecord', 'chatMessage']) {
      const where = mockPrisma[model].count.mock.calls[0][0].where;
      expect(where.tenantId).toBe(TENANT_ID);
    }
  });

  it('handles empty result sets (returns zero counts)', async () => {
    const stats = await repo.getStats(TENANT_ID, WINDOW_START, WINDOW_END, {});

    expect(stats.total).toBe(0);
    expect(stats.byType).toEqual([]);
    expect(stats.bySource).toEqual([]);
    expect(stats.byEntityType).toEqual([]);
  });

  it('groups by type using existing type maps (raw → normalized)', async () => {
    // LeadActivity returns grouped counts with raw DB types
    mockPrisma.leadActivity.groupBy.mockResolvedValue([
      { type: 'WEB_FORM', _count: { _all: 3 } },
      { type: 'EMAIL', _count: { _all: 5 } },
      { type: 'NOTE', _count: { _all: 2 } },
    ]);

    const stats = await repo.getStats(TENANT_ID, WINDOW_START, WINDOW_END, {});

    // WEB_FORM → SYSTEM, EMAIL → EMAIL, NOTE → NOTE
    const systemCount = stats.byType.find((t) => t.type === 'SYSTEM');
    const emailCount = stats.byType.find((t) => t.type === 'EMAIL');
    const noteCount = stats.byType.find((t) => t.type === 'NOTE');
    expect(systemCount?.count).toBe(3);
    expect(emailCount?.count).toBe(5);
    expect(noteCount?.count).toBe(2);
    expect(stats.total).toBe(10);
  });

  it('applies optional source filter (reduces queried tables)', async () => {
    await repo.getStats(TENANT_ID, WINDOW_START, WINDOW_END, {
      sources: ['LEAD_ACTIVITY', 'EMAIL'],
    });

    expect(mockPrisma.leadActivity.groupBy).toHaveBeenCalled();
    expect(mockPrisma.emailRecord.count).toHaveBeenCalled();

    // Other tables should NOT be queried
    expect(mockPrisma.contactActivity.groupBy).not.toHaveBeenCalled();
    expect(mockPrisma.activityEvent.groupBy).not.toHaveBeenCalled();
    expect(mockPrisma.ticketActivity.groupBy).not.toHaveBeenCalled();
    expect(mockPrisma.callRecord.count).not.toHaveBeenCalled();
    expect(mockPrisma.chatMessage.count).not.toHaveBeenCalled();
  });

  it('applies optional entityType filter to narrow source tables', async () => {
    await repo.getStats(TENANT_ID, WINDOW_START, WINDOW_END, {
      entityType: 'LEAD',
    });

    // LEAD maps to LEAD_ACTIVITY only
    expect(mockPrisma.leadActivity.groupBy).toHaveBeenCalled();
    expect(mockPrisma.contactActivity.groupBy).not.toHaveBeenCalled();
    expect(mockPrisma.activityEvent.groupBy).not.toHaveBeenCalled();
    expect(mockPrisma.ticketActivity.groupBy).not.toHaveBeenCalled();
    expect(mockPrisma.emailRecord.count).not.toHaveBeenCalled();
    expect(mockPrisma.callRecord.count).not.toHaveBeenCalled();
    expect(mockPrisma.chatMessage.count).not.toHaveBeenCalled();
  });

  it('derives byEntityType from bySource using entitySourceMap', async () => {
    // CONTACT entity type has sources: CONTACT_ACTIVITY, EMAIL, CALL, CHAT
    mockPrisma.contactActivity.groupBy.mockResolvedValue([
      { type: 'EMAIL', _count: { _all: 4 } },
    ]);
    mockPrisma.emailRecord.count.mockResolvedValue(3);
    mockPrisma.callRecord.count.mockResolvedValue(2);
    mockPrisma.chatMessage.count.mockResolvedValue(1);

    const stats = await repo.getStats(TENANT_ID, WINDOW_START, WINDOW_END, {});

    const contactEntityType = stats.byEntityType.find((e) => e.entityType === 'CONTACT');
    // CONTACT = CONTACT_ACTIVITY(4) + EMAIL(3) + CALL(2) + CHAT(1) = 10
    expect(contactEntityType?.count).toBe(10);
  });

  it('omits windowStart from WHERE when null (all-time)', async () => {
    await repo.getStats(TENANT_ID, null, WINDOW_END, {});

    // Should only have lte, not gte
    const leadWhere = mockPrisma.leadActivity.groupBy.mock.calls[0][0].where;
    expect(leadWhere.timestamp.gte).toBeUndefined();
    expect(leadWhere.timestamp.lte).toEqual(WINDOW_END);
  });
});
