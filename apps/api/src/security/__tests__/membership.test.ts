/**
 * Active-tenant resolution (ADR-071): home default, header switching, pinned staff sessions,
 * PIN_PENDING, role mapping and the live-membership predicate.
 */

import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  GRANT_CLOCK_LEEWAY_MS,
  decodeSessionClaims,
  getHomeTenantId,
  isActingOutsideHome,
  isInheritedMembershipEnabled,
  isLiveMembership,
  liveMembershipWhere,
  membershipError,
  reasonFromCause,
  resolveActiveTenant,
  toStoredRole,
  toWireRole,
  type SessionClaims,
} from '../membership';

const NOW = new Date('2026-10-01T12:00:00.000Z');
const HOME = 'tenant-home';
const CLIENT = 'tenant-client';
const OTHER = 'tenant-other';
const USER = 'user-1';
const SESSION = 'session-A';

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

interface Row {
  tenantId: string;
  role: 'ADMIN' | 'USER';
  source: string;
  pinned: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

const member = (tenantId: string, over: Partial<Row> = {}): Row => ({
  tenantId,
  role: 'USER',
  source: 'PORTAL_MEMBER',
  pinned: false,
  expiresAt: null,
  revokedAt: null,
  ...over,
});

const staff = (tenantId: string, over: Partial<Row> = {}): Row =>
  member(tenantId, {
    role: 'ADMIN',
    source: 'PORTAL_STAFF',
    pinned: true,
    expiresAt: new Date(NOW.getTime() + 24 * HOUR),
    ...over,
  });

interface Grant {
  id: string;
  tenantId: string;
  sessionExpiresAt: Date | null;
  issuedAt: Date;
  expiresAt: Date;
  claimedSessionId: string | null;
}

function makeDb(rows: Row[], grants: Grant[] = []) {
  const db = {
    tenantMembership: { findMany: vi.fn().mockResolvedValue(rows) },
    partnerLoginGrant: {
      findFirst: vi.fn(async ({ where }: { where: { claimedSessionId: string } }) => {
        const g = grants.find((x) => x.claimedSessionId === where.claimedSessionId);
        return g ? { id: g.id, tenantId: g.tenantId, sessionExpiresAt: g.sessionExpiresAt } : null;
      }),
      findMany: vi.fn(async () =>
        grants.map((g) => ({
          issuedAt: g.issuedAt,
          expiresAt: g.expiresAt,
          claimedSessionId: g.claimedSessionId,
        }))
      ),
    },
  };
  return db;
}

const noClaims: SessionClaims = { sessionId: null, amr: [] };
const claimsWithSession: SessionClaims = { sessionId: SESSION, amr: [] };

function input(over: Record<string, unknown> = {}) {
  return {
    userId: USER,
    homeTenantId: HOME,
    homeRole: 'SALES_REP',
    claims: claimsWithSession,
    requestedTenantId: null,
    now: NOW,
    inheritedEnabled: true,
    ...over,
  } as Parameters<typeof resolveActiveTenant>[1];
}

const resolve = (db: ReturnType<typeof makeDb>, over: Record<string, unknown> = {}) =>
  resolveActiveTenant(db as never, input(over));

async function rejection(promise: Promise<unknown>): Promise<TRPCError> {
  try {
    await promise;
  } catch (error) {
    return error as TRPCError;
  }
  throw new Error('expected a rejection');
}

describe('isLiveMembership / liveMembershipWhere', () => {
  it('is live when not revoked and not expired', () => {
    expect(isLiveMembership({ revokedAt: null, expiresAt: null }, NOW)).toBe(true);
    expect(isLiveMembership({ revokedAt: null, expiresAt: new Date(NOW.getTime() + 1) }, NOW)).toBe(
      true
    );
  });

  it('is not live when revoked, or at/after expiresAt', () => {
    expect(isLiveMembership({ revokedAt: NOW, expiresAt: null }, NOW)).toBe(false);
    expect(isLiveMembership({ revokedAt: null, expiresAt: NOW }, NOW)).toBe(false);
    expect(isLiveMembership({ revokedAt: null, expiresAt: new Date(NOW.getTime() - 1) }, NOW)).toBe(
      false
    );
  });

  it('builds the same predicate as a where fragment', () => {
    expect(liveMembershipWhere(NOW)).toEqual({
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }],
    });
  });
});

describe('role mapping', () => {
  it('maps stored to wire and back; only ADMIN and USER are ever stored', () => {
    expect(toWireRole('ADMIN')).toBe('ADMIN');
    expect(toWireRole('USER')).toBe('MEMBER');
    expect(toWireRole('SALES_REP')).toBe('MEMBER');
    expect(toStoredRole('ADMIN')).toBe('ADMIN');
    expect(toStoredRole('MEMBER')).toBe('USER');
  });
});

describe('flag', () => {
  it('is on only for 1 or true', () => {
    expect(isInheritedMembershipEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isInheritedMembershipEnabled({ INHERITED_MEMBERSHIP_ENABLED: '0' } as never)).toBe(
      false
    );
    expect(isInheritedMembershipEnabled({ INHERITED_MEMBERSHIP_ENABLED: '1' } as never)).toBe(true);
    expect(isInheritedMembershipEnabled({ INHERITED_MEMBERSHIP_ENABLED: 'TRUE' } as never)).toBe(
      true
    );
  });
});

describe('error shape', () => {
  it('carries the reason as message prefix and cause, readable by the formatter', () => {
    const error = membershipError('FORBIDDEN', 'NOT_A_MEMBER', 'nope');
    expect(error).toBeInstanceOf(TRPCError);
    expect(error.code).toBe('FORBIDDEN');
    expect(error.message).toBe('NOT_A_MEMBER: nope');
    expect(reasonFromCause(error.cause)).toBe('NOT_A_MEMBER');
  });

  it('ignores a cause without a known reason', () => {
    expect(reasonFromCause(new Error('x'))).toBeNull();
    expect(reasonFromCause({ reason: 'MADE_UP' })).toBeNull();
    expect(reasonFromCause(undefined)).toBeNull();
  });
});

describe('decodeSessionClaims', () => {
  const token = (payload: unknown) =>
    `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;

  it('reads session_id and well-formed amr entries', () => {
    expect(
      decodeSessionClaims(
        token({
          session_id: 's1',
          amr: [{ method: 'otp', timestamp: 100 }, { method: 'bad' }, 'password'],
        })
      )
    ).toEqual({ sessionId: 's1', amr: [{ method: 'otp', timestamp: 100 }] });
  });

  it('fails closed on garbage', () => {
    expect(decodeSessionClaims('not-a-jwt')).toEqual({ sessionId: null, amr: [] });
    expect(decodeSessionClaims('a.%%%.c')).toEqual({ sessionId: null, amr: [] });
    expect(decodeSessionClaims(token({ session_id: 7, amr: 'x' }))).toEqual({
      sessionId: null,
      amr: [],
    });
  });
});

describe('session helpers', () => {
  it('treats a session without homeTenantId as being at home', () => {
    expect(getHomeTenantId({ tenantId: 't1' })).toBe('t1');
    expect(isActingOutsideHome({ tenantId: 't1' })).toBe(false);
    expect(isActingOutsideHome({ tenantId: 't2', homeTenantId: 't1' })).toBe(true);
    expect(isActingOutsideHome(null)).toBe(false);
  });
});

describe('resolveActiveTenant: home and header', () => {
  it('defaults to the home tenant and reads memberships once, grants never', async () => {
    const db = makeDb([]);
    const r = await resolve(db);
    expect(r).toMatchObject({
      activeTenantId: HOME,
      homeTenantId: HOME,
      role: 'SALES_REP',
      pinned: false,
      pinPending: false,
      actingOutsideHome: false,
      membershipRole: null,
    });
    expect(db.tenantMembership.findMany).toHaveBeenCalledTimes(1);
    expect(db.partnerLoginGrant.findFirst).not.toHaveBeenCalled();
    expect(db.partnerLoginGrant.findMany).not.toHaveBeenCalled();
  });

  it('treats a header equal to the home tenant as home', async () => {
    const r = await resolve(makeDb([]), { requestedTenantId: HOME });
    expect(r.activeTenantId).toBe(HOME);
    expect(r.actingOutsideHome).toBe(false);
  });

  it('honours the header with a live membership and uses the MEMBERSHIP role there', async () => {
    const r = await resolve(makeDb([member(CLIENT, { role: 'ADMIN' })]), {
      requestedTenantId: CLIENT,
    });
    expect(r).toMatchObject({
      activeTenantId: CLIENT,
      homeTenantId: HOME,
      role: 'ADMIN',
      membershipRole: 'ADMIN',
      actingOutsideHome: true,
      pinned: false,
    });
  });

  it('refuses a header naming a tenant without a membership', async () => {
    const error = await rejection(resolve(makeDb([member(CLIENT)]), { requestedTenantId: OTHER }));
    expect(error.code).toBe('FORBIDDEN');
    expect(reasonFromCause(error.cause)).toBe('NOT_A_MEMBER');
  });

  it('refuses a revoked membership', async () => {
    const db = makeDb([member(CLIENT, { revokedAt: new Date(NOW.getTime() - MIN) })]);
    const error = await rejection(resolve(db, { requestedTenantId: CLIENT }));
    expect(reasonFromCause(error.cause)).toBe('NOT_A_MEMBER');
  });

  it('refuses an expired membership', async () => {
    const db = makeDb([member(CLIENT, { expiresAt: new Date(NOW.getTime() - 1) })]);
    const error = await rejection(resolve(db, { requestedTenantId: CLIENT }));
    expect(reasonFromCause(error.cause)).toBe('NOT_A_MEMBER');
  });

  it('refuses a PINNED membership through the header (staff reach it only via the Portal)', async () => {
    const error = await rejection(
      resolve(makeDb([staff(CLIENT)]), { requestedTenantId: CLIENT, claims: noClaims })
    );
    expect(reasonFromCause(error.cause)).toBe('NOT_A_MEMBER');
  });

  it('refuses every non-home header while the flag is off', async () => {
    const error = await rejection(
      resolve(makeDb([member(CLIENT)]), { requestedTenantId: CLIENT, inheritedEnabled: false })
    );
    expect(reasonFromCause(error.cause)).toBe('NOT_A_MEMBER');
  });

  it('still resolves the home tenant when the flag is off', async () => {
    const r = await resolve(makeDb([member(CLIENT)]), { inheritedEnabled: false });
    expect(r.activeTenantId).toBe(HOME);
  });

  it('refuses the home tenant after partner.removeMember revoked the HOME membership', async () => {
    const db = makeDb([member(HOME, { source: 'HOME', revokedAt: new Date(NOW.getTime() - MIN) })]);
    const error = await rejection(resolve(db));
    expect(error.code).toBe('FORBIDDEN');
    expect(reasonFromCause(error.cause)).toBe('NOT_A_MEMBER');
  });

  it('lets a live HOME row through', async () => {
    const r = await resolve(makeDb([member(HOME, { source: 'HOME' })]));
    expect(r.activeTenantId).toBe(HOME);
  });

  it('still allows other tenants when only the HOME membership was revoked and a header is sent', async () => {
    const db = makeDb([
      member(HOME, { source: 'HOME', revokedAt: new Date(NOW.getTime() - MIN) }),
      member(CLIENT),
    ]);
    const r = await resolve(db, { requestedTenantId: CLIENT });
    expect(r.activeTenantId).toBe(CLIENT);
  });
});

describe('resolveActiveTenant: pinned sessions', () => {
  const claimedGrant = (over: Partial<Grant> = {}): Grant => ({
    id: 'grant-1',
    tenantId: CLIENT,
    sessionExpiresAt: new Date(NOW.getTime() + 11 * HOUR),
    issuedAt: new Date(NOW.getTime() - HOUR),
    expiresAt: new Date(NOW.getTime() - HOUR + 15 * MIN),
    claimedSessionId: SESSION,
    ...over,
  });

  it('acts in the grant tenant with the membership role and is pinned', async () => {
    const r = await resolve(makeDb([staff(CLIENT)], [claimedGrant()]));
    expect(r).toMatchObject({
      activeTenantId: CLIENT,
      homeTenantId: HOME,
      role: 'ADMIN',
      pinned: true,
      pinPending: false,
      grantId: 'grant-1',
      actingOutsideHome: true,
    });
  });

  it('ignores the x-active-tenant header (a pinned session cannot switch)', async () => {
    const r = await resolve(makeDb([staff(CLIENT), member(OTHER)], [claimedGrant()]), {
      requestedTenantId: OTHER,
    });
    expect(r.activeTenantId).toBe(CLIENT);
    expect(r.pinned).toBe(true);
  });

  it('ignores a header naming the staff member own home tenant', async () => {
    const r = await resolve(makeDb([staff(CLIENT)], [claimedGrant()]), { requestedTenantId: HOME });
    expect(r.activeTenantId).toBe(CLIENT);
  });

  it('is UNAUTHORIZED after the 12 hour session window', async () => {
    const db = makeDb(
      [staff(CLIENT)],
      [claimedGrant({ sessionExpiresAt: new Date(NOW.getTime() - 1) })]
    );
    const error = await rejection(resolve(db));
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('is UNAUTHORIZED when the pinned membership was revoked', async () => {
    const db = makeDb(
      [staff(CLIENT, { revokedAt: new Date(NOW.getTime() - MIN) })],
      [claimedGrant()]
    );
    expect((await rejection(resolve(db))).code).toBe('UNAUTHORIZED');
  });

  it('is UNAUTHORIZED when the pinned membership expired (24 hour staff TTL)', async () => {
    const db = makeDb(
      [staff(CLIENT, { expiresAt: new Date(NOW.getTime() - 1) })],
      [claimedGrant()]
    );
    expect((await rejection(resolve(db))).code).toBe('UNAUTHORIZED');
  });

  it('does not read grants for a user without a pinned membership', async () => {
    const db = makeDb([member(CLIENT)]);
    await resolve(db);
    expect(db.partnerLoginGrant.findFirst).not.toHaveBeenCalled();
  });
});

describe('resolveActiveTenant: PIN_PENDING', () => {
  const otpAt = (date: Date) => ({ method: 'otp', timestamp: Math.floor(date.getTime() / 1000) });
  const grantIssuedAt = new Date(NOW.getTime() - 2 * MIN);
  const unclaimed = (over: Partial<Grant> = {}): Grant => ({
    id: 'grant-1',
    tenantId: CLIENT,
    sessionExpiresAt: null,
    issuedAt: grantIssuedAt,
    expiresAt: new Date(grantIssuedAt.getTime() + 15 * MIN),
    claimedSessionId: null,
    ...over,
  });

  it('blocks an OTP session inside an unclaimed pinned grant window', async () => {
    const r = await resolve(makeDb([staff(CLIENT)], [unclaimed()]), {
      claims: { sessionId: SESSION, amr: [otpAt(NOW)] },
    });
    expect(r.pinPending).toBe(true);
    expect(r.pinned).toBe(false);
    // It must not silently become a home-tenant session for the caller to use.
    expect(r.activeTenantId).toBe(HOME);
  });

  it('also treats the older magiclink method as a link session', async () => {
    const r = await resolve(makeDb([staff(CLIENT)], [unclaimed()]), {
      claims: {
        sessionId: SESSION,
        amr: [{ method: 'magiclink', timestamp: NOW.getTime() / 1000 }],
      },
    });
    expect(r.pinPending).toBe(true);
  });

  it('stays blocked after the claim window closed (evaluated by data, not by the clock)', async () => {
    const lateNow = new Date(grantIssuedAt.getTime() + 3 * HOUR);
    const r = await resolve(makeDb([staff(CLIENT)], [unclaimed()]), {
      now: lateNow,
      claims: { sessionId: SESSION, amr: [otpAt(NOW)] },
    });
    expect(r.pinPending).toBe(true);
  });

  it('blocks a session that was claimed by a DIFFERENT browser session', async () => {
    const r = await resolve(
      makeDb([staff(CLIENT)], [unclaimed({ claimedSessionId: 'session-B' })]),
      {
        claims: { sessionId: SESSION, amr: [otpAt(NOW)] },
      }
    );
    expect(r.pinPending).toBe(true);
  });

  it('blocks a link session that has no session id at all (fail closed)', async () => {
    const r = await resolve(makeDb([staff(CLIENT)], [unclaimed()]), {
      claims: { sessionId: null, amr: [otpAt(NOW)] },
    });
    expect(r.pinPending).toBe(true);
  });

  it('does not block an OTP session that predates the grant window', async () => {
    const before = new Date(grantIssuedAt.getTime() - GRANT_CLOCK_LEEWAY_MS - 60_000);
    const r = await resolve(makeDb([staff(CLIENT)], [unclaimed()]), {
      claims: { sessionId: SESSION, amr: [otpAt(before)] },
    });
    expect(r.pinPending).toBe(false);
    expect(r.activeTenantId).toBe(HOME);
  });

  it('tolerates the documented clock skew before issuedAt', async () => {
    const skewed = new Date(grantIssuedAt.getTime() - GRANT_CLOCK_LEEWAY_MS + 1000);
    const r = await resolve(makeDb([staff(CLIENT)], [unclaimed()]), {
      claims: { sessionId: SESSION, amr: [otpAt(skewed)] },
    });
    expect(r.pinPending).toBe(true);
  });

  it('does not block a password session', async () => {
    const r = await resolve(makeDb([staff(CLIENT)], [unclaimed()]), {
      claims: {
        sessionId: SESSION,
        amr: [{ method: 'password', timestamp: NOW.getTime() / 1000 }],
      },
    });
    expect(r.pinPending).toBe(false);
  });

  it('does not block when the user has no pinned membership', async () => {
    const db = makeDb([member(CLIENT)], [unclaimed()]);
    const r = await resolve(db, { claims: { sessionId: SESSION, amr: [otpAt(NOW)] } });
    expect(r.pinPending).toBe(false);
    expect(db.partnerLoginGrant.findMany).not.toHaveBeenCalled();
  });
});
