/**
 * Contact type resolver tests — PG-205 (ADR-080).
 *
 * Lazy per-tenant seeding of the six system types, tenant-scoped key lookup,
 * default-tag resolution and the admin assert. The transaction client is
 * prismaMock itself (`$transaction(fn) => fn(prismaMock)`).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CONTACT_TYPES } from '@intelliflow/domain';
import {
  SYSTEM_CONTACT_TYPE_SEED,
  assertContactTypeAdmin,
  ensureSystemContactTypes,
  loadContactTypeByKey,
  resolveDefaultTagNames,
} from '../contact-type-resolver';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  createManagerContext,
  TEST_UUIDS,
} from '../../../test/setup';
import { getTenantContext } from '../../../security/tenant-context';

const logPermissionDenied = vi.fn();
vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction: vi.fn().mockResolvedValue('a'), logPermissionDenied }),
}));

const tenantId = TEST_UUIDS.tenant;

function prismaError(code: string) {
  return Object.assign(new Error(`prisma ${code}`), { code });
}

function ctxFor(base = createAdminContext()) {
  return getTenantContext(base);
}

describe('SYSTEM_CONTACT_TYPE_SEED', () => {
  it('covers the six seed keys in order with names, colours and sort order', () => {
    expect(SYSTEM_CONTACT_TYPE_SEED.map((s) => s.key)).toEqual([...CONTACT_TYPES]);
    expect(SYSTEM_CONTACT_TYPE_SEED.map((s) => s.name)).toEqual([
      'Customer',
      'Prospect',
      'Partner',
      'Vendor',
      'Investor',
      'Other',
    ]);
    expect(SYSTEM_CONTACT_TYPE_SEED.map((s) => s.sortOrder)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const s of SYSTEM_CONTACT_TYPE_SEED) expect(typeof s.colorToken).toBe('string');
  });
});

describe('ensureSystemContactTypes', () => {
  beforeEach(() => {
    (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(prismaMock));
  });

  it('takes the fast path (no lock, no write) when all six system rows exist', async () => {
    (prismaMock.contactType.count as any).mockResolvedValueOnce(6);
    await ensureSystemContactTypes(ctxFor());
    expect(prismaMock.contactType.count).toHaveBeenCalledWith({
      where: { tenantId, isSystem: true },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    expect(prismaMock.contactType.createMany).not.toHaveBeenCalled();
  });

  it('locks the tenant and creates only the missing system rows, without skipDuplicates', async () => {
    (prismaMock.contactType.count as any).mockResolvedValueOnce(2);
    (prismaMock.contactType.findMany as any).mockResolvedValueOnce([
      { key: 'customer' },
      { key: 'vendor' },
    ]);

    await ensureSystemContactTypes(ctxFor());

    const lockCall = (prismaMock.$executeRaw as any).mock.calls[0];
    expect(lockCall[0].join('?')).toContain('pg_advisory_xact_lock(hashtextextended(');
    expect(lockCall[1]).toBe(`contact_types:${tenantId}`);
    expect(prismaMock.contactType.findMany).toHaveBeenCalledWith({
      where: { tenantId, key: { in: [...CONTACT_TYPES] } },
      select: { key: true },
    });
    const args = (prismaMock.contactType.createMany as any).mock.calls[0][0];
    expect(args).not.toHaveProperty('skipDuplicates');
    expect(args.data.map((d: { key: string }) => d.key)).toEqual([
      'prospect',
      'partner',
      'investor',
      'other',
    ]);
    for (const d of args.data) {
      expect(d).toMatchObject({ tenantId, isSystem: true, isActive: true, isDefault: false });
    }
  });

  it('does nothing inside the lock when a concurrent request already seeded', async () => {
    (prismaMock.contactType.count as any).mockResolvedValueOnce(0);
    (prismaMock.contactType.findMany as any).mockResolvedValueOnce(
      CONTACT_TYPES.map((key) => ({ key }))
    );
    await ensureSystemContactTypes(ctxFor());
    expect(prismaMock.contactType.createMany).not.toHaveBeenCalled();
  });

  it('treats a unique violation from a racing seed as success', async () => {
    (prismaMock.contactType.count as any).mockResolvedValueOnce(0);
    (prismaMock.contactType.findMany as any).mockResolvedValueOnce([]);
    (prismaMock.contactType.createMany as any).mockRejectedValueOnce(prismaError('P2002'));
    await expect(ensureSystemContactTypes(ctxFor())).resolves.toBeUndefined();
  });

  it('propagates any other seed failure so the caller aborts', async () => {
    (prismaMock.contactType.count as any).mockResolvedValueOnce(0);
    (prismaMock.contactType.findMany as any).mockResolvedValueOnce([]);
    (prismaMock.contactType.createMany as any).mockRejectedValueOnce(new Error('db down'));
    await expect(ensureSystemContactTypes(ctxFor())).rejects.toThrow('db down');
  });
});

describe('loadContactTypeByKey', () => {
  it('scopes by tenant and filters inactive types when asked', async () => {
    (prismaMock.contactType.findFirst as any).mockResolvedValueOnce({ id: 't1', key: 'vendor' });
    const found = await loadContactTypeByKey(ctxFor(), 'vendor', { activeOnly: true });
    expect(found).toMatchObject({ id: 't1' });
    expect(prismaMock.contactType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, key: 'vendor', isActive: true } })
    );
  });

  it('can resolve an inactive stored key', async () => {
    (prismaMock.contactType.findFirst as any).mockResolvedValueOnce(null);
    const found = await loadContactTypeByKey(ctxFor(), 'vendor', { activeOnly: false });
    expect(found).toBeNull();
    expect(prismaMock.contactType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, key: 'vendor' } })
    );
  });
});

describe('resolveDefaultTagNames', () => {
  it('returns the current names of active same-tenant default tags', async () => {
    (prismaMock.contactTypeDefaultTag.findMany as any).mockResolvedValueOnce([
      { contactTag: { name: 'supplier' } },
      { contactTag: { name: 'emea' } },
    ]);
    const names = await resolveDefaultTagNames(ctxFor(), 'type-1');
    expect(names).toEqual(['supplier', 'emea']);
    expect(prismaMock.contactTypeDefaultTag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId, contactTypeId: 'type-1', contactTag: { tenantId, isActive: true } },
      })
    );
  });
});

describe('assertContactTypeAdmin', () => {
  beforeEach(() => logPermissionDenied.mockReset().mockResolvedValue('d'));

  it('allows admins and managers', () => {
    expect(() =>
      assertContactTypeAdmin(getTenantContext(createAdminContext()), 'create')
    ).not.toThrow();
    expect(() =>
      assertContactTypeAdmin(getTenantContext(createManagerContext()), 'create')
    ).not.toThrow();
    expect(logPermissionDenied).not.toHaveBeenCalled();
  });

  it('rejects other roles with FORBIDDEN and audits the denial', () => {
    expect(() =>
      assertContactTypeAdmin(getTenantContext(createTestContext()), 'delete', 'type-9')
    ).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(logPermissionDenied).toHaveBeenCalledWith(
      'contact_type',
      'type-9',
      expect.stringContaining('delete'),
      tenantId,
      expect.objectContaining({ actorId: TEST_UUIDS.user1 })
    );
  });

  it('fails closed when the role is missing', () => {
    const ctx = createTestContext();
    (ctx.user as { role?: string }).role = undefined;
    expect(() => assertContactTypeAdmin(getTenantContext(ctx), 'update')).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' })
    );
  });
});
