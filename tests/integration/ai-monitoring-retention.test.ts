/**
 * ai-monitoring-retention.ts against a real Postgres (egress audit 1126).
 *
 * The unit suite (tools/scripts/__tests__/ai-monitoring-retention.test.ts) proves the control
 * flow with a fake database. This one runs the script's real SQL: the roll-up numbers, the
 * day boundary, the tenant and model keys, "drift is kept", idempotency, and that a roll-up that
 * does not add up deletes nothing.
 *
 * Everything runs inside one transaction that always rolls back. The script opens a transaction
 * per day; here that call is routed into the outer transaction, so nothing is ever committed.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createIsolatedTestPrismaClient } from './setup';
import {
  run,
  rollUpDay,
  type RetentionArgs,
  type RetentionDb,
} from '../../tools/scripts/ai-monitoring-retention';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

class Rollback extends Error {}

const NOW = new Date('2026-12-01T12:00:00Z');
const args = (over: Partial<RetentionArgs> = {}): RetentionArgs => ({
  isApply: true,
  days: 90,
  ownerApproved: 'integration test',
  includeDrift: false,
  ...over,
});

describeDb('ai-monitoring-retention against a real database', () => {
  let prisma: any;

  beforeAll(() => {
    prisma = createIsolatedTestPrismaClient();
  });

  beforeEach((ctx) => {
    if (!prisma) ctx.skip();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function inRollback(fn: (tx: any, db: RetentionDb) => Promise<void>): Promise<void> {
    try {
      await prisma.$transaction(async (tx: any) => {
        const db: RetentionDb = {
          $queryRawUnsafe: (sql, ...v) => tx.$queryRawUnsafe(sql, ...v),
          $transaction: (cb) => cb(tx),
        };
        await fn(tx, db);
        throw new Rollback();
      });
    } catch (err) {
      if (!(err instanceof Rollback)) throw err;
    }
  }

  const seed = (tx: any, rows: Array<Record<string, unknown>>) =>
    tx.aIMonitoringEvent.createMany({ data: rows });

  // 2026-09-01 is before the cutoff (2026-09-02); 2026-09-02 and later are kept.
  const old1 = (h: number) => new Date(Date.UTC(2026, 8, 1, h, 30));
  const old0 = (h: number) => new Date(Date.UTC(2026, 7, 31, h, 5));
  const keep = (h: number) => new Date(Date.UTC(2026, 8, 2, h, 0));

  it('rolls old rows into daily summaries, deletes them, and leaves newer rows and drift alone', async () => {
    await inRollback(async (tx, db) => {
      const tenant = await tx.tenant.create({
        data: { name: 'retention-test', slug: `retention-${randomUUID()}` },
      });
      await seed(tx, [
        // 2026-09-01, tenant, model gpt: values 100, 200, 300, 400, one flagged
        {
          eventType: 'latency',
          model: 'gpt',
          value: 100,
          flagged: false,
          tenantId: tenant.id,
          recordedAt: old1(0),
        },
        {
          eventType: 'latency',
          model: 'gpt',
          value: 200,
          flagged: false,
          tenantId: tenant.id,
          recordedAt: old1(5),
        },
        {
          eventType: 'latency',
          model: 'gpt',
          value: 300,
          flagged: true,
          tenantId: tenant.id,
          recordedAt: old1(10),
        },
        {
          eventType: 'latency',
          model: 'gpt',
          value: 400,
          flagged: null,
          tenantId: tenant.id,
          recordedAt: new Date(Date.UTC(2026, 8, 1, 23, 59, 59, 999)),
        },
        // same day, global, no model
        {
          eventType: 'roi_cost',
          model: null,
          value: 1.5,
          flagged: null,
          tenantId: null,
          recordedAt: old1(3),
        },
        {
          eventType: 'roi_cost',
          model: null,
          value: 2.5,
          flagged: null,
          tenantId: null,
          recordedAt: old1(4),
        },
        // 2026-08-31
        {
          eventType: 'hallucination',
          model: 'gpt',
          value: 0.2,
          flagged: true,
          tenantId: tenant.id,
          recordedAt: old0(1),
        },
        // drift is kept
        {
          eventType: 'drift',
          model: 'm',
          value: 0.9,
          flagged: true,
          tenantId: null,
          recordedAt: old1(2),
          payload: { pValue: 0.01 },
        },
        // at or after the cutoff: kept
        {
          eventType: 'latency',
          model: 'gpt',
          value: 999,
          flagged: false,
          tenantId: tenant.id,
          recordedAt: keep(0),
        },
      ]);
      const before = await tx.aIMonitoringEvent.count();

      const result = await run(db, args(), NOW, () => undefined);

      expect(result).toMatchObject({ days: 2, events: 7, deleted: 7 });
      // Only this test's window (Aug 31 - Sep 2, 2026): the shared test DB also holds other
      // suites' and lanes' events dated "now", which are not ours to assert on.
      const left = await tx.aIMonitoringEvent.findMany({
        where: { recordedAt: { lt: new Date(Date.UTC(2026, 8, 3)) } },
        orderBy: { recordedAt: 'asc' },
      });
      expect(await tx.aIMonitoringEvent.count()).toBe(before - 7);
      expect(left.map((e: any) => e.eventType).sort()).toEqual(['drift', 'latency']);

      const sums = await tx.$queryRawUnsafe(
        `SELECT to_char(day,'YYYY-MM-DD') AS day, "eventType", "tenantKey", model, "eventCount", "flaggedCount",
                "valueSum", "valueMin", "valueMax", "valueP50", "valueP95", "valueP99"
           FROM ai_monitoring_daily_summaries
          WHERE "tenantKey" = $1 OR ("tenantKey" = '' AND "eventType" = 'roi_cost' AND day = '2026-09-01')
          ORDER BY day, "eventType"`,
        tenant.id
      );
      const latency = sums.find((s: any) => s.eventType === 'latency');
      expect(latency).toMatchObject({
        day: '2026-09-01',
        tenantKey: tenant.id,
        model: 'gpt',
        eventCount: 4,
        flaggedCount: 1,
        valueSum: 1000,
        valueMin: 100,
        valueMax: 400,
        valueP50: 200, // ceil(4 * 0.5) = 2nd value
        valueP95: 400,
        valueP99: 400,
      });
      const roi = sums.find((s: any) => s.eventType === 'roi_cost');
      expect(roi).toMatchObject({
        tenantKey: '',
        model: '',
        eventCount: 2,
        flaggedCount: 0,
        valueSum: 4,
      });
      expect(sums.find((s: any) => s.eventType === 'hallucination')).toMatchObject({
        day: '2026-08-31',
        eventCount: 1,
        flaggedCount: 1,
      });
    });
  });

  it('is idempotent: a second run finds nothing and writes nothing', async () => {
    await inRollback(async (tx, db) => {
      await seed(tx, [
        {
          eventType: 'latency',
          model: 'x',
          value: 1,
          flagged: false,
          tenantId: null,
          recordedAt: old1(1),
        },
      ]);
      const first = await run(db, args(), NOW, () => undefined);
      expect(first.deleted).toBeGreaterThanOrEqual(1);
      const count = await tx.$queryRawUnsafe(
        `SELECT count(*)::int AS n FROM ai_monitoring_daily_summaries`
      );
      const second = await run(db, args(), NOW, () => undefined);
      expect(second).toEqual({ days: 0, events: 0, summaries: 0, deleted: 0 });
      const countAfter = await tx.$queryRawUnsafe(
        `SELECT count(*)::int AS n FROM ai_monitoring_daily_summaries`
      );
      expect(countAfter[0].n).toBe(count[0].n);
    });
  });

  it('a dry run changes nothing', async () => {
    await inRollback(async (tx, db) => {
      await seed(tx, [
        {
          eventType: 'latency',
          model: 'x',
          value: 1,
          flagged: false,
          tenantId: null,
          recordedAt: old1(1),
        },
      ]);
      const before = await tx.aIMonitoringEvent.count();
      const r = await run(
        db,
        args({ isApply: false, ownerApproved: undefined }),
        NOW,
        () => undefined
      );
      expect(r.events).toBeGreaterThanOrEqual(1);
      expect(r.deleted).toBe(0);
      expect(await tx.aIMonitoringEvent.count()).toBe(before);
    });
  });

  it('refuses to delete when an earlier summary of the day no longer matches the events', async () => {
    await inRollback(async (tx) => {
      await seed(tx, [
        {
          eventType: 'latency',
          model: 'gpt',
          value: 1,
          flagged: false,
          tenantId: null,
          recordedAt: old1(1),
        },
        {
          eventType: 'latency',
          model: 'gpt',
          value: 2,
          flagged: false,
          tenantId: null,
          recordedAt: old1(2),
        },
      ]);
      // A stale summary for the same key claims 1 event while 2 exist (e.g. a late arrival).
      await tx.$executeRawUnsafe(
        `INSERT INTO ai_monitoring_daily_summaries (id, day, "eventType", "tenantKey", model, "eventCount", "flaggedCount")
         VALUES ('stale-1', '2026-09-01', 'latency', '', 'gpt', 1, 0)`
      );
      const before = await tx.aIMonitoringEvent.count();
      await expect(rollUpDay(tx, '2026-09-01', args())).rejects.toThrow(/nothing deleted/);
      expect(await tx.aIMonitoringEvent.count()).toBe(before);
    });
  });
});
