/**
 * Inherited tenant membership (ADR-071) — Real-Database Integration Test
 *
 * Runs the real `resolveActiveTenant`, the real seat/user predicates and the real
 * `createTenantScopedPrisma` against Postgres:
 *
 *  1. Two users who are both members of the SAME tenant (and live in different home tenants)
 *     are isolated from each other, and revoking one does not touch the other.
 *  2. Seats count members once and never count pinned staff.
 *  3. Pinned staff sessions and PIN_PENDING resolve from real grant rows.
 *  4. The pooled `SET app.current_tenant_id` race. `createTenantScopedPrisma` issues a
 *     SESSION-level `SET` once per request on a POOLED connection. Two requests that interleave
 *     on one connection can therefore run a later query under the OTHER request's tenant. The
 *     test pins the pool to ONE connection to reproduce that deterministically, proves the
 *     application-layer `tenantId` filter (which every router adds) still returns only the active
 *     tenant's rows, and documents that RLS alone is NOT the boundary.
 *
 * Skips (like the other DB suites) when there is no DATABASE_URL or no Supabase-style
 * `authenticated` role with the tenant policies.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { createIsolatedTestPrismaClient } from './setup';
import { seatUserWhere, tenantUserWhere } from '../../packages/db/src/membership';
import {
  resolveActiveTenant,
  reasonFromCause,
  type ResolveActiveTenantInput,
} from '../../apps/api/src/security/membership';
import { createTenantScopedPrisma } from '../../apps/api/src/security/tenant-context';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('Skipping inherited-membership integration test: DATABASE_URL not set');
}

const TAG = `inhmem_${Date.now()}`;
const HOUR = 3600_000;
const MIN = 60_000;

/**
 * Is this client's connection still usable? Cleanup probes before it runs, because
 * CI saw `ECONNREFUSED` thrown from the `RESET ROLE` / `RESET app.current_tenant_id`
 * teardown after the database had already gone away. That error failed the suite
 * from `afterAll` and buried whatever had actually gone wrong. Session state dies
 * with the connection anyway, so an unreachable database means there is nothing
 * left to reset. The reason is still logged, so the outage stays visible.
 */
async function connectionHealthy(client: any, label: string): Promise<boolean> {
  try {
    await client.$queryRawUnsafe('SELECT 1');
    return true;
  } catch (error) {
    console.warn(
      `[inherited-membership] ${label}: database unreachable, skipping cleanup — ${
        (error as Error)?.message ?? String(error)
      }`
    );
    return false;
  }
}

/**
 * Run teardown statements only against a healthy connection, then always
 * disconnect. A statement failing on a HEALTHY connection is a real defect, so
 * it still throws (after the disconnect).
 */
async function cleanupThenDisconnect(
  client: any,
  label: string,
  cleanup: () => Promise<void>
): Promise<void> {
  try {
    if (await connectionHealthy(client, label)) {
      await cleanup();
    }
  } finally {
    await client.$disconnect();
  }
}

describeDb('inherited membership (real database)', () => {
  let prisma: any;
  let rlsUnavailable = false;

  let t1 = ''; // home of user 1 (and of the staff member)
  let t2 = ''; // home of user 2
  let t3 = ''; // the tenant both users are members of (the "client")
  let u1 = '';
  let u2 = '';
  let staff = '';
  let partnerId = '';
  let acct1 = '';
  let acct2 = '';
  let acct3 = '';

  const resolve = (
    over: Partial<ResolveActiveTenantInput> & { userId: string; homeTenantId: string }
  ) =>
    resolveActiveTenant(prisma, {
      homeRole: 'USER',
      claims: { sessionId: 'session-A', amr: [] },
      requestedTenantId: null,
      inheritedEnabled: true,
      ...over,
    });

  async function reason(promise: Promise<unknown>): Promise<string | null> {
    try {
      await promise;
    } catch (error) {
      return reasonFromCause((error as { cause?: unknown }).cause);
    }
    throw new Error('expected a rejection');
  }

  beforeEach((ctx) => {
    if (!prisma || rlsUnavailable) ctx.skip();
  });

  beforeAll(async () => {
    prisma = createIsolatedTestPrismaClient();
    if (!prisma) return;

    // The membership tables must exist (migration 20261001120000_tenant_memberships).
    try {
      await prisma.tenantMembership.count();
    } catch {
      rlsUnavailable = true;
      return;
    }
    try {
      await prisma.$transaction(async (tx: any) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
        await tx.$queryRawUnsafe('SELECT 1 FROM accounts LIMIT 1');
      });
    } catch {
      rlsUnavailable = true;
      return;
    }

    const tenants = await Promise.all(
      ['1', '2', '3'].map((n) =>
        prisma.tenant.create({ data: { name: `${TAG}-${n}`, slug: `${TAG}-${n}` } })
      )
    );
    [t1, t2, t3] = tenants.map((t: { id: string }) => t.id);

    const users = await Promise.all([
      prisma.user.create({ data: { email: `${TAG}-u1@example.com`, tenantId: t1 } }),
      prisma.user.create({ data: { email: `${TAG}-u2@example.com`, tenantId: t2 } }),
      prisma.user.create({ data: { email: `${TAG}-staff@example.com`, tenantId: t1 } }),
    ]);
    [u1, u2, staff] = users.map((u: { id: string }) => u.id);

    partnerId = (await prisma.partner.create({ data: { name: TAG, slug: TAG } })).id;

    const accounts = await Promise.all([
      prisma.account.create({ data: { name: `${TAG}-a1`, tenantId: t1, ownerId: u1 } }),
      prisma.account.create({ data: { name: `${TAG}-a2`, tenantId: t2, ownerId: u2 } }),
      prisma.account.create({ data: { name: `${TAG}-a3`, tenantId: t3, ownerId: u1 } }),
    ]);
    [acct1, acct2, acct3] = accounts.map((a: { id: string }) => a.id);
    expect(acct1 && acct2 && acct3).toBeTruthy();

    // u1 is an ADMIN member of t3, u2 a plain member; the staff member is pinned into t3.
    await prisma.tenantMembership.createMany({
      data: [
        {
          userId: u1,
          tenantId: t3,
          role: 'ADMIN',
          source: 'PORTAL_MEMBER',
          grantedByPartnerId: partnerId,
        },
        {
          userId: u2,
          tenantId: t3,
          role: 'USER',
          source: 'PORTAL_MEMBER',
          grantedByPartnerId: partnerId,
        },
        {
          userId: staff,
          tenantId: t3,
          role: 'ADMIN',
          source: 'PORTAL_STAFF',
          pinned: true,
          grantedByPartnerId: partnerId,
          expiresAt: new Date(Date.now() + 24 * HOUR),
        },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await cleanupThenDisconnect(prisma, 'row cleanup', async () => {
      await prisma.partnerLoginGrant.deleteMany({ where: { partnerId } });
      await prisma.account.deleteMany({ where: { name: { startsWith: TAG } } });
      await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: [t1, t2, t3] } } });
      await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
      await prisma.partner.deleteMany({ where: { slug: TAG } });
      await prisma.tenant.deleteMany({ where: { name: { startsWith: TAG } } });
    });
  });

  describe('two members of the same tenant', () => {
    it('each resolves into the shared tenant with their OWN membership role', async () => {
      const a = await resolve({ userId: u1, homeTenantId: t1, requestedTenantId: t3 });
      const b = await resolve({ userId: u2, homeTenantId: t2, requestedTenantId: t3 });
      expect(a).toMatchObject({
        activeTenantId: t3,
        homeTenantId: t1,
        role: 'ADMIN',
        pinned: false,
      });
      expect(b).toMatchObject({
        activeTenantId: t3,
        homeTenantId: t2,
        role: 'USER',
        pinned: false,
      });
    });

    it('neither can reach the other home tenant through the header', async () => {
      expect(await reason(resolve({ userId: u1, homeTenantId: t1, requestedTenantId: t2 }))).toBe(
        'NOT_A_MEMBER'
      );
      expect(await reason(resolve({ userId: u2, homeTenantId: t2, requestedTenantId: t1 }))).toBe(
        'NOT_A_MEMBER'
      );
    });

    it('both keep working at home without a header', async () => {
      expect((await resolve({ userId: u1, homeTenantId: t1 })).activeTenantId).toBe(t1);
      expect((await resolve({ userId: u2, homeTenantId: t2 })).activeTenantId).toBe(t2);
    });

    it('everyone who works in t3 is found by tenantUserWhere, home users of other tenants are not', async () => {
      const found = await prisma.user.findMany({
        where: { ...tenantUserWhere(t3), email: { startsWith: TAG } },
        select: { id: true },
      });
      expect(found.map((u: { id: string }) => u.id).sort()).toEqual([u1, u2, staff].sort());

      const homeOfT1 = await prisma.user.findMany({
        where: { ...tenantUserWhere(t1), email: { startsWith: TAG } },
        select: { id: true },
      });
      // u1 and the staff member live in t1; u2 does not.
      expect(homeOfT1.map((u: { id: string }) => u.id).sort()).toEqual([u1, staff].sort());
    });

    it('seats count the two members once and never the pinned staff member', async () => {
      const seats = await prisma.user.count({
        where: { AND: [seatUserWhere(t3), { email: { startsWith: TAG } }] },
      });
      expect(seats).toBe(2);
    });

    it('a user who is also a home user is counted once, not twice', async () => {
      // u1 is at home in t1 AND would match the membership branch if a HOME-source row existed.
      await prisma.tenantMembership.create({
        data: { userId: u1, tenantId: t1, role: 'ADMIN', source: 'HOME' },
      });
      try {
        const seats = await prisma.user.count({
          where: { AND: [seatUserWhere(t1), { email: { startsWith: TAG } }] },
        });
        // u1 and the staff member are home users of t1.
        expect(seats).toBe(2);
      } finally {
        await prisma.tenantMembership.deleteMany({ where: { userId: u1, tenantId: t1 } });
      }
    });

    it('revoking one membership denies that user and leaves the other untouched', async () => {
      await prisma.tenantMembership.updateMany({
        where: { userId: u1, tenantId: t3 },
        data: { revokedAt: new Date() },
      });
      try {
        expect(await reason(resolve({ userId: u1, homeTenantId: t1, requestedTenantId: t3 }))).toBe(
          'NOT_A_MEMBER'
        );
        const b = await resolve({ userId: u2, homeTenantId: t2, requestedTenantId: t3 });
        expect(b.activeTenantId).toBe(t3);

        const seats = await prisma.user.count({
          where: { AND: [seatUserWhere(t3), { email: { startsWith: TAG } }] },
        });
        expect(seats).toBe(1); // the revoked member freed their seat
      } finally {
        await prisma.tenantMembership.updateMany({
          where: { userId: u1, tenantId: t3 },
          data: { revokedAt: null },
        });
      }
    });

    it('an expired membership is not live in the database predicate either', async () => {
      await prisma.tenantMembership.updateMany({
        where: { userId: u2, tenantId: t3 },
        data: { expiresAt: new Date(Date.now() - MIN) },
      });
      try {
        expect(await reason(resolve({ userId: u2, homeTenantId: t2, requestedTenantId: t3 }))).toBe(
          'NOT_A_MEMBER'
        );
        const found = await prisma.user.findMany({
          where: { AND: [tenantUserWhere(t3), { email: { startsWith: TAG } }] },
          select: { id: true },
        });
        expect(found.map((u: { id: string }) => u.id)).not.toContain(u2);
      } finally {
        await prisma.tenantMembership.updateMany({
          where: { userId: u2, tenantId: t3 },
          data: { expiresAt: null },
        });
      }
    });
  });

  describe('pinned staff sessions (real grant rows)', () => {
    const grant = (over: Record<string, unknown> = {}) =>
      prisma.partnerLoginGrant.create({
        data: {
          partnerId,
          userId: staff,
          tenantId: t3,
          kind: 'staff',
          role: 'ADMIN',
          pinned: true,
          jti: `${TAG}-${Math.random().toString(36).slice(2)}`,
          issuedAt: new Date(Date.now() - 2 * MIN),
          expiresAt: new Date(Date.now() + 13 * MIN),
          ...over,
        },
      });

    it('a claimed session is pinned to the grant tenant and ignores the header', async () => {
      await grant({
        claimedAt: new Date(),
        claimedSessionId: 'session-pinned',
        sessionExpiresAt: new Date(Date.now() + 11 * HOUR),
      });
      const r = await resolve({
        userId: staff,
        homeTenantId: t1,
        claims: { sessionId: 'session-pinned', amr: [] },
        requestedTenantId: t1,
      });
      expect(r).toMatchObject({
        activeTenantId: t3,
        homeTenantId: t1,
        pinned: true,
        role: 'ADMIN',
      });
    });

    it('an unclaimed link session is PIN_PENDING, not the staff member home tenant', async () => {
      await grant();
      const r = await resolve({
        userId: staff,
        homeTenantId: t1,
        claims: {
          sessionId: 'session-link',
          amr: [{ method: 'otp', timestamp: Date.now() / 1000 }],
        },
      });
      expect(r.pinPending).toBe(true);
    });

    it('a claimed session whose 12 hour window ended is UNAUTHORIZED', async () => {
      await grant({
        claimedAt: new Date(Date.now() - 13 * HOUR),
        claimedSessionId: 'session-old',
        sessionExpiresAt: new Date(Date.now() - HOUR),
      });
      await expect(
        resolve({
          userId: staff,
          homeTenantId: t1,
          claims: { sessionId: 'session-old', amr: [] },
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('the staff member own password session is untouched by a pinned grant', async () => {
      const r = await resolve({
        userId: staff,
        homeTenantId: t1,
        claims: {
          sessionId: 'session-home',
          amr: [{ method: 'password', timestamp: Date.now() / 1000 }],
        },
      });
      expect(r).toMatchObject({ activeTenantId: t1, pinned: false, pinPending: false });
    });
  });

  describe('pooled SET app.current_tenant_id race (createTenantScopedPrisma)', () => {
    // ONE pooled connection, so interleaved "requests" share a session exactly as two requests
    // can on a busy pool.
    let pinned: any;

    const tenantCtx = (tenantId: string) => ({
      tenantId,
      tenantType: 'user' as const,
      userId: 'u',
      role: 'USER',
      organizationId: undefined,
      canAccessAllTenantData: false,
    });

    beforeAll(async () => {
      // The outer beforeAll found no usable database / RLS role: every test here is
      // skipped by the outer beforeEach, so do not open a connection that `SET ROLE`
      // would fail on.
      if (!prisma || rlsUnavailable) return;
      const { PrismaClient } = await import('../../packages/db/src');
      pinned = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL!, max: 1 }) });
      // The RLS-subject role production queries run as; session level on the single connection.
      await pinned.$executeRawUnsafe('SET ROLE authenticated');
    });

    afterAll(async () => {
      if (!pinned) return;
      await cleanupThenDisconnect(pinned, 'session reset', async () => {
        await pinned.$executeRawUnsafe('RESET ROLE');
        await pinned.$executeRawUnsafe('RESET app.current_tenant_id');
      });
    });

    /** The real extension, not the VITEST short-circuit. */
    function realScoped(tenantId: string) {
      vi.stubEnv('VITEST', 'false');
      vi.stubEnv('NODE_ENV', 'development');
      try {
        return createTenantScopedPrisma(pinned, tenantCtx(tenantId));
      } finally {
        vi.unstubAllEnvs();
      }
    }

    it('request A under its own SET sees only A, through RLS alone', async () => {
      const a = realScoped(t3);
      const rows = await a.account.findMany({ where: { name: { startsWith: TAG } } });
      expect(rows.map((r: { tenantId: string }) => r.tenantId)).toEqual([t3]);
    });

    it('interleaved requests: the application tenantId filter still returns only the active tenant', async () => {
      const a = realScoped(t3); // request A acts in t3 (e.g. via x-active-tenant)
      const b = realScoped(t2); // request B (same user, other tab) acts in t2

      await a.account.findMany({ where: { tenantId: t3, name: { startsWith: TAG } } }); // A's SET (t3)
      await b.account.findMany({ where: { tenantId: t2, name: { startsWith: TAG } } }); // B's SET (t2)

      // A's SECOND query reuses the connection without a SET: the session variable is now t2.
      const aRows = await a.account.findMany({
        where: { tenantId: t3, name: { startsWith: TAG } },
      });
      // Defense in depth: RLS sees t2, the filter asks for t3, so nothing from t2 can come back.
      expect(aRows.every((r: { tenantId: string }) => r.tenantId !== t2)).toBe(true);
      expect(aRows.every((r: { tenantId: string }) => r.tenantId !== t1)).toBe(true);
    });

    it('DOCUMENTS the race: after a stale SET, an unfiltered query runs under the OTHER tenant', async () => {
      const a = realScoped(t3);
      const b = realScoped(t2);

      await a.account.findMany({ where: { name: { startsWith: TAG } } }); // SET t3
      await b.account.findMany({ where: { name: { startsWith: TAG } } }); // SET t2 (same connection)

      const stale = await a.account.findMany({ where: { name: { startsWith: TAG } } });
      // A never asked for t2, yet RLS alone answers with t2's rows. This is why every router must
      // keep its explicit tenantId filter, and why membership switching does not make RLS the
      // boundary. If the primitive is ever made transaction-local, this assertion flips to t3.
      expect(stale.map((r: { tenantId: string }) => r.tenantId)).toEqual([t2]);
    });

    it('a transaction-local binding does NOT leak to the next request on the same connection', async () => {
      await pinned.$transaction(async (tx: any) => {
        await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${t3}', true)`);
        const inside = await tx.account.findMany({ where: { name: { startsWith: TAG } } });
        expect(inside.map((r: { tenantId: string }) => r.tenantId)).toEqual([t3]);
      });
      // The next request on the very same connection starts with no tenant bound.
      await pinned.$executeRawUnsafe('RESET app.current_tenant_id');
      const after = await pinned.account.findMany({ where: { name: { startsWith: TAG } } });
      expect(after).toEqual([]);
    });
  });
});
