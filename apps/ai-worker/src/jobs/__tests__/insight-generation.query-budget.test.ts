/**
 * ai-insights job: the query budget it is given must fit what it does.
 *
 * At 06:00 on 25/11/2026 the scheduled ai-insights job tipped the 50-query background budget
 * (51 queries: the reporter fires on the first query past the budget, so the job went on). That
 * was not an off-by-one: the comparison is `count > budget`. The job writes each flagged person
 * under that person's own locked transaction (PG-203 #1002: row lock, address lock, restriction
 * check, then the write, about 4 queries a person) for up to 20 leads and 20 contacts, plus 3 to
 * 6 queries per insight, so a busy tenant needs well over 50 by design. The default budget is
 * meant to catch an N+1 that grows with data; this job's cost is bounded by the take: 20 reads
 * in gatherTenantHeuristicData. Its budget is therefore sized from that bound, here, instead of
 * left at a generic 50 that warns on every busy run.
 *
 * This counts every database call of a worst-case run through the real data-request guard, the
 * way the query-budget extension counts them, and pins the budget to it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ ops: 0, ctx: {} as Record<string, unknown> }));

vi.mock('../../chains/insight-generation.chain', () => {
  class InsightGenerationChain {
    generateInsightsWithMeta = (...args: unknown[]) =>
      (db.ctx['generate'] as (...a: unknown[]) => unknown)(...args);
    generateFallbackInsights = () => [];
  }
  return { getInsightGenerationChain: () => new InsightGenerationChain(), InsightGenerationChain };
});

vi.mock('../../utils/audit-log', () => ({ logAIAgentAction: vi.fn(async () => undefined) }));

vi.mock('@intelliflow/db', () => {
  const counted =
    <T>(value: T) =>
    async () => {
      db.ops += 1;
      return value;
    };
  const PERSON = 'person@example.invalid';
  const tx: Record<string, any> = {
    // Row lock and address lock both come through here.
    $queryRaw: counted([{ email: PERSON }]),
    processingRestriction: { findFirst: counted(null), findMany: counted([]) },
    dsarRequest: { findFirst: counted(null), findMany: counted([]) },
    aIInsight: { findFirst: counted(null), create: counted({ id: 'insight-row' }) },
    notification: { findFirst: counted(null), create: counted({ id: 'n' }) },
    task: { create: counted({ id: 't' }) },
    leadActivity: { findFirst: counted(null), create: counted({ id: 'a' }) },
    contactActivity: { findFirst: counted(null), create: counted({ id: 'a' }) },
    leadAIInsight: { upsert: counted({ id: 'li' }) },
    contactAIInsight: { upsert: counted({ id: 'ci' }) },
    lead: { findFirst: counted({ id: 'x' }) },
    contact: { findFirst: counted({ id: 'x' }) },
    opportunity: { findFirst: counted({ id: 'x' }) },
  };
  const prisma: Record<string, any> = {
    ...tx,
    $transaction: async (fn: (client: unknown) => unknown) => fn(tx),
    lead: {
      findFirst: counted({ id: 'x' }),
      findMany: async (args: { where: { id: { in: string[] } } }) => {
        db.ops += 1;
        return args.where.id.in.map((id) => ({
          id,
          email: PERSON,
          firstName: 'A',
          lastName: 'B',
          company: 'Co',
        }));
      },
    },
    contact: {
      findFirst: counted({ id: 'x' }),
      findMany: async (args: { where: { id: { in: string[] } } }) => {
        db.ops += 1;
        return args.where.id.in.map((id) => ({ id, email: PERSON, firstName: 'C', lastName: 'D' }));
      },
    },
    opportunity: {
      findFirst: counted({ id: 'x' }),
      findMany: async (args: { where: { id: { in: string[] } } }) => {
        db.ops += 1;
        return args.where.id.in.map((id) => ({ id, contactId: null, name: `Deal ${id}` }));
      },
    },
  };
  return { prisma };
});

import { InsightJobDataSchema, processInsightJob } from '../insight-generation.job';
import { INSIGHT_JOB_QUERY_BUDGET, insightJobQueryBudget } from '../../lib/insight-query-budget';

const TENANT = '00000000-0000-4000-a000-000000000001';
const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`);

/** What gatherTenantHeuristicData can queue: take 20 of each. */
function worstCaseJob() {
  const data = InsightJobDataSchema.parse({
    tenantId: TENANT,
    userId: 'user-1',
    dealsAtRisk: ids('deal', 20).map((id) => ({ id, name: id, daysSinceUpdate: 30 })),
    hotLeads: ids('lead', 20).map((id) => ({ id, name: id, score: 90 })),
    overdueTasksCount: 4,
    staleContacts: ids('contact', 20).map((id) => ({ id, name: id, daysSinceContact: 45 })),
  });
  return {
    id: 'job-budget',
    data,
    updateProgress: vi.fn(),
    extendLock: vi.fn().mockResolvedValue(undefined),
    token: 'lock',
    queueName: 'ai-insights',
  } as any;
}

/** The most the model returns for those capped inputs: every one high or critical, about a person. */
function worstCaseInsights() {
  const people = [
    ...ids('lead', 10).map((id) => ({ entityType: 'lead', entityId: id })),
    ...ids('contact', 10).map((id) => ({ entityType: 'contact', entityId: id })),
  ];
  return people.map((p, i) => ({
    ...p,
    type: 'warning',
    title: `Insight ${i}`,
    description: 'Follow up.',
    suggestedActions: ['Call them'],
    confidence: 0.9,
    priority: 'critical',
    reasoning: 'Inactive.',
  }));
}

describe('ai-insights job query budget', () => {
  beforeEach(() => {
    db.ops = 0;
    db.ctx['generate'] = async () => ({
      insights: worstCaseInsights(),
      source: 'llm',
      executionTimeMs: 5,
    });
  });

  it('a worst-case run fits the budget the job is given', async () => {
    await processInsightJob(worstCaseJob());

    // The generic background budget (50) is what tipped at 06:00 on 25/11.
    expect(db.ops).toBeGreaterThan(50);
    expect(db.ops).toBeLessThanOrEqual(INSIGHT_JOB_QUERY_BUDGET);
  });

  it('does not give the job more room than it can use (a budget is not a free pass)', async () => {
    await processInsightJob(worstCaseJob());

    expect(INSIGHT_JOB_QUERY_BUDGET).toBeLessThanOrEqual(Math.ceil(db.ops * 1.25));
  });

  it('a busy-but-typical run (10 leads, 10 contacts) is also covered', async () => {
    const job = worstCaseJob();
    job.data.hotLeads = job.data.hotLeads.slice(0, 10);
    job.data.staleContacts = job.data.staleContacts.slice(0, 10);
    job.data.dealsAtRisk = [];
    db.ctx['generate'] = async () => ({
      insights: worstCaseInsights().slice(0, 6),
      source: 'llm',
      executionTimeMs: 5,
    });

    await processInsightJob(job);

    expect(db.ops).toBeGreaterThan(50);
    expect(db.ops).toBeLessThanOrEqual(INSIGHT_JOB_QUERY_BUDGET);
  });

  describe('insightJobQueryBudget()', () => {
    it('is the sized budget for the insight queue', () => {
      expect(insightJobQueryBudget('ai-insights', 'ai-insights', 50, {})).toBe(
        INSIGHT_JOB_QUERY_BUDGET
      );
    });

    it('never lowers a larger default', () => {
      expect(insightJobQueryBudget('ai-insights', 'ai-insights', 5000, {})).toBe(5000);
    });

    it('leaves every other queue on the generic budget', () => {
      expect(insightJobQueryBudget('ai-scoring', 'ai-insights', 50, {})).toBe(50);
    });

    it('lets the operator override with QUERY_BUDGET_BACKGROUND', () => {
      expect(
        insightJobQueryBudget('ai-insights', 'ai-insights', 80, { QUERY_BUDGET_BACKGROUND: '80' })
      ).toBe(80);
    });
  });
});
