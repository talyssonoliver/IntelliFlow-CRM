/**
 * Case Types Router Tests — PG-204 (ADR-076).
 *
 * Callback-form $transaction mocked with mockImplementationOnce(fn => fn(txMock))
 * (playbook §12). Cross-tenant ids resolve to NOT_FOUND because every lookup is
 * scoped by the caller's tenantId.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { caseTypesRouter, toRequiredFieldKeys } from '../case-types.router';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  createPublicContext,
  generateTestUUID,
  TEST_UUIDS,
} from '../../../test/setup';

const tenantId = TEST_UUIDS.tenant;
const T1 = generateTestUUID('case-type-1');
const T2 = generateTestUUID('case-type-2');
const FOREIGN = generateTestUUID('case-type-foreign');
const created = new Date('2026-01-01T00:00:00Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: T1,
    tenantId,
    name: 'Litigation',
    category: 'Disputes',
    colorToken: 'blue',
    defaultPriority: 'HIGH',
    defaultSlaDays: 14,
    requiredFields: ['jurisdiction'],
    isActive: true,
    isDefault: false,
    createdAt: created,
    updatedAt: created,
    checklist: [{ id: 'i1', title: 'Conflict check', sortOrder: 0 }],
    ...overrides,
  };
}

const input = {
  name: 'Litigation',
  category: 'Disputes',
  colorToken: 'blue' as const,
  defaultPriority: 'HIGH' as const,
  defaultSlaDays: 14,
  requiredFields: ['jurisdiction' as const],
  checklist: [{ title: 'Conflict check' }, { title: 'Engagement letter' }],
  isActive: true,
};

function txMock() {
  return {
    caseType: {
      create: vi.fn().mockResolvedValue({ id: T1 }),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: vi.fn().mockResolvedValue(row()),
    },
    caseTypeChecklistItem: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    case: { count: vi.fn().mockResolvedValue(0) },
  };
}

function useTx(tx = txMock()) {
  (prismaMock.$transaction as any).mockImplementationOnce(async (fn: any) => fn(tx));
  return tx;
}

function prismaError(code: string) {
  return Object.assign(new Error(`prisma ${code}`), { code });
}

async function expectCode(promise: Promise<unknown>, code: TRPCError['code']) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('caseTypesRouter', () => {
  let admin: ReturnType<typeof caseTypesRouter.createCaller>;
  let user: ReturnType<typeof caseTypesRouter.createCaller>;

  beforeEach(() => {
    admin = caseTypesRouter.createCaller(createAdminContext());
    user = caseTypesRouter.createCaller(createTestContext());
  });

  it('rejects an unauthenticated caller', async () => {
    const anon = caseTypesRouter.createCaller(createPublicContext());
    await expect(anon.list()).rejects.toBeInstanceOf(TRPCError);
  });

  describe('list', () => {
    it('returns tenant types (default first) with case counts, limits and canEdit', async () => {
      (prismaMock.caseType.findMany as any).mockResolvedValueOnce([
        row({ isDefault: true }),
        row({ id: T2, name: 'Advisory', requiredFields: ['bogus', 'deadline'] }),
      ]);
      (prismaMock.case.groupBy as any).mockResolvedValueOnce([
        { caseTypeId: T1, _count: { _all: 3 } },
        { caseTypeId: null, _count: { _all: 9 } },
      ]);

      const result = await user.list();

      expect(prismaMock.caseType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        })
      );
      expect(prismaMock.case.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId, caseTypeId: { in: [T1, T2] } } })
      );
      expect(result.canEdit).toBe(false);
      expect(result.limits.maxTypesPerTenant).toBe(50);
      expect(result.types[0]).toMatchObject({
        id: T1,
        isDefault: true,
        caseCount: 3,
        checklist: [{ id: 'i1', title: 'Conflict check', sortOrder: 0 }],
      });
      expect(result.types[1]).toMatchObject({ caseCount: 0, requiredFields: ['deadline'] });
    });

    it('skips the case count query when there are no types and reports canEdit for admins', async () => {
      (prismaMock.caseType.findMany as any).mockResolvedValueOnce([]);
      const result = await admin.list();
      expect(prismaMock.case.groupBy).not.toHaveBeenCalled();
      expect(result).toMatchObject({ types: [], canEdit: true });
    });
  });

  describe('listActive', () => {
    it('returns active tenant types in picker shape', async () => {
      (prismaMock.caseType.findMany as any).mockResolvedValueOnce([
        {
          id: T1,
          name: 'Litigation',
          category: null,
          colorToken: 'blue',
          defaultPriority: null,
          defaultSlaDays: null,
          requiredFields: [],
          isDefault: true,
        },
      ]);
      const result = await user.listActive();
      expect(prismaMock.caseType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId, isActive: true } })
      );
      expect(result).toEqual([
        {
          id: T1,
          name: 'Litigation',
          category: null,
          colorToken: 'blue',
          defaultPriority: null,
          defaultSlaDays: null,
          requiredFields: [],
          isDefault: true,
        },
      ]);
    });
  });

  describe('create', () => {
    it('is admin-only', async () => {
      await expectCode(user.create(input), 'FORBIDDEN');
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('enforces the 50-type cap', async () => {
      (prismaMock.caseType.count as any).mockResolvedValueOnce(50);
      await expectCode(admin.create(input), 'BAD_REQUEST');
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('creates the type and its ordered checklist in one transaction', async () => {
      (prismaMock.caseType.count as any).mockResolvedValueOnce(2);
      const tx = useTx();

      const result = await admin.create({ ...input, tenantId: 'smuggled' } as typeof input);

      expect(tx.caseType.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          name: 'Litigation',
          category: 'Disputes',
          colorToken: 'blue',
          defaultPriority: 'HIGH',
          defaultSlaDays: 14,
          requiredFields: ['jurisdiction'],
          isActive: true,
        },
        select: { id: true },
      });
      expect(tx.caseTypeChecklistItem.createMany).toHaveBeenCalledWith({
        data: [
          { tenantId, caseTypeId: T1, title: 'Conflict check', sortOrder: 0 },
          { tenantId, caseTypeId: T1, title: 'Engagement letter', sortOrder: 1 },
        ],
      });
      const createManyArgs = tx.caseTypeChecklistItem.createMany.mock.calls[0][0];
      expect(createManyArgs).not.toHaveProperty('skipDuplicates');
      expect(result).toMatchObject({ id: T1, caseCount: 0 });
    });

    it('skips createMany for an empty checklist', async () => {
      (prismaMock.caseType.count as any).mockResolvedValueOnce(0);
      const tx = useTx();
      await admin.create({ ...input, checklist: [] });
      expect(tx.caseTypeChecklistItem.createMany).not.toHaveBeenCalled();
    });

    it('maps a duplicate name (P2002) to CONFLICT', async () => {
      (prismaMock.caseType.count as any).mockResolvedValueOnce(0);
      const tx = txMock();
      tx.caseType.create.mockRejectedValueOnce(prismaError('P2002'));
      useTx(tx);
      await expect(admin.create(input)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'A case type named "Litigation" already exists. Choose a different name.',
      });
    });

    it('rethrows other write errors', async () => {
      (prismaMock.caseType.count as any).mockResolvedValueOnce(0);
      const tx = txMock();
      tx.caseType.create.mockRejectedValueOnce(new Error('connection lost'));
      useTx(tx);
      await expect(admin.create(input)).rejects.toThrow('connection lost');
    });
  });

  describe('update', () => {
    it('returns NOT_FOUND for a type of another tenant', async () => {
      (prismaMock.caseType.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(admin.update({ ...input, id: FOREIGN }), 'NOT_FOUND');
      expect(prismaMock.caseType.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: FOREIGN, tenantId } })
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('is admin-only', async () => {
      await expectCode(user.update({ ...input, id: T1 }), 'FORBIDDEN');
    });

    it('keeps the default type active', async () => {
      (prismaMock.caseType.findFirst as any).mockResolvedValueOnce(row({ isDefault: true }));
      await expectCode(admin.update({ ...input, id: T1, isActive: false }), 'PRECONDITION_FAILED');
    });

    it('updates the fields and replaces the checklist in one transaction', async () => {
      (prismaMock.caseType.findFirst as any).mockResolvedValueOnce(row());
      (prismaMock.case.count as any).mockResolvedValueOnce(4);
      const tx = useTx();

      const result = await admin.update({ ...input, id: T1 });

      expect(tx.caseType.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: T1, tenantId } })
      );
      expect(tx.caseTypeChecklistItem.deleteMany).toHaveBeenCalledWith({
        where: { tenantId, caseTypeId: T1 },
      });
      expect(tx.caseTypeChecklistItem.createMany).toHaveBeenCalled();
      expect(prismaMock.case.count).toHaveBeenCalledWith({ where: { tenantId, caseTypeId: T1 } });
      expect(result.caseCount).toBe(4);
    });

    it('returns NOT_FOUND when the type is deleted concurrently', async () => {
      (prismaMock.caseType.findFirst as any).mockResolvedValueOnce(row());
      const tx = txMock();
      tx.caseType.updateMany.mockResolvedValueOnce({ count: 0 });
      useTx(tx);
      await expectCode(admin.update({ ...input, id: T1 }), 'NOT_FOUND');
      expect(tx.caseTypeChecklistItem.deleteMany).not.toHaveBeenCalled();
    });

    it('guards deactivation in the write so a concurrent setDefault cannot win', async () => {
      (prismaMock.caseType.findFirst as any).mockResolvedValueOnce(row());
      const tx = txMock();
      tx.caseType.updateMany.mockResolvedValueOnce({ count: 0 });
      tx.caseType.findFirst.mockResolvedValueOnce({ id: T1 });
      useTx(tx);
      await expect(admin.update({ ...input, id: T1, isActive: false })).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: 'The default case type must stay active. Choose another default first.',
      });
      expect(tx.caseType.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: T1, tenantId, isDefault: false } })
      );
    });

    it('maps a rename collision (P2002) to CONFLICT', async () => {
      (prismaMock.caseType.findFirst as any).mockResolvedValueOnce(row());
      const tx = txMock();
      tx.caseType.updateMany.mockRejectedValueOnce(prismaError('P2002'));
      useTx(tx);
      await expectCode(admin.update({ ...input, id: T1 }), 'CONFLICT');
    });
  });

  describe('delete', () => {
    it('returns NOT_FOUND for a type of another tenant', async () => {
      (prismaMock.caseType.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(admin.delete({ id: FOREIGN }), 'NOT_FOUND');
    });

    it('is admin-only', async () => {
      await expectCode(user.delete({ id: T1 }), 'FORBIDDEN');
    });

    it('refuses to delete the default type', async () => {
      (prismaMock.caseType.findFirst as any).mockResolvedValueOnce(row({ isDefault: true }));
      await expectCode(admin.delete({ id: T1 }), 'PRECONDITION_FAILED');
    });

    it('refuses to delete a type that cases use, naming the count', async () => {
      (prismaMock.caseType.findFirst as any).mockResolvedValueOnce(row());
      const tx = txMock();
      tx.case.count.mockResolvedValueOnce(3);
      useTx(tx);
      await expect(admin.delete({ id: T1 })).rejects.toMatchObject({
        code: 'CONFLICT',
        message: '3 cases use this type. Deactivate it instead.',
      });
      expect(tx.caseType.deleteMany).not.toHaveBeenCalled();
    });

    it('uses the singular for one case', async () => {
      (prismaMock.caseType.findFirst as any).mockResolvedValueOnce(row());
      const tx = txMock();
      tx.case.count.mockResolvedValueOnce(1);
      useTx(tx);
      await expect(admin.delete({ id: T1 })).rejects.toMatchObject({
        message: '1 case uses this type. Deactivate it instead.',
      });
    });

    it('deletes an unused, non-default type inside the transaction', async () => {
      (prismaMock.caseType.findFirst as any).mockResolvedValueOnce(row());
      const tx = useTx();
      await expect(admin.delete({ id: T1 })).resolves.toEqual({ success: true });
      expect(tx.case.count).toHaveBeenCalledWith({ where: { tenantId, caseTypeId: T1 } });
      expect(tx.caseType.deleteMany).toHaveBeenCalledWith({
        where: { id: T1, tenantId, isDefault: false },
      });
    });

    it('reports a concurrent change when nothing was deleted', async () => {
      (prismaMock.caseType.findFirst as any).mockResolvedValueOnce(row());
      const tx = txMock();
      tx.caseType.deleteMany.mockResolvedValueOnce({ count: 0 });
      useTx(tx);
      await expectCode(admin.delete({ id: T1 }), 'PRECONDITION_FAILED');
    });

    it('maps a racing case insert (P2003) to CONFLICT', async () => {
      (prismaMock.caseType.findFirst as any).mockResolvedValueOnce(row());
      const tx = txMock();
      tx.caseType.deleteMany.mockRejectedValueOnce(prismaError('P2003'));
      useTx(tx);
      await expectCode(admin.delete({ id: T1 }), 'CONFLICT');
    });

    it('rethrows unexpected errors', async () => {
      (prismaMock.caseType.findFirst as any).mockResolvedValueOnce(row());
      const tx = txMock();
      tx.caseType.deleteMany.mockRejectedValueOnce(new Error('boom'));
      useTx(tx);
      await expect(admin.delete({ id: T1 })).rejects.toThrow('boom');
    });
  });

  describe('setDefault', () => {
    it('is admin-only', async () => {
      await expectCode(user.setDefault({ id: T1 }), 'FORBIDDEN');
    });

    it('clears the default when id is null', async () => {
      const tx = useTx();
      await expect(admin.setDefault({ id: null })).resolves.toEqual({ success: true });
      expect(tx.caseType.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.caseType.updateMany).toHaveBeenCalledWith({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    });

    it('returns NOT_FOUND for a type of another tenant', async () => {
      (prismaMock.caseType.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(admin.setDefault({ id: FOREIGN }), 'NOT_FOUND');
    });

    it('refuses an inactive type', async () => {
      (prismaMock.caseType.findFirst as any).mockResolvedValueOnce(row({ isActive: false }));
      await expectCode(admin.setDefault({ id: T1 }), 'PRECONDITION_FAILED');
    });

    it('clears then sets in one transaction', async () => {
      (prismaMock.caseType.findFirst as any).mockResolvedValueOnce(row());
      const tx = useTx();
      await admin.setDefault({ id: T1 });
      expect(tx.caseType.updateMany).toHaveBeenNthCalledWith(1, {
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
      expect(tx.caseType.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: T1, tenantId, isActive: true },
        data: { isDefault: true },
      });
    });

    it('refuses a type deactivated or deleted concurrently (rolls back the clear)', async () => {
      (prismaMock.caseType.findFirst as any).mockResolvedValueOnce(row());
      const tx = txMock();
      tx.caseType.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      useTx(tx);
      await expectCode(admin.setDefault({ id: T1 }), 'PRECONDITION_FAILED');
    });

    it('maps a concurrent default change (P2002) to CONFLICT and rethrows others', async () => {
      (prismaMock.caseType.findFirst as any).mockResolvedValue(row());
      const tx = txMock();
      tx.caseType.updateMany.mockRejectedValueOnce(prismaError('P2002'));
      useTx(tx);
      await expect(admin.setDefault({ id: T1 })).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'The default case type changed at the same time. Reload and try again.',
      });

      const tx2 = txMock();
      tx2.caseType.updateMany.mockRejectedValueOnce(new Error('down'));
      useTx(tx2);
      await expect(admin.setDefault({ id: T1 })).rejects.toThrow('down');
    });
  });

  describe('toRequiredFieldKeys', () => {
    it('keeps only known keys', () => {
      expect(toRequiredFieldKeys(['deadline', 'x', 'title'])).toEqual(['deadline', 'title']);
    });
  });
});
