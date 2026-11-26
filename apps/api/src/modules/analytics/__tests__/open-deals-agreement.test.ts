/**
 * The dashboard "Active Deals" tile (analytics.getOverview -> openOpportunities) and the
 * Pipeline Summary card ("£X open across N deals", opportunity.getPipeline) are two queries over
 * the same table. They must use one "open deal" definition: not won, not lost, not archived.
 *
 * Before this test the tile counted every deal CREATED this month in any stage (27 on the local
 * demo workspace) while the summary counted open deals (14).
 *
 * The fake opportunity table below applies the `where` each query sends, so a change to either
 * query's filter makes the two numbers disagree and fails this test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaAnalyticsRepository } from '@intelliflow/adapters';
import { AnalyticsAggregationService } from '@intelliflow/application';
import type { AnalyticsRepository } from '@intelliflow/application';
import { opportunityRouter } from '../../opportunity/opportunity.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

vi.mock('../../security/audit-logger', () => ({
  getAuditLogger: vi.fn(() => ({
    logAction: vi.fn().mockResolvedValue('audit-id'),
    logBulkOperation: vi.fn().mockResolvedValue('audit-id'),
    logPermissionDenied: vi.fn().mockResolvedValue('audit-id'),
  })),
}));

interface Row {
  tenantId: string;
  stage: string;
  value: number;
  createdAt: Date;
  deletedAt: Date | null;
}

type Where = {
  tenantId?: string;
  deletedAt?: null;
  stage?: string | { notIn: string[] };
  createdAt?: { gte: Date; lte: Date };
};

function matches(row: Row, where: Where = {}): boolean {
  if (where.tenantId !== undefined && row.tenantId !== where.tenantId) return false;
  if (where.deletedAt === null && row.deletedAt !== null) return false;
  if (typeof where.stage === 'string' && row.stage !== where.stage) return false;
  if (typeof where.stage === 'object' && where.stage.notIn.includes(row.stage)) return false;
  if (
    where.createdAt &&
    (row.createdAt < where.createdAt.gte || row.createdAt > where.createdAt.lte)
  )
    return false;
  return true;
}

const TENANT = TEST_UUIDS.tenant;
const now = new Date();
const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 2));
const lastQuarter = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 10));
const archivedAt = new Date();

function row(stage: string, createdAt: Date, deletedAt: Date | null = null, value = 1000): Row {
  return { tenantId: TENANT, stage, value, createdAt, deletedAt };
}

// 6 open (3 created this month, 3 older), plus every kind of deal that is NOT open.
const ROWS: Row[] = [
  row('PROSPECTING', thisMonth),
  row('QUALIFICATION', thisMonth),
  row('PROPOSAL', thisMonth),
  row('NEEDS_ANALYSIS', lastQuarter),
  row('NEGOTIATION', lastQuarter),
  row('PROPOSAL', lastQuarter),
  row('CLOSED_WON', thisMonth),
  row('CLOSED_WON', thisMonth),
  row('CLOSED_WON', lastQuarter),
  row('CLOSED_LOST', thisMonth),
  row('PROPOSAL', thisMonth, archivedAt), // archived while still in an open stage
  { ...row('PROSPECTING', thisMonth), tenantId: 'another-tenant' },
];
const OPEN_DEALS = 6;

function fakeOpportunityTable() {
  return {
    count: vi.fn(
      async ({ where }: { where?: Where }) => ROWS.filter((r) => matches(r, where)).length
    ),
    groupBy: vi.fn(async ({ where }: { where?: Where }) => {
      const byStage = new Map<string, Row[]>();
      for (const r of ROWS.filter((x) => matches(x, where))) {
        byStage.set(r.stage, [...(byStage.get(r.stage) ?? []), r]);
      }
      return [...byStage.entries()].map(([stage, rows]) => ({
        stage,
        _count: rows.length,
        _sum: { value: rows.reduce((s, r) => s + r.value, 0) },
        _avg: { probability: 50 },
      }));
    }),
  };
}

describe('dashboard Active Deals tile and Pipeline Summary agree', () => {
  beforeEach(() => {
    (prismaMock.$extends as ReturnType<typeof vi.fn>).mockReturnValue(prismaMock);
  });

  it('counts the same open deals for the same data', async () => {
    const table = fakeOpportunityTable();

    // Tile: the real repository query behind analytics.getOverview.
    const real = new PrismaAnalyticsRepository({ opportunity: table } as never);
    const repo = {
      countLeadsInRange: async () => 0,
      getRevenueInRange: async () => 0,
      countContactsInRange: async () => 0,
      countClosedWonInRange: async () => 0,
      countClosedLostInRange: async () => 0,
      getRecentAuditLogs: async () => [],
      countOpportunitiesInRange: real.countOpportunitiesInRange.bind(real),
      countOpenOpportunities: real.countOpenOpportunities.bind(real),
      countOpenOpportunitiesAsOf: async () => 0,
    } as unknown as AnalyticsRepository;
    const overview = await new AnalyticsAggregationService(repo).getOverview(TENANT);

    // Summary: the real opportunity.getPipeline over the same table.
    (
      prismaMock.pipelineStageConfig as never as { findMany: ReturnType<typeof vi.fn> }
    ).findMany.mockResolvedValue([]);
    vi.mocked(prismaMock.opportunity.groupBy).mockImplementation(table.groupBy as never);
    const pipeline = await opportunityRouter.createCaller(createTestContext()).getPipeline({});
    const summaryDeals = pipeline.stages.reduce((sum, s) => sum + s.count, 0);

    expect(summaryDeals).toBe(OPEN_DEALS);
    expect(overview.openOpportunities).toBe(OPEN_DEALS);
    expect(overview.openOpportunities).toBe(summaryDeals);
  });

  it('does not count won, lost or archived deals, or deals of another workspace', async () => {
    const real = new PrismaAnalyticsRepository({ opportunity: fakeOpportunityTable() } as never);
    expect(await real.countOpenOpportunities(TENANT)).toBe(OPEN_DEALS);
    // The old tile definition: every deal created this month in any stage.
    const createdThisMonth = await real.countOpportunitiesInRange(TENANT, {
      startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      endDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59)),
    });
    expect(createdThisMonth).toBe(7);
    expect(createdThisMonth).not.toBe(OPEN_DEALS);
  });
});
