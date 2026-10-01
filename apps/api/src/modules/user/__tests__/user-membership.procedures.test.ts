/**
 * user.listTenants and user.claimLoginGrant (ADR-071 session procedures).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { userRouter } from '../user.router';
import { reasonFromCause } from '../../../security/membership';
import { baseSessionCache, clearAllSessionCaches } from '../../../security/session-cache';

const HOME = 'tenant-home';
const CLIENT = 'tenant-client';
const OTHER = 'tenant-other';
const USER_ID = 'user-1';

const NOW = Date.now();
const HOUR = 3600_000;

const sessionUser = {
  userId: USER_ID,
  email: 'u@example.com',
  role: 'SALES_REP',
  tenantId: HOME,
  homeTenantId: HOME,
  emailVerified: true,
  sessionId: 'session-A',
};

function makePrisma() {
  return {
    tenant: { findUnique: vi.fn(), findMany: vi.fn() },
    tenantMembership: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    partnerLoginGrant: { findUnique: vi.fn(), updateMany: vi.fn() },
    tenantMembershipAudit: { create: vi.fn() },
  };
}

type Db = ReturnType<typeof makePrisma>;

const tenants = [
  { id: HOME, name: 'Home Co', slug: 'home' },
  { id: CLIENT, name: 'Client Co', slug: 'client' },
  { id: OTHER, name: 'Other Co', slug: 'other' },
];

const caller = (prisma: Db, ctx: Record<string, unknown>) =>
  userRouter.createCaller({ prisma, ...ctx } as never);

async function rejection(promise: Promise<unknown>): Promise<TRPCError> {
  try {
    await promise;
  } catch (error) {
    return error as TRPCError;
  }
  throw new Error('expected a rejection');
}

beforeEach(() => {
  clearAllSessionCaches();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('user.listTenants', () => {
  it('returns only the home tenant while switching is disabled', async () => {
    const prisma = makePrisma();
    prisma.tenant.findMany.mockResolvedValue([tenants[0]]);

    const result = await caller(prisma, { user: sessionUser }).listTenants();

    expect(prisma.tenantMembership.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      activeTenantId: HOME,
      homeTenantId: HOME,
      pinned: false,
      tenants: [
        {
          tenantId: HOME,
          name: 'Home Co',
          slug: 'home',
          role: 'MEMBER',
          source: 'HOME',
          pinned: false,
          isHome: true,
          isActive: true,
        },
      ],
    });
  });

  it('lists home plus live NON-pinned memberships when enabled, asking only for those', async () => {
    vi.stubEnv('INHERITED_MEMBERSHIP_ENABLED', '1');
    const prisma = makePrisma();
    prisma.tenantMembership.findMany.mockResolvedValue([
      { tenantId: CLIENT, role: 'ADMIN', source: 'PORTAL_MEMBER' },
      { tenantId: OTHER, role: 'USER', source: 'OWNER_INVITE' },
    ]);
    prisma.tenant.findMany.mockResolvedValue(tenants);

    const result = await caller(prisma, { user: sessionUser }).listTenants();

    const where = prisma.tenantMembership.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({
      userId: USER_ID,
      pinned: false,
      source: { not: 'HOME' },
      revokedAt: null,
    });
    expect(where.OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }]);

    expect(result.tenants.map((t) => [t.tenantId, t.role, t.source, t.isHome, t.isActive])).toEqual(
      [
        [HOME, 'MEMBER', 'HOME', true, true],
        [CLIENT, 'ADMIN', 'PORTAL_MEMBER', false, false],
        [OTHER, 'MEMBER', 'OWNER_INVITE', false, false],
      ]
    );
  });

  it('marks the active membership tenant and reads the real home role from the user row', async () => {
    vi.stubEnv('INHERITED_MEMBERSHIP_ENABLED', '1');
    const prisma = makePrisma();
    prisma.tenantMembership.findMany.mockResolvedValue([
      { tenantId: CLIENT, role: 'USER', source: 'PORTAL_MEMBER' },
    ]);
    prisma.tenant.findMany.mockResolvedValue(tenants);
    prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });

    const result = await caller(prisma, {
      user: { ...sessionUser, tenantId: CLIENT, role: 'USER' },
    }).listTenants();

    expect(result.activeTenantId).toBe(CLIENT);
    expect(result.homeTenantId).toBe(HOME);
    const home = result.tenants.find((t) => t.isHome)!;
    expect(home).toMatchObject({ role: 'ADMIN', isActive: false });
    expect(result.tenants.find((t) => t.tenantId === CLIENT)).toMatchObject({
      role: 'MEMBER',
      isActive: true,
    });
  });

  it('gives a pinned session exactly one entry: the workspace it was opened into', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue(tenants[1]);
    prisma.tenantMembership.findUnique.mockResolvedValue({
      role: 'ADMIN',
      source: 'PORTAL_STAFF',
      revokedAt: null,
      expiresAt: new Date(NOW + HOUR),
    });

    const result = await caller(prisma, {
      user: { ...sessionUser, tenantId: CLIENT, pinned: true },
    }).listTenants();

    expect(prisma.tenantMembership.findMany).not.toHaveBeenCalled();
    expect(result.pinned).toBe(true);
    expect(result.tenants).toEqual([
      {
        tenantId: CLIENT,
        name: 'Client Co',
        slug: 'client',
        role: 'ADMIN',
        source: 'PORTAL_STAFF',
        pinned: true,
        isHome: false,
        isActive: true,
      },
    ]);
  });

  it('is UNAUTHORIZED for a pinned session whose membership ended', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue(tenants[1]);
    prisma.tenantMembership.findUnique.mockResolvedValue({
      role: 'ADMIN',
      source: 'PORTAL_STAFF',
      revokedAt: new Date(NOW - 1000),
      expiresAt: null,
    });
    const error = await rejection(
      caller(prisma, { user: { ...sessionUser, tenantId: CLIENT, pinned: true } }).listTenants()
    );
    expect(error.code).toBe('UNAUTHORIZED');
  });
});

describe('user.claimLoginGrant', () => {
  const grantRow = (over: Record<string, unknown> = {}) => ({
    id: 'grant-1',
    userId: USER_ID,
    tenantId: CLIENT,
    partnerId: 'partner-1',
    kind: 'staff',
    pinned: true,
    expiresAt: new Date(NOW + 10 * 60_000),
    claimedAt: null,
    ...over,
  });

  const liveMembership = { revokedAt: null, expiresAt: new Date(NOW + 24 * HOUR) };

  function ready(over: { grant?: Record<string, unknown> | null; membership?: unknown } = {}) {
    const prisma = makePrisma();
    prisma.partnerLoginGrant.findUnique.mockResolvedValue(
      over.grant === null ? null : grantRow(over.grant)
    );
    prisma.tenantMembership.findUnique.mockResolvedValue(
      over.membership === undefined ? liveMembership : over.membership
    );
    prisma.partnerLoginGrant.updateMany.mockResolvedValue({ count: 1 });
    prisma.tenantMembershipAudit.create.mockResolvedValue({});
    return prisma;
  }

  async function refused(prisma: Db, ctx: Record<string, unknown> = { user: sessionUser }) {
    const error = await rejection(caller(prisma, ctx).claimLoginGrant({ grant: 'grant-1' }));
    expect(error.code).toBe('FORBIDDEN');
    expect(reasonFromCause(error.cause)).toBe('GRANT_INVALID');
    expect(prisma.partnerLoginGrant.updateMany).not.toHaveBeenCalled();
  }

  it('claims a pinned grant: binds the session, opens a 12 hour window, audits, evicts the cache', async () => {
    const prisma = ready();
    baseSessionCache.set(USER_ID, USER_ID, { tenantId: HOME });

    const before = Date.now();
    const result = await caller(prisma, { user: sessionUser }).claimLoginGrant({
      grant: 'grant-1',
    });

    expect(result.tenantId).toBe(CLIENT);
    expect(result.pinned).toBe(true);
    const expires = new Date(result.sessionExpiresAt!).getTime();
    expect(expires).toBeGreaterThanOrEqual(before + 12 * HOUR);
    expect(expires).toBeLessThanOrEqual(Date.now() + 12 * HOUR);

    const call = prisma.partnerLoginGrant.updateMany.mock.calls[0]![0];
    // The atomic guard: only an unclaimed, in-window grant of THIS user can be claimed.
    expect(call.where).toMatchObject({ id: 'grant-1', userId: USER_ID, claimedAt: null });
    expect(call.where.expiresAt).toEqual({ gt: expect.any(Date) });
    expect(call.data).toMatchObject({ claimedSessionId: 'session-A' });
    expect(call.data.sessionExpiresAt).toBeInstanceOf(Date);

    expect(prisma.tenantMembershipAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: CLIENT,
        userId: USER_ID,
        partnerId: 'partner-1',
        action: 'GRANT_CLAIMED',
        actor: `user:${USER_ID}`,
        detail: { grantId: 'grant-1', kind: 'staff', pinned: true },
      }),
    });
    expect(baseSessionCache.get(USER_ID)).toBeNull();
  });

  it('claims a member grant without a session deadline', async () => {
    const prisma = ready({ grant: { pinned: false, kind: 'member' } });
    const result = await caller(prisma, { user: sessionUser }).claimLoginGrant({
      grant: 'grant-1',
    });
    expect(result).toEqual({ tenantId: CLIENT, pinned: false, sessionExpiresAt: null });
    expect(prisma.partnerLoginGrant.updateMany.mock.calls[0]![0].data.sessionExpiresAt).toBeNull();
  });

  it('accepts a PIN_PENDING session: the pending user is promoted', async () => {
    const prisma = ready();
    const result = await caller(prisma, {
      user: null,
      pendingUser: { ...sessionUser, pinPending: true },
    }).claimLoginGrant({ grant: 'grant-1' });
    expect(result.pinned).toBe(true);
  });

  it('refuses an unknown grant', async () => {
    await refused(ready({ grant: null }));
  });

  it("refuses another user's grant with the same error (no oracle)", async () => {
    await refused(ready({ grant: { userId: 'someone-else' } }));
  });

  it('refuses an expired grant', async () => {
    await refused(ready({ grant: { expiresAt: new Date(NOW - 1000) } }));
  });

  it('refuses an already claimed grant', async () => {
    await refused(ready({ grant: { claimedAt: new Date(NOW - 1000) } }));
  });

  it('refuses a session without a session id', async () => {
    await refused(ready(), { user: { ...sessionUser, sessionId: undefined } });
  });

  it('refuses when the membership was revoked, expired or never existed', async () => {
    await refused(ready({ membership: { revokedAt: new Date(NOW - 1), expiresAt: null } }));
    await refused(ready({ membership: { revokedAt: null, expiresAt: new Date(NOW - 1) } }));
    await refused(ready({ membership: null }));
  });

  it('refuses when a concurrent claim won the atomic update', async () => {
    const prisma = ready();
    prisma.partnerLoginGrant.updateMany.mockResolvedValue({ count: 0 });
    const error = await rejection(
      caller(prisma, { user: sessionUser }).claimLoginGrant({ grant: 'grant-1' })
    );
    expect(reasonFromCause(error.cause)).toBe('GRANT_INVALID');
    expect(prisma.tenantMembershipAudit.create).not.toHaveBeenCalled();
  });

  it('allows a legacy grant for a home user who has no membership row', async () => {
    const prisma = ready({
      grant: { kind: 'legacy', pinned: false, tenantId: HOME },
      membership: null,
    });
    const result = await caller(prisma, { user: sessionUser }).claimLoginGrant({
      grant: 'grant-1',
    });
    expect(result.tenantId).toBe(HOME);
  });

  it('still succeeds, and logs, when the audit row cannot be written', async () => {
    const prisma = ready();
    prisma.tenantMembershipAudit.create.mockRejectedValue(new Error('db down'));
    const result = await caller(prisma, { user: sessionUser }).claimLoginGrant({
      grant: 'grant-1',
    });
    expect(result.pinned).toBe(true);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('GRANT_CLAIMED'),
      expect.objectContaining({ grantId: 'grant-1' })
    );
  });

  it('requires a session', async () => {
    const error = await rejection(
      caller(ready(), { user: null }).claimLoginGrant({ grant: 'grant-1' })
    );
    expect(error.code).toBe('UNAUTHORIZED');
  });
});

describe('user.list (assignee picker) sees visiting members', () => {
  it('combines the tenant filter and the search filter instead of overwriting one with the other', async () => {
    const prisma = { ...makePrisma(), user: { findUnique: vi.fn(), findMany: vi.fn() } };
    prisma.user.findMany.mockResolvedValue([]);

    await caller(prisma as never, {
      user: { ...sessionUser, tenantId: CLIENT },
    }).list({ search: 'ann', limit: 5 });

    const where = prisma.user.findMany.mock.calls[0]![0].where;
    expect(where.AND).toHaveLength(2);
    // First: home users of CLIENT or live members of CLIENT.
    expect(where.AND[0].OR).toEqual([
      expect.objectContaining({ tenantId: CLIENT }),
      { memberships: { some: expect.objectContaining({ tenantId: CLIENT }) } },
    ]);
    // Second: the free-text search, untouched.
    expect(where.AND[1].OR).toHaveLength(4);
  });

  it('applies only the tenant filter when there is no search', async () => {
    const prisma = { ...makePrisma(), user: { findUnique: vi.fn(), findMany: vi.fn() } };
    prisma.user.findMany.mockResolvedValue([]);

    await caller(prisma as never, { user: sessionUser }).list({ limit: 5 });

    expect(prisma.user.findMany.mock.calls[0]![0].where.AND).toHaveLength(1);
  });
});
