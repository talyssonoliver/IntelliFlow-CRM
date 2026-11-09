/**
 * Tenant filter extension — Real-Database Integration Test
 *
 * Runs every kind of Prisma operation through the tenant filter (apps/api/src/security/
 * tenant-filter.ts) against Postgres with two tenants, and asserts that tenant A's client
 * never returns, counts or changes tenant B's rows.
 *
 * The client connects as the test database's owner, which is not subject to Row Level
 * Security, so these assertions hold on the filter alone.
 *
 * Skips (like the other DB suites) when there is no DATABASE_URL.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIsolatedTestPrismaClient } from './setup';
import { tenantFilterExtension } from '../../apps/api/src/security/tenant-filter';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('Skipping tenant-filter integration test: DATABASE_URL not set');
}

const TAG = `tfilter_${Date.now()}`;

describeDb('tenant filter on every operation (real database)', () => {
  let prisma: any;
  let scopedA: any;
  let tA = '';
  let tB = '';
  let ownerA = '';
  let ownerB = '';
  let accountA = '';
  let accountB = '';
  let accountB2 = '';

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
    const [ua, ub] = await Promise.all([
      prisma.user.create({ data: { email: `${TAG}-a@example.invalid`, tenantId: tA } }),
      prisma.user.create({ data: { email: `${TAG}-b@example.invalid`, tenantId: tB } }),
    ]);
    ownerA = ua.id;
    ownerB = ub.id;

    scopedA = prisma.$extends(tenantFilterExtension(tA));
  });

  // Fresh rows for every test, so writes in one test cannot hide a leak in another.
  beforeEach(async (ctx) => {
    if (!prisma) ctx.skip();
    await prisma.opportunity.deleteMany({ where: { name: { startsWith: TAG } } });
    await prisma.account.deleteMany({ where: { name: { startsWith: TAG } } });

    const [aa, ab, ab2] = await Promise.all([
      prisma.account.create({ data: { name: `${TAG}-acc-a`, tenantId: tA, ownerId: ownerA } }),
      prisma.account.create({ data: { name: `${TAG}-acc-b`, tenantId: tB, ownerId: ownerB } }),
      prisma.account.create({ data: { name: `${TAG}-acc-b2`, tenantId: tB, ownerId: ownerB } }),
    ]);
    accountA = aa.id;
    accountB = ab.id;
    accountB2 = ab2.id;

    await prisma.opportunity.createMany({
      data: [
        { name: `${TAG}-opp-a`, value: 100, tenantId: tA, ownerId: ownerA, accountId: accountA },
        { name: `${TAG}-opp-b1`, value: 1000, tenantId: tB, ownerId: ownerB, accountId: accountB },
        { name: `${TAG}-opp-b2`, value: 2000, tenantId: tB, ownerId: ownerB, accountId: accountB },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.opportunity.deleteMany({ where: { name: { startsWith: TAG } } });
      await prisma.account.deleteMany({ where: { name: { startsWith: TAG } } });
      await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
      await prisma.tenant.deleteMany({ where: { name: { startsWith: TAG } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  const tagged = { name: { startsWith: TAG } };
  const bAccountNames = async () =>
    (
      await prisma.account.findMany({
        where: { tenantId: tB, ...tagged },
        orderBy: { name: 'asc' },
      })
    ).map((r: { name: string }) => r.name);

  describe('reads', () => {
    it('findMany without a tenant filter returns only the own tenant', async () => {
      const rows = await scopedA.account.findMany({ where: tagged });
      expect(rows.map((r: { tenantId: string }) => r.tenantId)).toEqual([tA]);
    });

    it('findFirst and findUnique of another tenant row find nothing', async () => {
      expect(await scopedA.account.findFirst({ where: { id: accountB } })).toBeNull();
      expect(await scopedA.account.findUnique({ where: { id: accountB } })).toBeNull();
      await expect(
        scopedA.account.findUniqueOrThrow({ where: { id: accountB } })
      ).rejects.toThrow();
      expect((await scopedA.account.findUnique({ where: { id: accountA } }))?.id).toBe(accountA);
    });

    it('count, aggregate and groupBy see only the own tenant', async () => {
      expect(await scopedA.opportunity.count({ where: tagged })).toBe(1);

      const sum = await scopedA.opportunity.aggregate({ where: tagged, _sum: { value: true } });
      expect(Number(sum._sum.value)).toBe(100);

      // The pipeline query shape: grouped by stage, filtered only by deletedAt.
      const byStage = await scopedA.opportunity.groupBy({
        by: ['stage'],
        where: { deletedAt: null, ...tagged },
        _count: true,
        _sum: { value: true },
      });
      expect(byStage).toHaveLength(1);
      expect(byStage[0]._count).toBe(1);
      expect(Number(byStage[0]._sum.value)).toBe(100);
    });

    it('a caller filter on the other tenant returns nothing instead of widening', async () => {
      expect(await scopedA.account.findMany({ where: { tenantId: tB, ...tagged } })).toEqual([]);
    });

    it('interactive transactions are filtered too', async () => {
      const rows = await scopedA.$transaction((tx: any) => tx.account.findMany({ where: tagged }));
      expect(rows.map((r: { tenantId: string }) => r.tenantId)).toEqual([tA]);
    });
  });

  describe('writes', () => {
    it('updateMany changes only the own tenant rows', async () => {
      const res = await scopedA.account.updateMany({
        where: tagged,
        data: { description: 'touched' },
      });
      expect(res.count).toBe(1);
      const touchedB = await prisma.account.count({
        where: { tenantId: tB, description: 'touched' },
      });
      expect(touchedB).toBe(0);
    });

    it('update and delete of another tenant row by id fail and leave it unchanged', async () => {
      await expect(
        scopedA.account.update({ where: { id: accountB }, data: { name: `${TAG}-hijacked` } })
      ).rejects.toThrow();
      await expect(scopedA.account.delete({ where: { id: accountB2 } })).rejects.toThrow();
      expect(await bAccountNames()).toEqual([`${TAG}-acc-b`, `${TAG}-acc-b2`]);
    });

    it('deleteMany removes only the own tenant rows', async () => {
      await scopedA.opportunity.deleteMany({ where: tagged });
      const left = await prisma.opportunity.findMany({ where: tagged });
      expect(left.map((r: { tenantId: string }) => r.tenantId).sort()).toEqual([tB, tB]);
    });

    it('create stamps the own tenant and refuses another one', async () => {
      const created = await scopedA.account.create({
        data: { name: `${TAG}-new`, ownerId: ownerA },
      });
      expect(created.tenantId).toBe(tA);
      await expect(
        scopedA.account.create({ data: { name: `${TAG}-x`, ownerId: ownerB, tenantId: tB } })
      ).rejects.toThrow(/another tenant/);
      expect(await bAccountNames()).toEqual([`${TAG}-acc-b`, `${TAG}-acc-b2`]);
    });

    it('createMany stamps every row', async () => {
      await scopedA.account.createMany({
        data: [
          { name: `${TAG}-m1`, ownerId: ownerA },
          { name: `${TAG}-m2`, ownerId: ownerA },
        ],
      });
      const rows = await prisma.account.findMany({ where: { name: { startsWith: `${TAG}-m` } } });
      expect(rows.map((r: { tenantId: string }) => r.tenantId)).toEqual([tA, tA]);
    });

    it('upsert on another tenant row does not touch it', async () => {
      const res = await scopedA.account.upsert({
        where: { id: accountB },
        update: { name: `${TAG}-hijacked` },
        create: { name: `${TAG}-upserted`, ownerId: ownerA },
      });
      expect(res.tenantId).toBe(tA);
      expect(res.id).not.toBe(accountB);
      expect(await bAccountNames()).toEqual([`${TAG}-acc-b`, `${TAG}-acc-b2`]);
    });

    it('update cannot move an own row to another tenant', async () => {
      await expect(
        scopedA.account.update({ where: { id: accountA }, data: { tenantId: tB } })
      ).rejects.toThrow(/another tenant/);
      expect((await prisma.account.findUnique({ where: { id: accountA } })).tenantId).toBe(tA);
    });
  });
});
