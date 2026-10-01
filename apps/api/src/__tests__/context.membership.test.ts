/**
 * createContext under ADR-071: active-tenant resolution from `x-active-tenant`, the session cache
 * keyed by (user, tenant, session) with eviction on revoke, pinned staff sessions and PIN_PENDING.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    tenantMembership: { findMany: vi.fn() },
    partnerLoginGrant: { findFirst: vi.fn(), findMany: vi.fn() },
  };
  return { prisma, verifyToken: vi.fn() };
});

vi.mock('../container', () => ({
  container: {},
  containerReady: Promise.resolve(),
  apiPrisma: mocks.prisma,
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: { auth: { admin: { updateUserById: vi.fn().mockResolvedValue({}) } } },
  verifyToken: mocks.verifyToken,
}));

import { createContext, createWSContext } from '../context';
import { clearAllSessionCaches, invalidateUserSessions } from '../security/session-cache';
import { reasonFromCause } from '../security/membership';

const HOME = 'tenant-home';
const CLIENT = 'tenant-client';
const OTHER = 'tenant-other';
const USER_ID = '11111111-1111-4111-8111-111111111111';

const dbUser = {
  id: USER_ID,
  email: 'member@example.com',
  name: 'Member',
  role: 'SALES_REP',
  tenantId: HOME,
  stripeCustomerId: null,
  timezone: 'Europe/London',
  avatarUrl: 'https://example.com/a.png',
  emailVerified: true,
};

const NOW = Date.now();

function jwt(payload: Record<string, unknown>) {
  return `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;
}
const sessionToken = (sessionId = 'session-A', amr: unknown[] = []) =>
  jwt({ sub: USER_ID, session_id: sessionId, amr });

function request(token: string, activeTenant?: string) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (activeTenant) headers['x-active-tenant'] = activeTenant;
  return new Request('http://localhost/api/trpc/x', { headers });
}

const membership = (tenantId: string, over: Record<string, unknown> = {}) => ({
  tenantId,
  role: 'USER',
  source: 'PORTAL_MEMBER',
  pinned: false,
  expiresAt: null,
  revokedAt: null,
  ...over,
});

beforeEach(() => {
  clearAllSessionCaches();
  vi.stubEnv('INHERITED_MEMBERSHIP_ENABLED', '1');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.prisma.user.findUnique.mockResolvedValue(dbUser);
  mocks.prisma.user.update.mockResolvedValue(dbUser);
  mocks.prisma.tenantMembership.findMany.mockResolvedValue([]);
  mocks.prisma.partnerLoginGrant.findFirst.mockResolvedValue(null);
  mocks.prisma.partnerLoginGrant.findMany.mockResolvedValue([]);
  mocks.verifyToken.mockResolvedValue({
    user: { id: USER_ID, email: dbUser.email, user_metadata: {}, email_confirmed_at: '2026-01-01' },
    error: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('createContext: active tenant', () => {
  it('acts in the home tenant by default', async () => {
    const ctx = await createContext({ req: request(sessionToken()) });
    expect(ctx.user).toMatchObject({
      userId: USER_ID,
      tenantId: HOME,
      activeTenantId: HOME,
      homeTenantId: HOME,
      role: 'SALES_REP',
      pinned: false,
    });
    expect(ctx.authError).toBeUndefined();
    expect(ctx.pendingUser).toBeUndefined();
  });

  it('acts in the header tenant with a live membership, using the membership role', async () => {
    mocks.prisma.tenantMembership.findMany.mockResolvedValue([
      membership(CLIENT, { role: 'ADMIN' }),
    ]);
    const ctx = await createContext({ req: request(sessionToken(), CLIENT) });
    expect(ctx.user).toMatchObject({
      tenantId: CLIENT,
      activeTenantId: CLIENT,
      homeTenantId: HOME,
      role: 'ADMIN',
      membershipRole: 'ADMIN',
      pinned: false,
    });
  });

  it('exposes FORBIDDEN NOT_A_MEMBER (and no user) for a tenant without a membership', async () => {
    mocks.prisma.tenantMembership.findMany.mockResolvedValue([membership(CLIENT)]);
    const ctx = await createContext({ req: request(sessionToken(), OTHER) });
    expect(ctx.user).toBeNull();
    expect(ctx.authError?.code).toBe('FORBIDDEN');
    expect(reasonFromCause(ctx.authError?.cause)).toBe('NOT_A_MEMBER');
  });

  it('ignores an empty or oversized header', async () => {
    const ctx = await createContext({ req: request(sessionToken(), 'x'.repeat(65)) });
    expect(ctx.user?.tenantId).toBe(HOME);
  });

  it('ignores the header entirely when the flag is off (and refuses a non-home tenant)', async () => {
    vi.stubEnv('INHERITED_MEMBERSHIP_ENABLED', '0');
    mocks.prisma.tenantMembership.findMany.mockResolvedValue([membership(CLIENT)]);
    const ctx = await createContext({ req: request(sessionToken(), CLIENT) });
    expect(ctx.user).toBeNull();
    expect(reasonFromCause(ctx.authError?.cause)).toBe('NOT_A_MEMBER');
  });
});

describe('createContext: session cache', () => {
  it('resolves once per (user, tenant, session) and serves the rest from cache', async () => {
    mocks.prisma.tenantMembership.findMany.mockResolvedValue([membership(CLIENT)]);
    const req = () => request(sessionToken(), CLIENT);
    await createContext({ req: req() });
    await createContext({ req: req() });
    await createContext({ req: req() });
    expect(mocks.prisma.tenantMembership.findMany).toHaveBeenCalledTimes(1);
  });

  it('keeps different header tenants of one user apart', async () => {
    mocks.prisma.tenantMembership.findMany.mockResolvedValue([
      membership(CLIENT),
      membership(OTHER, { role: 'ADMIN' }),
    ]);
    const a = await createContext({ req: request(sessionToken(), CLIENT) });
    const b = await createContext({ req: request(sessionToken(), OTHER) });
    const home = await createContext({ req: request(sessionToken()) });
    expect(a.user?.tenantId).toBe(CLIENT);
    expect(a.user?.role).toBe('USER');
    expect(b.user?.tenantId).toBe(OTHER);
    expect(b.user?.role).toBe('ADMIN');
    expect(home.user?.tenantId).toBe(HOME);
    // Asking for CLIENT again still gets CLIENT, not the last tenant that was resolved.
    const again = await createContext({ req: request(sessionToken(), CLIENT) });
    expect(again.user?.tenantId).toBe(CLIENT);
  });

  it('keeps two browser sessions of one user apart', async () => {
    const s1 = await createContext({ req: request(sessionToken('session-A')) });
    const s2 = await createContext({ req: request(sessionToken('session-B')) });
    expect(s1.user?.sessionId).toBe('session-A');
    expect(s2.user?.sessionId).toBe('session-B');
  });

  it('stops serving a revoked membership as soon as the user cache is evicted', async () => {
    mocks.prisma.tenantMembership.findMany.mockResolvedValue([membership(CLIENT)]);
    const first = await createContext({ req: request(sessionToken(), CLIENT) });
    expect(first.user?.tenantId).toBe(CLIENT);

    // partner.removeMember revokes the row, then evicts the user's cache keys.
    mocks.prisma.tenantMembership.findMany.mockResolvedValue([
      membership(CLIENT, { revokedAt: new Date(NOW) }),
    ]);
    // Until eviction (or the 60 s TTL) the cached session is still served: the documented bound.
    const stale = await createContext({ req: request(sessionToken(), CLIENT) });
    expect(stale.user?.tenantId).toBe(CLIENT);

    invalidateUserSessions(USER_ID);
    const after = await createContext({ req: request(sessionToken(), CLIENT) });
    expect(after.user).toBeNull();
    expect(reasonFromCause(after.authError?.cause)).toBe('NOT_A_MEMBER');
  });

  it('does not cache a denial', async () => {
    mocks.prisma.tenantMembership.findMany.mockResolvedValue([]);
    const denied = await createContext({ req: request(sessionToken(), CLIENT) });
    expect(denied.user).toBeNull();

    mocks.prisma.tenantMembership.findMany.mockResolvedValue([membership(CLIENT)]);
    const granted = await createContext({ req: request(sessionToken(), CLIENT) });
    expect(granted.user?.tenantId).toBe(CLIENT);
  });
});

describe('createContext: pinned staff sessions', () => {
  const staffRow = membership(CLIENT, {
    role: 'ADMIN',
    source: 'PORTAL_STAFF',
    pinned: true,
    expiresAt: new Date(NOW + 24 * 3600_000),
  });

  it('pins a claimed session to the grant tenant, ignores the header and is not a platform admin', async () => {
    mocks.prisma.tenantMembership.findMany.mockResolvedValue([staffRow, membership(OTHER)]);
    mocks.prisma.partnerLoginGrant.findFirst.mockResolvedValue({
      id: 'grant-1',
      tenantId: CLIENT,
      sessionExpiresAt: new Date(NOW + 11 * 3600_000),
    });

    const ctx = await createContext({ req: request(sessionToken(), OTHER) });
    expect(ctx.user).toMatchObject({
      tenantId: CLIENT,
      homeTenantId: HOME,
      pinned: true,
      role: 'ADMIN',
    });
  });

  it('answers a staff-link session that has not claimed its grant with pendingUser and no user', async () => {
    mocks.prisma.tenantMembership.findMany.mockResolvedValue([staffRow]);
    const issuedAt = new Date(NOW - 60_000);
    mocks.prisma.partnerLoginGrant.findMany.mockResolvedValue([
      {
        issuedAt,
        expiresAt: new Date(issuedAt.getTime() + 15 * 60_000),
        claimedSessionId: null,
      },
    ]);
    const token = sessionToken('session-A', [{ method: 'otp', timestamp: Math.floor(NOW / 1000) }]);

    const ctx = await createContext({ req: request(token) });
    expect(ctx.user).toBeNull();
    expect(ctx.pendingUser).toMatchObject({ userId: USER_ID, pinPending: true, tenantId: HOME });
    expect(ctx.authError).toBeUndefined();
  });

  it('never caches a pending session, so the claim takes effect immediately everywhere', async () => {
    mocks.prisma.tenantMembership.findMany.mockResolvedValue([staffRow]);
    const issuedAt = new Date(NOW - 60_000);
    const grant = {
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + 15 * 60_000),
      claimedSessionId: null as string | null,
    };
    mocks.prisma.partnerLoginGrant.findMany.mockResolvedValue([grant]);
    const token = sessionToken('session-A', [{ method: 'otp', timestamp: Math.floor(NOW / 1000) }]);

    expect((await createContext({ req: request(token) })).pendingUser).toBeDefined();

    // The claim lands (on any instance): the very next request resolves as pinned.
    mocks.prisma.partnerLoginGrant.findFirst.mockResolvedValue({
      id: 'grant-1',
      tenantId: CLIENT,
      sessionExpiresAt: new Date(NOW + 11 * 3600_000),
    });
    const claimed = await createContext({ req: request(token) });
    expect(claimed.pendingUser).toBeUndefined();
    expect(claimed.user).toMatchObject({ tenantId: CLIENT, pinned: true });
  });

  it('turns an expired pinned session into UNAUTHORIZED, never into the home tenant', async () => {
    mocks.prisma.tenantMembership.findMany.mockResolvedValue([staffRow]);
    mocks.prisma.partnerLoginGrant.findFirst.mockResolvedValue({
      id: 'grant-1',
      tenantId: CLIENT,
      sessionExpiresAt: new Date(NOW - 1000),
    });
    const ctx = await createContext({ req: request(sessionToken()) });
    expect(ctx.user).toBeNull();
    expect(ctx.authError?.code).toBe('UNAUTHORIZED');
  });
});

describe('createWSContext', () => {
  it('resolves the home session (no header on a WebSocket)', async () => {
    const ctx = await createWSContext(`Bearer ${sessionToken()}`);
    expect(ctx.user?.tenantId).toBe(HOME);
  });

  it('acts in the connection-params tenant with a live membership', async () => {
    mocks.prisma.tenantMembership.findMany.mockResolvedValue([
      membership(CLIENT, { role: 'ADMIN' }),
    ]);
    const ctx = await createWSContext(`Bearer ${sessionToken()}`, CLIENT);
    expect(ctx.user).toMatchObject({ tenantId: CLIENT, homeTenantId: HOME, role: 'ADMIN' });
  });

  it('gives no WebSocket user for a tenant the user is not a member of', async () => {
    mocks.prisma.tenantMembership.findMany.mockResolvedValue([membership(CLIENT)]);
    const ctx = await createWSContext(`Bearer ${sessionToken()}`, OTHER);
    expect(ctx.user).toBeNull();
  });

  it('treats an empty or oversized connection-params tenant as absent', async () => {
    expect((await createWSContext(`Bearer ${sessionToken()}`, '  ')).user?.tenantId).toBe(HOME);
    expect((await createWSContext(`Bearer ${sessionToken()}`, 'x'.repeat(65))).user?.tenantId).toBe(
      HOME
    );
  });

  it('gives a pending staff-link session no WebSocket user', async () => {
    mocks.prisma.tenantMembership.findMany.mockResolvedValue([
      membership(CLIENT, { source: 'PORTAL_STAFF', pinned: true, role: 'ADMIN' }),
    ]);
    const issuedAt = new Date(NOW - 60_000);
    mocks.prisma.partnerLoginGrant.findMany.mockResolvedValue([
      {
        issuedAt,
        expiresAt: new Date(issuedAt.getTime() + 15 * 60_000),
        claimedSessionId: null,
      },
    ]);
    const token = sessionToken('session-A', [{ method: 'otp', timestamp: Math.floor(NOW / 1000) }]);
    const ctx = await createWSContext(`Bearer ${token}`);
    expect(ctx.user).toBeNull();
  });
});
