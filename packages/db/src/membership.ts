// ADR-071: inherited tenant membership predicates.
//
// Pure helpers shared by the API (active-tenant resolution, partner procedures) and the quota
// adapter (seat counting), so "who is a live member" and "who takes a seat" are each defined
// exactly once. No Prisma client is needed here: they build `where` fragments.

export interface MembershipLiveness {
  revokedAt: Date | null;
  expiresAt: Date | null;
}

/** THE live-membership predicate: not revoked, and not past `expiresAt`. */
export function isLiveMembership(m: MembershipLiveness, now: Date = new Date()): boolean {
  if (m.revokedAt) return false;
  return m.expiresAt === null || m.expiresAt.getTime() > now.getTime();
}

/**
 * The same predicate as a Prisma `where` fragment:
 * `revokedAt IS NULL AND (expiresAt IS NULL OR expiresAt > now)`.
 */
export function liveMembershipWhere(now: Date = new Date()) {
  return {
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

/**
 * Prisma `User` where-fragment for the people who take a seat in `tenantId`:
 *
 *  - home users (`users.tenantId`), unless `partner.removeMember` revoked their home membership;
 *  - plus users with a LIVE, NON-pinned membership there that is not the lazily written HOME row.
 *
 * Pinned staff memberships never count. A user matching both branches is one row, so each user
 * is counted once. Use it as `prisma.user.count({ where: seatUserWhere(tenantId) })`.
 */
export function seatUserWhere(tenantId: string, now: Date = new Date()) {
  return {
    OR: [
      {
        tenantId,
        NOT: { memberships: { some: { tenantId, revokedAt: { not: null } } } },
      },
      {
        memberships: {
          some: {
            tenantId,
            pinned: false,
            source: { not: 'HOME' as const },
            ...liveMembershipWhere(now),
          },
        },
      },
    ],
  };
}

/**
 * Prisma `User` where-fragment for everyone who works in `tenantId`: home users (minus a revoked
 * home membership) plus users with a LIVE membership there, INCLUDING pinned staff. Use it for
 * assignee pickers and for "is this user in my tenant" checks, so a visiting member can own and
 * be assigned records. Unlike `seatUserWhere`, pinned staff are included.
 *
 * It is a top-level `OR`; combine it with other filters through `AND: [tenantUserWhere(t), ...]`
 * when the other filter also needs an `OR`.
 */
export function tenantUserWhere(tenantId: string, now: Date = new Date()) {
  return {
    OR: [
      {
        tenantId,
        NOT: { memberships: { some: { tenantId, revokedAt: { not: null } } } },
      },
      {
        memberships: {
          some: { tenantId, ...liveMembershipWhere(now) },
        },
      },
    ],
  };
}
