/**
 * PG-203 — the scheduled scoring dispatcher leaves erased and restricted people out
 * (owner Q18; plan revision 1 should-fix 7), so it does not re-queue them on every run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

const queue = vi.hoisted(() => ({ add: vi.fn(), close: vi.fn() }));
const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  lead: { groupBy: vi.fn(), findMany: vi.fn() },
  processingRestriction: { findMany: vi.fn() },
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn(function Queue() {
    return queue;
  }),
}));
vi.mock('@intelliflow/platform/queues/connection', () => ({
  getBullMQConnectionOptions: () => ({}),
}));
vi.mock('@intelliflow/db', () => ({ prisma: db }));
vi.mock('../../chains/scoring.chain', () => ({ LeadScoringChain: vi.fn() }));
vi.mock('../../utils/audit-log', () => ({ logAIAgentAction: vi.fn() }));

import { DISPATCH_BATCH, processScoringJob, NIL_UUID, type ScoringJobData } from '../scoring.job';

const TENANT = '99999999-0000-4000-8000-000099999999';

function sentinel(): Job<ScoringJobData> {
  return {
    id: 'cron',
    data: {
      leadId: NIL_UUID,
      tenantId: TENANT,
      lead: { email: 'scheduled@system.internal', source: 'cron' },
    },
  } as unknown as Job<ScoringJobData>;
}

beforeEach(() => {
  vi.clearAllMocks();
  queue.add.mockResolvedValue(undefined);
  queue.close.mockResolvedValue(undefined);
  db.lead.groupBy.mockResolvedValue([{ tenantId: TENANT, _count: { id: 3 } }]);
  db.$queryRaw.mockResolvedValue([{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }]);
  db.lead.findMany.mockResolvedValue([
    { id: 'l1', email: 'ada@example.invalid', source: 'WEBSITE' },
    { id: 'l2', email: 'Bob@Example.invalid', source: 'WEBSITE' },
    { id: 'l3', email: 'erased-l3@erased.invalid', source: 'WEBSITE' },
  ]);
  db.processingRestriction.findMany.mockResolvedValue([{ subjectEmail: 'bob@example.invalid' }]);
});

describe('scheduled dispatcher and data requests', () => {
  const candidateSql = () => (db.$queryRaw.mock.calls[0]![0] as string[]).join('?');

  it('excludes erased and restricted people in SQL, on the normalised address, before the limit (codex)', async () => {
    await processScoringJob(sentinel());
    expect(db.lead.groupBy.mock.calls[0]![0].where.NOT).toEqual({
      email: { endsWith: '@erased.invalid' },
    });
    expect(candidateSql()).toContain("l.email NOT LIKE '%@erased.invalid'");
    expect(candidateSql()).toContain('NOT (dsar_normalise_email(l.email) = ANY(');
    expect(candidateSql()).toMatch(/ORDER BY l\.id\s+LIMIT \?$/);
    const values = db.$queryRaw.mock.calls[0]!.slice(1);
    expect(values[0]).toBe(TENANT);
    expect(values[1]).toEqual(['bob@example.invalid']);
    expect(values.at(-1)).toBe(DISPATCH_BATCH);
    expect(db.processingRestriction.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, liftedAt: null },
      select: { subjectEmail: true },
    });
    // One restriction read per tenant, shared by the query and the filter.
    expect(db.processingRestriction.findMany).toHaveBeenCalledTimes(1);
    // The rows are read for those ids only, in the tenant.
    expect(db.lead.findMany.mock.calls[0]![0].where).toEqual({
      tenantId: TENANT,
      id: { in: ['l1', 'l2', 'l3'] },
    });
    // Belt and braces: the code filter drops the same people again.
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add.mock.calls[0]![1]).toMatchObject({ leadId: 'l1', tenantId: TENANT });
  });

  it('passes an empty list when nobody is restricted', async () => {
    db.processingRestriction.findMany.mockResolvedValue([]);
    await processScoringJob(sentinel());
    expect(db.$queryRaw.mock.calls[0]![2]).toEqual([]);
  });

  it('reads no rows and queues nothing when no candidate is left', async () => {
    db.$queryRaw.mockResolvedValue([]);
    await processScoringJob(sentinel());
    expect(db.lead.findMany).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
