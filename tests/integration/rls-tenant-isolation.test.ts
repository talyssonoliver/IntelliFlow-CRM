/**
 * RLS Tenant Isolation — Real-Database Integration Test
 *
 * Validates the DATABASE-level Row-Level-Security boundary directly. This is the
 * security guarantee production actually depends on, and (before this) it had NO
 * real coverage:
 *  - `cross-tenant.test.ts` in this folder is fully MOCKED and only exercises the
 *    legacy app-level `ownerId` helpers — not the DB policies.
 *  - `createTenantScopedPrisma()` SHORT-CIRCUITS under VITEST (returns the raw
 *    client with no `SET`), so the policies are never hit via the app helper.
 *  - The test DB connects as `postgres` (superuser + BYPASSRLS) and the tenant
 *    tables do NOT `FORCE ROW LEVEL SECURITY`, so a plain query as postgres sees
 *    everything.
 *
 * So we reproduce prod's real enforcement: inside a transaction, `SET LOCAL ROLE
 * authenticated` (the Supabase JWT role that RLS applies to) + `SET LOCAL
 * app.current_tenant_id` — exactly what `createTenantScopedPrisma` does in prod —
 * then assert a tenant can only see/mutate its own rows.
 *
 * Relates to the cross-tenant-leak incident (2026-06-16).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
// Reuse the integration harness's client factory — it builds the Prisma 7 client
// with the `@prisma/adapter-pg` driver adapter against the test DB.
import { createIsolatedTestPrismaClient } from './setup';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('⏭️  Skipping RLS tenant-isolation integration test: DATABASE_URL not set');
}

// Unique per-run marker so leftovers never collide and cleanup is precise.
const TAG = `rlsqa_${Date.now()}`;

describeDb('RLS tenant isolation (DB-enforced policies)', () => {
  let prisma: any;
  // True when the DB lacks the Supabase-style runtime this suite needs (the
  // `authenticated` role with table GRANTs + active RLS policies). Present on the
  // Supabase/local test DB; ABSENT in a bare `prisma db push` CI test DB (tables
  // are postgres-owned with no grants/policies). We probe for it and skip rather
  // than fail with "permission denied for table accounts".
  let rlsUnavailable = false;
  let tenantA = '';
  let tenantB = '';
  let acctA = '';
  let acctB = '';

  /**
   * Run `fn` as the `authenticated` role scoped to `tenantId`, the way the app
   * resolves a request in production. Transaction-scoped (`SET LOCAL`) so the
   * role/tenant reset automatically and never leak to a pooled connection.
   */
  async function asTenant<T>(tenantId: string, fn: (tx: any) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
      return fn(tx);
    });
  }

  // `createIsolatedTestPrismaClient()` returns null when the integration harness
  // has no real DB (e.g. the merged-coverage run without Docker/testcontainers) —
  // even if DATABASE_URL is set. Skip every test in that case, like the other
  // DB-backed integration suites, rather than throwing on a null client.
  beforeEach((ctx) => {
    if (!prisma || rlsUnavailable) ctx.skip();
  });

  beforeAll(async () => {
    prisma = createIsolatedTestPrismaClient();
    if (!prisma) return; // infra unavailable — beforeEach will skip the tests

    // Probe the Supabase-style runtime: can the `authenticated` role read a table?
    // (Throws 42501 "permission denied" / "role does not exist" on a bare CI test
    // DB.) If not, skip the suite rather than failing on every assertion.
    try {
      await prisma.$transaction(async (tx: any) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
        await tx.$queryRawUnsafe('SELECT 1 FROM accounts LIMIT 1');
      });
    } catch {
      rlsUnavailable = true;
      return; // beforeEach will skip the tests
    }

    // Setup runs as owner/superuser (RLS bypassed) so we can plant rows in BOTH
    // tenants deterministically.
    const [tA, tB] = await Promise.all([
      prisma.tenant.create({ data: { name: `${TAG}-A`, slug: `${TAG}-a` } }),
      prisma.tenant.create({ data: { name: `${TAG}-B`, slug: `${TAG}-b` } }),
    ]);
    tenantA = tA.id;
    tenantB = tB.id;

    const [uA, uB] = await Promise.all([
      prisma.user.create({ data: { email: `${TAG}-a@example.com`, tenantId: tenantA } }),
      prisma.user.create({ data: { email: `${TAG}-b@example.com`, tenantId: tenantB } }),
    ]);

    const [aA, aB] = await Promise.all([
      prisma.account.create({ data: { name: `${TAG}-acctA`, tenantId: tenantA, ownerId: uA.id } }),
      prisma.account.create({ data: { name: `${TAG}-acctB`, tenantId: tenantB, ownerId: uB.id } }),
    ]);
    acctA = aA.id;
    acctB = aB.id;
    expect(acctA && acctB).toBeTruthy();
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.account.deleteMany({ where: { name: { startsWith: TAG } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
    await prisma.tenant.deleteMany({ where: { name: { startsWith: TAG } } });
    await prisma.$disconnect();
  });

  it('a tenant-scoped query returns ONLY the active tenant rows', async () => {
    const rows = await asTenant<Array<{ tenantId: string }>>(tenantA, (tx) =>
      tx.$queryRawUnsafe(`SELECT "tenantId" FROM accounts WHERE name LIKE '${TAG}%'`)
    );
    expect(rows.map((r) => r.tenantId)).toEqual([tenantA]); // B's row is hidden
  });

  it('cross-tenant READ is denied — A cannot see B', async () => {
    const rows = await asTenant<Array<{ id: string }>>(tenantA, (tx) =>
      tx.$queryRawUnsafe(`SELECT id FROM accounts WHERE id = '${acctB}'`)
    );
    expect(rows).toHaveLength(0);
  });

  it('cross-tenant WRITE is denied — A cannot update B', async () => {
    const affected = await asTenant<number>(tenantA, (tx) =>
      tx.$executeRawUnsafe(`UPDATE accounts SET name = '${TAG}-HACKED' WHERE id = '${acctB}'`)
    );
    expect(affected).toBe(0); // RLS hides B's row from A → zero rows affected
    const b = await prisma.account.findUnique({ where: { id: acctB } });
    expect(b?.name).toBe(`${TAG}-acctB`); // genuinely untouched
  });

  it('cross-tenant DELETE is denied — A cannot delete B', async () => {
    const affected = await asTenant<number>(tenantA, (tx) =>
      tx.$executeRawUnsafe(`DELETE FROM accounts WHERE id = '${acctB}'`)
    );
    expect(affected).toBe(0);
    const b = await prisma.account.findUnique({ where: { id: acctB } });
    expect(b).not.toBeNull();
  });

  it('the OTHER tenant still sees its own row when scoped to itself', async () => {
    const bSeesB = await asTenant<Array<{ id: string }>>(tenantB, (tx) =>
      tx.$queryRawUnsafe(`SELECT id FROM accounts WHERE id = '${acctB}'`)
    );
    expect(bSeesB).toHaveLength(1);
  });
});
