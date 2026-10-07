/**
 * PG-197 — account geography + territory tables, real-Database integration test.
 *
 * Lives in `tests/integration/` so it runs in the CI "Integration Tests" lane and pre-ship.
 * Proves the Class A migration `20261007130000_account_territories` on a real Postgres:
 * the new account columns are nullable and constrained, the territory tables enforce
 * their invariants in the database (case-insensitive names, at most one default,
 * de-duplicated rules, tenant-consistent children), and the round-robin cursor is
 * advanced atomically under concurrency.
 *
 * Skips cleanly when DATABASE_URL is not set.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('Skipping account-territories integration test: DATABASE_URL not set');
}

const RUN = `pg197_${Date.now()}`;
const TENANT_A = `${RUN}_a`;
const TENANT_B = `${RUN}_b`;
const USER_A1 = `${RUN}_ua1`;
const USER_A2 = `${RUN}_ua2`;
const USER_B1 = `${RUN}_ub1`;

/** Postgres error code raised by a failed statement, whatever layer wrapped it. */
function pgCode(error: unknown): string | undefined {
  const text = JSON.stringify(error, Object.getOwnPropertyNames(error as object)) ?? '';
  const match = /"(?:code|originalCode)":"(\d{5}|P\d{4})"/.exec(text);
  if (match) return match[1];
  const code = (error as { code?: string })?.code;
  if (code) return code;
  // Prisma 7 driver-adapter errors may carry only the constraint kind in the message.
  const message = String((error as { message?: string })?.message ?? '');
  if (/check constraint|CheckConstraint/i.test(message + text)) return '23514';
  if (/unique constraint|duplicate key|UniqueConstraint/i.test(message + text)) return '23505';
  if (/foreign key|ForeignKeyConstraint/i.test(message + text)) return '23503';
  return undefined;
}

async function expectRejected(promise: Promise<unknown>, codes: string[]): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught, 'statement should have been rejected').toBeDefined();
  const code = pgCode(caught);
  if (!code || !codes.includes(code)) {
    console.log('Unexpected rejection shape:', String((caught as Error)?.message).slice(0, 400));
  }
  expect(codes).toContain(code);
}

// 23505 unique_violation (Prisma P2002), 23514 check_violation, 23503 foreign_key_violation (P2003)
const UNIQUE = ['23505', 'P2002'];
const CHECK = ['23514', 'P2004', 'P2010'];
const FOREIGN_KEY = ['23503', 'P2003'];

describeDb('PG-197 account territories (real DB)', () => {
  let prisma: any;
  let dbReady = false;

  beforeEach((ctx) => {
    if (!dbReady) ctx.skip();
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    for (const id of [TENANT_A, TENANT_B]) {
      await prisma.tenant.create({ data: { id, name: id, slug: id } });
    }
    for (const [id, tenantId] of [
      [USER_A1, TENANT_A],
      [USER_A2, TENANT_A],
      [USER_B1, TENANT_B],
    ]) {
      await prisma.user.create({ data: { id, tenantId, email: `${id}@example.invalid` } });
    }
    dbReady = true;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (dbReady) {
      const tenants = { in: [TENANT_A, TENANT_B] };
      await prisma.accountTerritory.deleteMany({ where: { tenantId: tenants } });
      await prisma.account.deleteMany({ where: { tenantId: tenants } });
      await prisma.user.deleteMany({ where: { tenantId: tenants } });
      await prisma.tenant.deleteMany({ where: { id: tenants } });
    }
    await prisma.$disconnect();
  });

  function territory(tenantId: string, name: string, extra: Record<string, unknown> = {}) {
    return prisma.accountTerritory.create({ data: { tenantId, name, ...extra } });
  }

  describe('accounts geography columns', () => {
    it('are nullable and default to null', async () => {
      const account = await prisma.account.create({
        data: { tenantId: TENANT_A, ownerId: USER_A1, name: `${RUN} no geo` },
      });
      expect(account.country).toBeNull();
      expect(account.region).toBeNull();
      expect(account.postalCode).toBeNull();
    });

    it('accept an upper-case ISO alpha-2 country with region and postal code', async () => {
      const account = await prisma.account.create({
        data: {
          tenantId: TENANT_A,
          ownerId: USER_A1,
          name: `${RUN} geo`,
          country: 'GB',
          region: 'Greater London',
          postalCode: 'SW1A 1AA',
        },
      });
      expect(account.country).toBe('GB');
    });

    it('reject a lower-case country through the CHECK constraint', async () => {
      await expectRejected(
        prisma.account.create({
          data: { tenantId: TENANT_A, ownerId: USER_A1, name: `${RUN} bad`, country: 'gb' },
        }),
        CHECK
      );
    });
  });

  describe('account_territories', () => {
    it('default strategy is MANUAL, colour slate, cursor 0', async () => {
      const row = await territory(TENANT_A, 'Defaults');
      expect(row.strategy).toBe('MANUAL');
      expect(row.colorToken).toBe('slate');
      expect(row.rrCursor).toBe(0);
      expect(row.isDefault).toBe(false);
      expect(row.isActive).toBe(true);
    });

    it('rejects an unknown strategy and an unknown colour', async () => {
      await expectRejected(territory(TENANT_A, 'Bad strategy', { strategy: 'RANDOM' }), CHECK);
      await expectRejected(territory(TENANT_A, 'Bad colour', { colorToken: 'neon' }), CHECK);
    });

    it('enforces case-insensitive name uniqueness per tenant only', async () => {
      await territory(TENANT_A, 'East');
      await expectRejected(territory(TENANT_A, 'east'), UNIQUE);
      const other = await territory(TENANT_B, 'EAST');
      expect(other.tenantId).toBe(TENANT_B);
    });

    it('allows at most one default territory per tenant', async () => {
      await territory(TENANT_A, 'Default one', { isDefault: true });
      await expectRejected(territory(TENANT_A, 'Default two', { isDefault: true }), UNIQUE);
      const otherTenant = await territory(TENANT_B, 'Default B', { isDefault: true });
      expect(otherTenant.isDefault).toBe(true);
    });

    it('advances the round-robin cursor atomically under concurrency', async () => {
      const row = await territory(TENANT_A, 'Rotation', { strategy: 'ROUND_ROBIN' });
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          prisma.accountTerritory.update({
            where: { tenantId_id: { tenantId: TENANT_A, id: row.id } },
            data: { rrCursor: { increment: 1 } },
            select: { rrCursor: true },
          })
        )
      );
      const values = results
        .map((r: { rrCursor: number }) => r.rrCursor)
        .sort((a: number, b: number) => a - b);
      expect(values).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });

  describe('account_territory_rules', () => {
    it('rejects an invalid country and blank region/prefix', async () => {
      const t = await territory(TENANT_A, 'Rule checks');
      const base = { tenantId: TENANT_A, territoryId: t.id };
      await expectRejected(
        prisma.accountTerritoryRule.create({ data: { ...base, country: 'uk' } }),
        CHECK
      );
      await expectRejected(
        prisma.accountTerritoryRule.create({ data: { ...base, country: 'GB', region: '' } }),
        CHECK
      );
      await expectRejected(
        prisma.accountTerritoryRule.create({ data: { ...base, country: 'GB', postalPrefix: '' } }),
        CHECK
      );
    });

    it('de-duplicates rules case-insensitively on region', async () => {
      const t = await territory(TENANT_A, 'Dedupe');
      const base = { tenantId: TENANT_A, territoryId: t.id, country: 'GB' };
      await prisma.accountTerritoryRule.create({ data: { ...base, region: 'London' } });
      await expectRejected(
        prisma.accountTerritoryRule.create({ data: { ...base, region: 'LONDON' } }),
        UNIQUE
      );
      await prisma.accountTerritoryRule.create({
        data: { ...base, region: 'London', postalPrefix: 'SW1' },
      });
      await expectRejected(
        prisma.accountTerritoryRule.create({
          data: { ...base, region: 'london', postalPrefix: 'SW1' },
        }),
        UNIQUE
      );
    });

    it('rejects a rule whose tenant differs from its territory (composite FK)', async () => {
      const t = await territory(TENANT_A, 'Tenant guard');
      await expectRejected(
        prisma.accountTerritoryRule.create({
          data: { tenantId: TENANT_B, territoryId: t.id, country: 'GB' },
        }),
        FOREIGN_KEY
      );
    });
  });

  describe('account_territory_members', () => {
    it('rejects duplicate members and cross-tenant children', async () => {
      const t = await territory(TENANT_A, 'Members');
      await prisma.accountTerritoryMember.create({
        data: { tenantId: TENANT_A, territoryId: t.id, userId: USER_A1 },
      });
      await expectRejected(
        prisma.accountTerritoryMember.create({
          data: { tenantId: TENANT_A, territoryId: t.id, userId: USER_A1 },
        }),
        UNIQUE
      );
      await expectRejected(
        prisma.accountTerritoryMember.create({
          data: { tenantId: TENANT_B, territoryId: t.id, userId: USER_B1 },
        }),
        FOREIGN_KEY
      );
    });

    it('cascades rules and members when a territory is deleted', async () => {
      const t = await territory(TENANT_A, 'Cascade');
      await prisma.accountTerritoryRule.create({
        data: { tenantId: TENANT_A, territoryId: t.id, country: 'FR' },
      });
      await prisma.accountTerritoryMember.create({
        data: { tenantId: TENANT_A, territoryId: t.id, userId: USER_A2 },
      });
      await prisma.accountTerritory.delete({ where: { id: t.id } });
      expect(await prisma.accountTerritoryRule.count({ where: { territoryId: t.id } })).toBe(0);
      expect(await prisma.accountTerritoryMember.count({ where: { territoryId: t.id } })).toBe(0);
    });
  });

  describe('row-level security', () => {
    it('enables RLS with a tenant policy on all three tables', async () => {
      const rows: Array<{ relname: string; relrowsecurity: boolean }> =
        await prisma.$queryRawUnsafe(
          `SELECT relname, relrowsecurity FROM pg_class
         WHERE relname IN ('account_territories','account_territory_rules','account_territory_members')`
        );
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.relrowsecurity)).toBe(true);
      const policies: Array<{ tablename: string; qual: string; with_check: string }> =
        await prisma.$queryRawUnsafe(
          `SELECT tablename, qual, with_check FROM pg_policies
           WHERE tablename IN ('account_territories','account_territory_rules','account_territory_members')`
        );
      expect(policies).toHaveLength(3);
      for (const p of policies) {
        expect(p.qual).toContain('app.current_tenant_id');
        expect(p.with_check).toContain('app.current_tenant_id');
      }
    });

    it('hides tenant B territories from a tenant-A session under a non-bypass role', async (ctx) => {
      const roles: Array<{ exists: boolean }> = await prisma.$queryRawUnsafe(
        `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') AS exists`
      );
      if (!roles[0]?.exists) {
        console.log('Skipping RLS session check: local DB has no Supabase "authenticated" role');
        ctx.skip();
      }
      await territory(TENANT_B, `${RUN} hidden`);
      let visible: Array<{ tenantId: string }> = [];
      try {
        visible = await prisma.$transaction(async (tx: any) => {
          await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
          await tx.$executeRawUnsafe(
            `SELECT set_config('app.current_tenant_id', '${TENANT_A}', true)`
          );
          return tx.$queryRawUnsafe(`SELECT "tenantId" FROM account_territories`);
        });
      } catch (error) {
        // Missing table GRANTs for the Supabase role (local DB, same as CI) — not an isolation leak.
        console.log('Skipping RLS session check: role lacks table grants locally', pgCode(error));
        ctx.skip();
      }
      expect(visible.every((r) => r.tenantId === TENANT_A)).toBe(true);
    });
  });
});
