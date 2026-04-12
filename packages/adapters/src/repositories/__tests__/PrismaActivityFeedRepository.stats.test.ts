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
    // OPTIMIZATION: getStats now uses $queryRaw UNION ALL for the 4 grouped tables.
    // Previously 4 separate groupBy() calls (~190ms each); now 1 round-trip (~200ms).
    $queryRaw: vi.fn().mockResolvedValue([]),
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

    // Single unified UNION ALL query replaces 4 separate groupBy() calls
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockPrisma.emailRecord.count).toHaveBeenCalled();
    expect(mockPrisma.callRecord.count).toHaveBeenCalled();
    expect(mockPrisma.chatMessage.count).toHaveBeenCalled();

    expect(stats.total).toBe(0);
    expect(stats.byType).toEqual([]);
    expect(stats.bySource).toEqual([]);
    expect(stats.byEntityType).toEqual([]);
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

    // The UNION ALL query passes tenantId as a bound parameter — verify it was called
    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    // The SQL template passed to $queryRaw includes the tenantId value
    const sqlArg = mockPrisma.$queryRaw.mock.calls[0][0];
    // Prisma.sql tagged templates produce an object with .values array
    const sqlValues: unknown[] = sqlArg?.values ?? [];
    expect(sqlValues).toContain(TENANT_ID);

    // count models also get tenantId
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
    // UNION ALL returns rows with source + raw DB type
    mockPrisma.$queryRaw.mockResolvedValue([
      { source: 'LEAD_ACTIVITY', type: 'WEB_FORM', count: 3n },
      { source: 'LEAD_ACTIVITY', type: 'EMAIL', count: 5n },
      { source: 'LEAD_ACTIVITY', type: 'NOTE', count: 2n },
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

  it('applies optional source filter — skips $queryRaw when no grouped sources match', async () => {
    // Only EMAIL source requested — no grouped tables needed
    await repo.getStats(TENANT_ID, WINDOW_START, WINDOW_END, {
      sources: ['EMAIL'],
    });

    // $queryRaw not called (no grouped sources in filter)
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(mockPrisma.emailRecord.count).toHaveBeenCalled();

    // Other models not queried
    expect(mockPrisma.callRecord.count).not.toHaveBeenCalled();
    expect(mockPrisma.chatMessage.count).not.toHaveBeenCalled();
  });

  it('applies optional source filter — UNION ALL includes only requested grouped sources', async () => {
    await repo.getStats(TENANT_ID, WINDOW_START, WINDOW_END, {
      sources: ['LEAD_ACTIVITY', 'EMAIL'],
    });

    // $queryRaw is called once (for LEAD_ACTIVITY only)
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockPrisma.emailRecord.count).toHaveBeenCalled();

    // Other single-type tables not called
    expect(mockPrisma.callRecord.count).not.toHaveBeenCalled();
    expect(mockPrisma.chatMessage.count).not.toHaveBeenCalled();
  });

  it('applies optional entityType filter to narrow source tables', async () => {
    await repo.getStats(TENANT_ID, WINDOW_START, WINDOW_END, {
      entityType: 'LEAD',
    });

    // LEAD maps to LEAD_ACTIVITY only — $queryRaw called once with single arm
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockPrisma.emailRecord.count).not.toHaveBeenCalled();
    expect(mockPrisma.callRecord.count).not.toHaveBeenCalled();
    expect(mockPrisma.chatMessage.count).not.toHaveBeenCalled();
  });

  it('derives byEntityType from bySource using entitySourceMap', async () => {
    // CONTACT entity type has sources: CONTACT_ACTIVITY, EMAIL, CALL, CHAT
    mockPrisma.$queryRaw.mockResolvedValue([
      { source: 'CONTACT_ACTIVITY', type: 'EMAIL', count: 4n },
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

    // $queryRaw should have been called
    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    const sqlArg = mockPrisma.$queryRaw.mock.calls[0][0];
    // The SQL values should NOT include a windowStart (null → no gte param)
    const sqlValues: unknown[] = sqlArg?.values ?? [];
    // WINDOW_START should not appear — only WINDOW_END and tenantId
    expect(sqlValues).not.toContain(WINDOW_START);
    expect(sqlValues).toContain(WINDOW_END);
  });
});
