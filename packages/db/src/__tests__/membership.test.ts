import { describe, expect, it } from 'vitest';
import {
  isLiveMembership,
  liveMembershipWhere,
  seatUserWhere,
  tenantUserWhere,
} from '../membership';

const NOW = new Date('2026-10-01T12:00:00.000Z');

describe('isLiveMembership', () => {
  it('requires no revocation and no passed expiry', () => {
    expect(isLiveMembership({ revokedAt: null, expiresAt: null }, NOW)).toBe(true);
    expect(isLiveMembership({ revokedAt: null, expiresAt: new Date(NOW.getTime() + 1) }, NOW)).toBe(
      true
    );
    expect(isLiveMembership({ revokedAt: NOW, expiresAt: null }, NOW)).toBe(false);
    expect(isLiveMembership({ revokedAt: null, expiresAt: NOW }, NOW)).toBe(false);
  });
});

describe('seatUserWhere', () => {
  const where = seatUserWhere('t1', NOW);

  it('counts home users except those whose home membership was revoked', () => {
    expect(where.OR[0]).toEqual({
      tenantId: 't1',
      NOT: { memberships: { some: { tenantId: 't1', revokedAt: { not: null } } } },
    });
  });

  it('counts only live, non-pinned, non-HOME memberships: pinned staff take no seat', () => {
    expect(where.OR[1]).toEqual({
      memberships: {
        some: {
          tenantId: 't1',
          pinned: false,
          source: { not: 'HOME' },
          ...liveMembershipWhere(NOW),
        },
      },
    });
  });
});

describe('tenantUserWhere', () => {
  const where = tenantUserWhere('t1', NOW);

  it('includes every live membership, pinned staff included', () => {
    const branch = where.OR[1] as { memberships: { some: Record<string, unknown> } };
    expect(branch.memberships.some).toEqual({ tenantId: 't1', ...liveMembershipWhere(NOW) });
    expect(branch.memberships.some).not.toHaveProperty('pinned');
  });

  it('keeps home users except those whose home membership was revoked', () => {
    expect(where.OR[0]).toEqual({
      tenantId: 't1',
      NOT: { memberships: { some: { tenantId: 't1', revokedAt: { not: null } } } },
    });
  });
});
