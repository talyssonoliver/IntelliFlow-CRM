/**
 * PG-197 — territory-based owner assignment helper (BR-8..BR-15).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  assertExplicitOwner,
  isAccountOwnerAdmin,
  resolveAccountOwner,
  toTerritoryStrategy,
} from '../account-territory-assignment';
import type { TenantAwareContext } from '../../../security/tenant-context';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  generateTestUUID,
  TEST_UUIDS,
} from '../../../test/setup';

const tenantId = TEST_UUIDS.tenant;
const creatorId = TEST_UUIDS.user1;
const A = generateTestUUID('assignee-a');
const B = generateTestUUID('assignee-b');
const REVOKED = generateTestUUID('assignee-revoked');

function territory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'terr-gb',
    priority: 1,
    isActive: true,
    isDefault: false,
    strategy: 'ROUND_ROBIN',
    createdAt: new Date('2026-01-01'),
    rules: [{ country: 'GB', region: null, postalPrefix: null }],
    members: [
      { userId: REVOKED, sortOrder: 0 },
      { userId: A, sortOrder: 1 },
      { userId: B, sortOrder: 2 },
    ],
    ...overrides,
  };
}

const gb = { country: 'GB' };

describe('account territory assignment', () => {
  let typedCtx: TenantAwareContext;

  beforeEach(() => {
    typedCtx = createTestContext() as TenantAwareContext;
    (prismaMock.user.findMany as any).mockResolvedValue([{ id: A }, { id: B }]);
  });

  it('narrows strategies and recognises admin roles', () => {
    expect(toTerritoryStrategy('LOAD_BALANCE')).toBe('LOAD_BALANCE');
    expect(toTerritoryStrategy('nope')).toBe('MANUAL');
    expect(isAccountOwnerAdmin('MANAGER')).toBe(true);
    expect(isAccountOwnerAdmin('USER')).toBe(false);
    expect(isAccountOwnerAdmin(undefined)).toBe(false);
  });

  describe('resolveAccountOwner', () => {
    it('loads active territories with an explicit tenantId and filters members by tenantUserWhere', async () => {
      (prismaMock.accountTerritory.findMany as any).mockResolvedValueOnce([territory()]);
      (prismaMock.accountTerritory.update as any).mockResolvedValueOnce({ rrCursor: 1 });

      await resolveAccountOwner(typedCtx, { geo: gb, creatorId });

      expect(prismaMock.accountTerritory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId, isActive: true } })
      );
      const userQuery = (prismaMock.user.findMany as any).mock.calls[0][0];
      expect(userQuery.where.id).toEqual({ in: [REVOKED, A, B] });
      expect(userQuery.where.OR).toBeDefined();
    });

    it('round-robin advances the cursor once and skips the revoked member', async () => {
      (prismaMock.accountTerritory.findMany as any).mockResolvedValueOnce([territory()]);
      (prismaMock.accountTerritory.update as any).mockResolvedValueOnce({ rrCursor: 2 });

      const result = await resolveAccountOwner(typedCtx, { geo: gb, creatorId });

      expect(prismaMock.accountTerritory.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.accountTerritory.update).toHaveBeenCalledWith({
        where: { tenantId_id: { tenantId, id: 'terr-gb' } },
        data: { rrCursor: { increment: 1 } },
        select: { rrCursor: true },
      });
      expect(result).toEqual({
        ownerId: B,
        ownerSource: 'territory',
        territoryId: 'terr-gb',
        strategy: 'ROUND_ROBIN',
      });
    });

    it('does not touch the cursor with zero eligible members', async () => {
      (prismaMock.accountTerritory.findMany as any).mockResolvedValueOnce([territory()]);
      (prismaMock.user.findMany as any).mockResolvedValueOnce([]);

      const result = await resolveAccountOwner(typedCtx, { geo: gb, creatorId });

      expect(prismaMock.accountTerritory.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        ownerId: creatorId,
        ownerSource: 'creator',
        territoryId: 'terr-gb',
        reason: 'no_eligible_members',
      });
    });

    it('load-balance picks the least loaded member via a tenant-scoped groupBy', async () => {
      (prismaMock.accountTerritory.findMany as any).mockResolvedValueOnce([
        territory({ strategy: 'LOAD_BALANCE' }),
      ]);
      (prismaMock.account.groupBy as any).mockResolvedValueOnce([
        { ownerId: A, _count: { _all: 5 } },
        { ownerId: B, _count: { _all: 2 } },
      ]);

      const result = await resolveAccountOwner(typedCtx, { geo: gb, creatorId });

      expect(prismaMock.account.groupBy).toHaveBeenCalledWith({
        by: ['ownerId'],
        where: { tenantId, ownerId: { in: [A, B] } },
        _count: { _all: true },
      });
      expect(result).toMatchObject({
        ownerId: B,
        ownerSource: 'territory',
        strategy: 'LOAD_BALANCE',
      });
    });

    it('falls back to the default territory when the winner has no eligible members', async () => {
      (prismaMock.accountTerritory.findMany as any).mockResolvedValueOnce([
        territory({ members: [{ userId: REVOKED, sortOrder: 0 }] }),
        territory({
          id: 'terr-default',
          isDefault: true,
          strategy: 'LOAD_BALANCE',
          rules: [],
          members: [{ userId: A, sortOrder: 0 }],
        }),
      ]);
      (prismaMock.account.groupBy as any).mockResolvedValueOnce([]);

      const result = await resolveAccountOwner(typedCtx, { geo: gb, creatorId });

      expect(result).toEqual({
        ownerId: A,
        ownerSource: 'territory',
        territoryId: 'terr-default',
        strategy: 'LOAD_BALANCE',
        reason: 'no_eligible_members',
        fallbackFromTerritoryId: 'terr-gb',
      });
      expect(prismaMock.accountTerritory.update).not.toHaveBeenCalled();
    });

    it('MANUAL leaves the creator as owner and records the territory', async () => {
      (prismaMock.accountTerritory.findMany as any).mockResolvedValueOnce([
        territory({ strategy: 'MANUAL', members: [] }),
      ]);

      const result = await resolveAccountOwner(typedCtx, { geo: gb, creatorId });

      expect(result).toEqual({
        ownerId: creatorId,
        ownerSource: 'creator',
        reason: 'manual',
        territoryId: 'terr-gb',
        strategy: 'MANUAL',
      });
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });

    it('returns the creator without user lookups when nothing matches', async () => {
      (prismaMock.accountTerritory.findMany as any).mockResolvedValueOnce([territory()]);

      const result = await resolveAccountOwner(typedCtx, { geo: { country: 'US' }, creatorId });

      expect(result).toEqual({ ownerId: creatorId, ownerSource: 'creator', reason: 'no_match' });
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });

    it('falls back to the creator with a warning when resolution throws (BR-15)', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (prismaMock.accountTerritory.findMany as any).mockResolvedValueOnce([territory()]);
      (prismaMock.accountTerritory.update as any).mockRejectedValueOnce({ code: 'P2025' });

      const result = await resolveAccountOwner(typedCtx, { geo: gb, creatorId });

      expect(result).toEqual({
        ownerId: creatorId,
        ownerSource: 'creator',
        reason: 'resolution_failed',
      });
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('assertExplicitOwner', () => {
    it('is FORBIDDEN for a non-admin choosing someone else, before any lookup', async () => {
      await expect(assertExplicitOwner(typedCtx, A)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    });

    it('lets a non-admin name themselves', async () => {
      (prismaMock.user.findFirst as any).mockResolvedValueOnce({ id: creatorId });
      await expect(assertExplicitOwner(typedCtx, creatorId)).resolves.toBeUndefined();
    });

    it('is BAD_REQUEST when the owner is not a tenant user', async () => {
      const adminCtx = createAdminContext() as TenantAwareContext;
      (prismaMock.user.findFirst as any).mockResolvedValueOnce(null);
      await expect(assertExplicitOwner(adminCtx, A)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      const query = (prismaMock.user.findFirst as any).mock.calls[0][0];
      expect(query.where.id).toBe(A);
      expect(query.where.OR).toBeDefined();
    });

    it('accepts a tenant user chosen by an admin', async () => {
      const adminCtx = createAdminContext() as TenantAwareContext;
      (prismaMock.user.findFirst as any).mockResolvedValueOnce({ id: A });
      await expect(assertExplicitOwner(adminCtx, A)).resolves.toBeUndefined();
    });
  });
});
