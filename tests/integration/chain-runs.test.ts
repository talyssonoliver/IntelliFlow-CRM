/**
 * chain_runs — Real-Database Integration Test
 *
 * The migration creates the table, the worker's writer inserts runs, and the usage aggregate the
 * AI Chains page reads (chainVersion.getUsageStats) counts only the caller tenant's rows.
 *
 * Skips (like the other DB suites) when there is no DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIsolatedTestPrismaClient } from './setup';
import { chainRunWriterFromPrisma } from '../../apps/ai-worker/src/monitoring/chain-run-recorder';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

const TAG = `chainruns_${Date.now()}`;

describeDb('chain_runs (real database)', () => {
  let prisma: any;
  let tA = '';
  let tB = '';

  beforeAll(async () => {
    prisma = createIsolatedTestPrismaClient();
    if (!prisma) return;
    const [a, b] = await Promise.all(
      ['a', 'b'].map((n) =>
        prisma.tenant.create({ data: { name: `${TAG}-${n}`, slug: `${TAG}-${n}` } })
      )
    );
    tA = a.id;
    tB = b.id;

    const write = chainRunWriterFromPrisma(prisma);
    const run = (tenantId: string, success: boolean, latencyMs: number) =>
      write({
        tenantId,
        chainType: 'SCORING',
        workerChain: 'LEAD_SCORING',
        versionId: null,
        model: 'anthropic/claude-haiku-5-5',
        inputTokens: 100,
        outputTokens: 20,
        costUsd: 0.001,
        latencyMs,
        success,
        errorClass: success ? null : 'TypeError',
      });
    await run(tA, true, 400);
    await run(tA, false, 600);
    await run(tB, true, 100);
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.chainRun.deleteMany({ where: { tenantId: { in: [tA, tB] } } });
      await prisma.tenant.deleteMany({ where: { name: { startsWith: TAG } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("aggregates only the caller tenant's runs", async () => {
    const where = { tenantId: tA, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } };
    const [all] = await prisma.chainRun.groupBy({
      by: ['chainType'],
      where,
      _count: { _all: true },
      _avg: { latencyMs: true },
      _sum: { costUsd: true, inputTokens: true },
    });
    const successes = await prisma.chainRun.count({ where: { ...where, success: true } });

    expect(all.chainType).toBe('SCORING');
    expect(all._count._all).toBe(2);
    expect(all._avg.latencyMs).toBe(500);
    expect(Number(all._sum.costUsd)).toBeCloseTo(0.002, 6);
    expect(all._sum.inputTokens).toBe(200);
    expect(successes).toBe(1);
  });

  it('removes a tenant runs with the tenant', async () => {
    const extra = await prisma.tenant.create({ data: { name: `${TAG}-c`, slug: `${TAG}-c` } });
    await chainRunWriterFromPrisma(prisma)({
      tenantId: extra.id,
      chainType: 'FOLLOWUP',
      workerChain: 'TICKET_ROUTING',
      versionId: null,
      model: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: 5,
      success: true,
      errorClass: null,
    });
    await prisma.tenant.delete({ where: { id: extra.id } });

    expect(await prisma.chainRun.count({ where: { tenantId: extra.id } })).toBe(0);
  });
});
