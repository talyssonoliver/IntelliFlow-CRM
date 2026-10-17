/**
 * Contact Types Router Tests — PG-205 (ADR-080).
 *
 * The transaction client is prismaMock itself (`$transaction(fn) => fn(prismaMock)`,
 * playbook §12). Cross-tenant ids resolve to NOT_FOUND because every lookup is
 * scoped by the caller's tenantId. The system types are seeded already
 * (`contactType.count` → 6) unless a test says otherwise.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { contactTypesRouter } from '../contact-types.router';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  createManagerContext,
  createPublicContext,
  generateTestUUID,
  TEST_UUIDS,
} from '../../../test/setup';

const logAction = vi.fn();
const logPermissionDenied = vi.fn();
vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction, logPermissionDenied }),
}));

const tenantId = TEST_UUIDS.tenant;
const T1 = generateTestUUID('contact-type-1');
const T2 = generateTestUUID('contact-type-2');
const FOREIGN = generateTestUUID('contact-type-foreign');
const TAG_A = generateTestUUID('contact-tag-a');
const TAG_B = generateTestUUID('contact-tag-b');
const created = new Date('2026-01-01T00:00:00Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: T1,
    tenantId,
    key: 'reseller',
    name: 'Reseller',
    colorToken: 'teal',
    isSystem: false,
    isActive: true,
    isDefault: false,
    sortOrder: 6,
    defaultStatus: 'PROSPECT',
    defaultDepartment: 'Channel',
    defaultOwner: 'ACCOUNT_OWNER',
    requiredFields: ['company'],
    createdAt: created,
    updatedAt: created,
    defaultTags: [{ contactTag: { id: TAG_A, name: 'supplier' } }],
    ...overrides,
  };
}

const input = {
  name: 'Reseller',
  colorToken: 'teal' as const,
  isActive: true,
  defaultStatus: 'PROSPECT' as const,
  defaultDepartment: 'Channel',
  defaultOwner: 'ACCOUNT_OWNER' as const,
  requiredFields: ['company' as const],
  defaultTagIds: [TAG_A],
};

function prismaError(code: string) {
  return Object.assign(new Error(`prisma ${code}`), { code });
}

async function expectCode(promise: Promise<unknown>, code: TRPCError['code']) {
  await expect(promise).rejects.toMatchObject({ code });
}

function seeded() {
  (prismaMock.contactType.count as any).mockResolvedValueOnce(6);
}

describe('contactTypesRouter (PG-205)', () => {
  let admin: ReturnType<typeof contactTypesRouter.createCaller>;
  let manager: ReturnType<typeof contactTypesRouter.createCaller>;
  let user: ReturnType<typeof contactTypesRouter.createCaller>;

  beforeEach(() => {
    logAction.mockReset().mockResolvedValue('audit-1');
    logPermissionDenied.mockReset().mockResolvedValue('audit-2');
    (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(prismaMock));
    admin = contactTypesRouter.createCaller(createAdminContext());
    manager = contactTypesRouter.createCaller(createManagerContext());
    user = contactTypesRouter.createCaller(createTestContext());
  });

  it('rejects an unauthenticated caller', async () => {
    const anon = contactTypesRouter.createCaller(createPublicContext());
    await expect(anon.list()).rejects.toBeInstanceOf(TRPCError);
  });

  describe('write access (SEC-1)', () => {
    it.each([
      ['create', () => user.create(input)],
      ['update', () => user.update({ ...input, id: T1 })],
      ['delete', () => user.delete({ id: T1 })],
      ['setDefault', () => user.setDefault({ id: T1 })],
    ])('%s is FORBIDDEN for a USER and writes nothing', async (_name, call) => {
      await expectCode(call(), 'FORBIDDEN');
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.contactType.create).not.toHaveBeenCalled();
      expect(prismaMock.contactType.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.contactType.deleteMany).not.toHaveBeenCalled();
      expect(logPermissionDenied).toHaveBeenCalled();
    });

    it('lets a MANAGER write (not ADMIN-only)', async () => {
      seeded();
      (prismaMock.contactType.findFirst as any).mockResolvedValueOnce(row());
      (prismaMock.contactType.updateMany as any).mockResolvedValue({ count: 1 });
      await expect(manager.setDefault({ id: T1 })).resolves.toEqual({ success: true });
      expect(prismaMock.contactType.updateMany).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns tenant types in sort order with default tags, contact counts, limits and canEdit', async () => {
      seeded();
      (prismaMock.contactType.findMany as any).mockResolvedValueOnce([
        row({
          id: T2,
          key: 'customer',
          name: 'Customer',
          isSystem: true,
          sortOrder: 0,
          defaultTags: [],
        }),
        row({ requiredFields: ['company', 'bogus'] }),
      ]);
      (prismaMock.contact.groupBy as any).mockResolvedValueOnce([
        { contactType: 'customer', _count: { _all: 4 } },
        { contactType: null, _count: { _all: 9 } },
      ]);

      const result = await user.list();

      expect(prismaMock.contactType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        })
      );
      expect(prismaMock.contact.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['contactType'],
          where: { tenantId, contactType: { in: ['customer', 'reseller'] } },
        })
      );
      expect(result.canEdit).toBe(false);
      expect(result.limits.maxTypesPerTenant).toBe(50);
      expect(result.types[0]).toMatchObject({ key: 'customer', isSystem: true, contactCount: 4 });
      expect(result.types[1]).toMatchObject({
        id: T1,
        key: 'reseller',
        contactCount: 0,
        requiredFields: ['company'],
        defaultTags: [{ id: TAG_A, name: 'supplier' }],
        defaultOwner: 'ACCOUNT_OWNER',
      });
    });

    it('seeds the system types on first use and reports canEdit for admins', async () => {
      (prismaMock.contactType.count as any).mockResolvedValueOnce(0);
      (prismaMock.contactType.findMany as any)
        .mockResolvedValueOnce([]) // seed: existing system keys
        .mockResolvedValueOnce([]); // list
      const result = await admin.list();
      expect(prismaMock.contactType.createMany).toHaveBeenCalled();
      expect(prismaMock.contact.groupBy).not.toHaveBeenCalled();
      expect(result).toMatchObject({ types: [], canEdit: true });
    });
  });

  describe('listActive', () => {
    it('returns active tenant types in picker shape', async () => {
      seeded();
      (prismaMock.contactType.findMany as any).mockResolvedValueOnce([row()]);
      const result = await user.listActive();
      expect(prismaMock.contactType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId, isActive: true } })
      );
      expect(result).toEqual([
        {
          id: T1,
          key: 'reseller',
          name: 'Reseller',
          colorToken: 'teal',
          isActive: true,
          isDefault: false,
          isSystem: false,
          requiredFields: ['company'],
        },
      ]);
    });

    it('includes inactive types when asked (badges and stored-key labels)', async () => {
      seeded();
      (prismaMock.contactType.findMany as any).mockResolvedValueOnce([row({ isActive: false })]);
      const result = await user.listActive({ includeInactive: true });
      expect(prismaMock.contactType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } })
      );
      expect(result[0].isActive).toBe(false);
    });
  });

  describe('create', () => {
    it('enforces the 50-type cap inside the tenant lock', async () => {
      seeded();
      (prismaMock.contactType.count as any).mockResolvedValueOnce(50);
      await expectCode(admin.create(input), 'BAD_REQUEST');
      expect((prismaMock.$executeRaw as any).mock.calls[0][0].join('?')).toContain(
        'pg_advisory_xact_lock'
      );
      expect(prismaMock.contactType.create).not.toHaveBeenCalled();
    });

    it('creates the type with a server-generated key and its default tags in one transaction', async () => {
      seeded();
      (prismaMock.contactType.count as any).mockResolvedValueOnce(7);
      (prismaMock.contactType.findMany as any).mockResolvedValueOnce([{ key: 'reseller' }]);
      (prismaMock.contactTag.count as any).mockResolvedValueOnce(1);
      (prismaMock.contactType.aggregate as any).mockResolvedValueOnce({ _max: { sortOrder: 6 } });
      (prismaMock.contactType.create as any).mockResolvedValueOnce({ id: T1 });
      (prismaMock.contactType.findFirstOrThrow as any).mockResolvedValueOnce(
        row({ key: 'reseller_2' })
      );

      const result = await admin.create(input);

      expect(prismaMock.contactTag.count).toHaveBeenCalledWith({
        where: { tenantId, id: { in: [TAG_A] }, isActive: true },
      });
      expect(prismaMock.contactType.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          key: 'reseller_2',
          isSystem: false,
          sortOrder: 7,
          name: 'Reseller',
          colorToken: 'teal',
          isActive: true,
          defaultStatus: 'PROSPECT',
          defaultDepartment: 'Channel',
          defaultOwner: 'ACCOUNT_OWNER',
          requiredFields: ['company'],
        },
        select: { id: true },
      });
      const tagArgs = (prismaMock.contactTypeDefaultTag.createMany as any).mock.calls[0][0];
      expect(tagArgs).toEqual({ data: [{ tenantId, contactTypeId: T1, contactTagId: TAG_A }] });
      expect(tagArgs).not.toHaveProperty('skipDuplicates');
      expect(result).toMatchObject({ id: T1, key: 'reseller_2', contactCount: 0 });
      expect(logAction).toHaveBeenCalledWith(
        'CREATE',
        'contact_type',
        T1,
        tenantId,
        expect.objectContaining({ actorId: TEST_UUIDS.admin1 })
      );
    });

    it('rejects a smuggled tenantId (strict input)', async () => {
      await expectCode(
        admin.create({ ...input, tenantId: 'smuggled' } as typeof input),
        'BAD_REQUEST'
      );
      expect(prismaMock.contactType.create).not.toHaveBeenCalled();
    });

    it('rejects default tags that are foreign or inactive with one message', async () => {
      seeded();
      (prismaMock.contactType.count as any).mockResolvedValueOnce(7);
      (prismaMock.contactType.findMany as any).mockResolvedValueOnce([]);
      (prismaMock.contactTag.count as any).mockResolvedValueOnce(1);
      await expect(admin.create({ ...input, defaultTagIds: [TAG_A, TAG_B] })).rejects.toMatchObject(
        {
          code: 'BAD_REQUEST',
          message: 'One or more default tags are not available in this workspace.',
        }
      );
      expect(prismaMock.contactType.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate name (P2002) to CONFLICT without echoing raw input', async () => {
      seeded();
      (prismaMock.contactType.count as any).mockResolvedValueOnce(7);
      (prismaMock.contactType.findMany as any).mockResolvedValueOnce([]);
      (prismaMock.contactTag.count as any).mockResolvedValueOnce(1);
      (prismaMock.contactType.aggregate as any).mockResolvedValueOnce({ _max: { sortOrder: 6 } });
      (prismaMock.contactType.create as any).mockRejectedValueOnce(prismaError('P2002'));
      await expect(admin.create(input)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'A contact type with this name already exists. Choose a different name.',
      });
    });

    it('rethrows other write errors', async () => {
      seeded();
      (prismaMock.contactType.count as any).mockResolvedValueOnce(7);
      (prismaMock.contactType.findMany as any).mockResolvedValueOnce([]);
      (prismaMock.contactTag.count as any).mockResolvedValueOnce(1);
      (prismaMock.contactType.aggregate as any).mockResolvedValueOnce({
        _max: { sortOrder: null },
      });
      (prismaMock.contactType.create as any).mockRejectedValueOnce(new Error('connection lost'));
      await expect(admin.create(input)).rejects.toThrow('connection lost');
    });

    it('skips the default-tag writes when there are none', async () => {
      seeded();
      (prismaMock.contactType.count as any).mockResolvedValueOnce(7);
      (prismaMock.contactType.findMany as any).mockResolvedValueOnce([]);
      (prismaMock.contactType.aggregate as any).mockResolvedValueOnce({
        _max: { sortOrder: null },
      });
      (prismaMock.contactType.create as any).mockResolvedValueOnce({ id: T1 });
      (prismaMock.contactType.findFirstOrThrow as any).mockResolvedValueOnce(
        row({ defaultTags: [] })
      );
      await admin.create({ ...input, defaultTagIds: [] });
      expect(prismaMock.contactTag.count).not.toHaveBeenCalled();
      expect(prismaMock.contactTypeDefaultTag.createMany).not.toHaveBeenCalled();
      expect((prismaMock.contactType.create as any).mock.calls[0][0].data.sortOrder).toBe(0);
    });
  });

  describe('update', () => {
    it('returns NOT_FOUND for a type of another tenant', async () => {
      seeded();
      (prismaMock.contactType.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(admin.update({ ...input, id: FOREIGN }), 'NOT_FOUND');
      expect(prismaMock.contactType.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: FOREIGN, tenantId } })
      );
      expect(prismaMock.contactType.updateMany).not.toHaveBeenCalled();
    });

    it('keeps the default type active', async () => {
      seeded();
      (prismaMock.contactType.findFirst as any).mockResolvedValueOnce(row({ isDefault: true }));
      await expectCode(admin.update({ ...input, id: T1, isActive: false }), 'PRECONDITION_FAILED');
      expect(prismaMock.contactType.updateMany).not.toHaveBeenCalled();
    });

    it('updates fields field by field and replaces the default tags in one transaction', async () => {
      seeded();
      (prismaMock.contactType.findFirst as any).mockResolvedValueOnce(row());
      (prismaMock.contactTag.count as any).mockResolvedValueOnce(2);
      (prismaMock.contactType.updateMany as any).mockResolvedValueOnce({ count: 1 });
      (prismaMock.contactType.findFirstOrThrow as any).mockResolvedValueOnce(row());
      (prismaMock.contact.count as any).mockResolvedValueOnce(3);

      const result = await admin.update({
        ...input,
        id: T1,
        name: 'Channel Reseller',
        defaultTagIds: [TAG_A, TAG_B],
      });

      expect(prismaMock.contactType.updateMany).toHaveBeenCalledWith({
        where: { id: T1, tenantId },
        data: {
          name: 'Channel Reseller',
          colorToken: 'teal',
          isActive: true,
          defaultStatus: 'PROSPECT',
          defaultDepartment: 'Channel',
          defaultOwner: 'ACCOUNT_OWNER',
          requiredFields: ['company'],
        },
      });
      expect(prismaMock.contactTypeDefaultTag.deleteMany).toHaveBeenCalledWith({
        where: { tenantId, contactTypeId: T1 },
      });
      expect(prismaMock.contactTypeDefaultTag.createMany).toHaveBeenCalledWith({
        data: [
          { tenantId, contactTypeId: T1, contactTagId: TAG_A },
          { tenantId, contactTypeId: T1, contactTagId: TAG_B },
        ],
      });
      expect(prismaMock.contact.count).toHaveBeenCalledWith({
        where: { tenantId, contactType: 'reseller' },
      });
      expect(result.contactCount).toBe(3);
      const audit = logAction.mock.calls[0];
      expect(audit.slice(0, 4)).toEqual(['UPDATE', 'contact_type', T1, tenantId]);
      expect(audit[4].afterState).toEqual({ changedFields: ['name', 'defaultTags'] });
    });

    it('guards deactivation in the write (concurrent setDefault)', async () => {
      seeded();
      (prismaMock.contactType.findFirst as any)
        .mockResolvedValueOnce(row())
        .mockResolvedValueOnce({ id: T1 });
      (prismaMock.contactTag.count as any).mockResolvedValueOnce(1);
      (prismaMock.contactType.updateMany as any).mockResolvedValueOnce({ count: 0 });
      await expectCode(admin.update({ ...input, id: T1, isActive: false }), 'PRECONDITION_FAILED');
      expect(prismaMock.contactType.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: T1, tenantId, isDefault: false } })
      );
    });

    it('reports NOT_FOUND when the type vanished during the write', async () => {
      seeded();
      (prismaMock.contactType.findFirst as any)
        .mockResolvedValueOnce(row())
        .mockResolvedValueOnce(null);
      (prismaMock.contactTag.count as any).mockResolvedValueOnce(1);
      (prismaMock.contactType.updateMany as any).mockResolvedValueOnce({ count: 0 });
      await expectCode(admin.update({ ...input, id: T1 }), 'NOT_FOUND');
    });

    it('maps a duplicate name to CONFLICT', async () => {
      seeded();
      (prismaMock.contactType.findFirst as any).mockResolvedValueOnce(row());
      (prismaMock.contactTag.count as any).mockResolvedValueOnce(1);
      (prismaMock.contactType.updateMany as any).mockRejectedValueOnce(prismaError('P2002'));
      await expectCode(admin.update({ ...input, id: T1 }), 'CONFLICT');
    });
  });

  describe('delete', () => {
    it('returns NOT_FOUND for a type of another tenant', async () => {
      (prismaMock.contactType.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(admin.delete({ id: FOREIGN }), 'NOT_FOUND');
      expect(prismaMock.contactType.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: FOREIGN, tenantId } })
      );
      expect(prismaMock.contactType.deleteMany).not.toHaveBeenCalled();
    });

    it('refuses a system type (deactivate instead)', async () => {
      (prismaMock.contactType.findFirst as any).mockResolvedValueOnce(
        row({ isSystem: true, key: 'vendor' })
      );
      await expect(admin.delete({ id: T1 })).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: 'Built-in contact types cannot be deleted. Deactivate it instead.',
      });
      expect(prismaMock.contactType.deleteMany).not.toHaveBeenCalled();
    });

    it('refuses the default type', async () => {
      (prismaMock.contactType.findFirst as any).mockResolvedValueOnce(row({ isDefault: true }));
      await expectCode(admin.delete({ id: T1 }), 'PRECONDITION_FAILED');
    });

    it('refuses a type that contacts use (count in the same transaction)', async () => {
      (prismaMock.contactType.findFirst as any).mockResolvedValueOnce(row());
      (prismaMock.contact.count as any).mockResolvedValueOnce(2);
      await expect(admin.delete({ id: T1 })).rejects.toMatchObject({
        code: 'CONFLICT',
        message: '2 contacts use this type. Deactivate it instead.',
      });
      expect(prismaMock.contact.count).toHaveBeenCalledWith({
        where: { tenantId, contactType: 'reseller' },
      });
      expect(prismaMock.contactType.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes an unused custom type and audits it', async () => {
      (prismaMock.contactType.findFirst as any).mockResolvedValueOnce(row());
      (prismaMock.contact.count as any).mockResolvedValueOnce(0);
      (prismaMock.contactType.deleteMany as any).mockResolvedValueOnce({ count: 1 });
      await expect(admin.delete({ id: T1 })).resolves.toEqual({ success: true });
      expect(prismaMock.contactType.deleteMany).toHaveBeenCalledWith({
        where: { id: T1, tenantId, isDefault: false, isSystem: false },
      });
      expect(logAction).toHaveBeenCalledWith(
        'DELETE',
        'contact_type',
        T1,
        tenantId,
        expect.objectContaining({ beforeState: { key: 'reseller' } })
      );
    });

    it('reports a concurrent change when nothing was deleted', async () => {
      (prismaMock.contactType.findFirst as any).mockResolvedValueOnce(row());
      (prismaMock.contact.count as any).mockResolvedValueOnce(0);
      (prismaMock.contactType.deleteMany as any).mockResolvedValueOnce({ count: 0 });
      await expectCode(admin.delete({ id: T1 }), 'PRECONDITION_FAILED');
    });
  });

  describe('setDefault', () => {
    it('returns NOT_FOUND for a type of another tenant', async () => {
      seeded();
      (prismaMock.contactType.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(admin.setDefault({ id: FOREIGN }), 'NOT_FOUND');
      expect(prismaMock.contactType.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: FOREIGN, tenantId } })
      );
    });

    it('refuses an inactive type', async () => {
      seeded();
      (prismaMock.contactType.findFirst as any).mockResolvedValueOnce(row({ isActive: false }));
      await expectCode(admin.setDefault({ id: T1 }), 'PRECONDITION_FAILED');
      expect(prismaMock.contactType.updateMany).not.toHaveBeenCalled();
    });

    it('clears then sets in one transaction', async () => {
      seeded();
      (prismaMock.contactType.findFirst as any).mockResolvedValueOnce(row());
      (prismaMock.contactType.updateMany as any)
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });
      await expect(admin.setDefault({ id: T1 })).resolves.toEqual({ success: true });
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect((prismaMock.contactType.updateMany as any).mock.calls[0][0]).toEqual({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
      expect((prismaMock.contactType.updateMany as any).mock.calls[1][0]).toEqual({
        where: { id: T1, tenantId, isActive: true },
        data: { isDefault: true },
      });
    });

    it('clears the default with id null', async () => {
      seeded();
      await admin.setDefault({ id: null });
      expect(prismaMock.contactType.updateMany).toHaveBeenCalledTimes(1);
    });

    it('rolls back when the target changed during the write', async () => {
      seeded();
      (prismaMock.contactType.findFirst as any).mockResolvedValueOnce(row());
      (prismaMock.contactType.updateMany as any)
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      await expectCode(admin.setDefault({ id: T1 }), 'PRECONDITION_FAILED');
    });

    it('maps a concurrent default change (P2002) to CONFLICT', async () => {
      seeded();
      (prismaMock.contactType.findFirst as any).mockResolvedValueOnce(row());
      (prismaMock.contactType.updateMany as any)
        .mockResolvedValueOnce({ count: 1 })
        .mockRejectedValueOnce(prismaError('P2002'));
      await expectCode(admin.setDefault({ id: T1 }), 'CONFLICT');
    });
  });

  it('uses plain tenantProcedure: a tenant with every module denied can still list (CORE_CRM)', async () => {
    const ctx = createTestContext();
    (ctx.container as any).get.mockImplementation((name: string) =>
      name === 'moduleAccess'
        ? {
            isModuleEnabled: async () => false,
            getEnabledModules: async () => [],
            getTenantPlan: async () => 'STARTER',
          }
        : undefined
    );
    seeded();
    (prismaMock.contactType.findMany as any).mockResolvedValueOnce([]);
    await expect(contactTypesRouter.createCaller(ctx).list()).resolves.toMatchObject({ types: [] });
  });
});
