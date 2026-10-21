import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  generateTestUUID,
  TEST_UUIDS,
} from '../../../test/setup';

const logAction = vi.fn();
const logPermissionDenied = vi.fn();
vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction, logPermissionDenied }),
}));

import { emailSignaturesRouter } from '../email-signatures.router';

const tenantId = TEST_UUIDS.tenant;
const S1 = generateTestUUID('sig-1');
const S2 = generateTestUUID('sig-2');
const FOREIGN = generateTestUUID('sig-foreign');
const updatedAt = new Date(Date.UTC(2026, 9, 20));

const sig = (over: Record<string, unknown> = {}) => ({
  id: S1,
  tenantId,
  scope: 'USER',
  userId: TEST_UUIDS.user1,
  name: 'Work',
  html: '<p>Me</p>',
  isDefault: false,
  updatedAt,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  logAction.mockResolvedValue('a');
  logPermissionDenied.mockResolvedValue('b');
  (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(prismaMock));
  (prismaMock.emailSignature.findMany as any).mockResolvedValue([]);
  (prismaMock.emailSignature.count as any).mockResolvedValue(0);
  (prismaMock.emailSignature.create as any).mockImplementation(async ({ data }: any) =>
    sig({ ...data, id: S2 })
  );
  (prismaMock.emailSignature.update as any).mockImplementation(async ({ data }: any) => sig(data));
});

const member = () => emailSignaturesRouter.createCaller(createTestContext() as never);
const admin = () => emailSignaturesRouter.createCaller(createAdminContext() as never);

describe('emailSignatures.list', () => {
  it('returns my signatures and the org signatures with canManageOrg', async () => {
    (prismaMock.emailSignature.findMany as any).mockResolvedValue([
      sig(),
      sig({ id: S2, scope: 'ORG', userId: null, name: 'Team', isDefault: true }),
    ]);
    const result = await member().list();
    expect(result.canManageOrg).toBe(false);
    expect(result.mine.map((s) => s.id)).toEqual([S1]);
    expect(result.org.map((s) => s.id)).toEqual([S2]);
    expect(prismaMock.emailSignature.findMany).toHaveBeenCalledWith({
      where: { tenantId, OR: [{ scope: 'USER', userId: TEST_UUIDS.user1 }, { scope: 'ORG' }] },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    expect((await admin().list()).canManageOrg).toBe(true);
  });
});

describe('emailSignatures.create', () => {
  it('creates a sanitised personal signature for the caller (userId from ctx)', async () => {
    await member().create({ scope: 'USER', name: 'Work', html: '<p>Me</p><script>x()</script>' });
    expect(prismaMock.emailSignature.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        scope: 'USER',
        userId: TEST_UUIDS.user1,
        name: 'Work',
        html: '<p>Me</p>',
        isDefault: false,
      },
    });
  });

  it('clears the previous default in the same transaction when creating a default', async () => {
    await member().create({ scope: 'USER', name: 'Work', html: '<p>Me</p>', isDefault: true });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.emailSignature.updateMany).toHaveBeenCalledWith({
      where: { tenantId, scope: 'USER', userId: TEST_UUIDS.user1, isDefault: true },
      data: { isDefault: false },
    });
  });

  it('rejects a duplicate name in the same scope (superRefine), case-insensitively', async () => {
    (prismaMock.emailSignature.findMany as any).mockResolvedValue([sig({ name: 'Work' })]);
    await expect(
      member().create({ scope: 'USER', name: ' work ', html: '<p>x</p>' })
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(prismaMock.emailSignature.create).not.toHaveBeenCalled();
  });

  it('maps a racing duplicate (P2002) to CONFLICT', async () => {
    (prismaMock.emailSignature.create as any).mockRejectedValueOnce(
      Object.assign(new Error('dup'), { code: 'P2002' })
    );
    await expect(
      member().create({ scope: 'USER', name: 'Work', html: '<p>x</p>' })
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('caps signatures per owner scope', async () => {
    (prismaMock.emailSignature.count as any).mockResolvedValue(20);
    await expect(
      member().create({ scope: 'USER', name: 'One more', html: '<p>x</p>' })
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(prismaMock.emailSignature.create).not.toHaveBeenCalled();
  });

  it('counts against the cap inside the create transaction, serialised per owner', async () => {
    const order: string[] = [];
    (prismaMock as any).$executeRaw = vi.fn(async () => {
      order.push('lock');
      return 1;
    });
    (prismaMock.emailSignature.count as any).mockImplementation(async () => {
      order.push('count');
      return 3;
    });
    (prismaMock.emailSignature.create as any).mockImplementation(async ({ data }: any) => {
      order.push('create');
      return { id: 'sig-9', ...data, createdAt: updatedAt, updatedAt };
    });
    await member().create({ scope: 'USER', name: 'Racing', html: '<p>x</p>' });
    // Two concurrent creations each counting 19 can no longer both insert.
    expect(order).toEqual(['lock', 'count', 'create']);
  });

  it('lets only admins create org signatures', async () => {
    await expect(
      member().create({ scope: 'ORG', name: 'Team', html: '<p>x</p>' })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await admin().create({ scope: 'ORG', name: 'Team', html: '<p>x</p>' });
    expect((prismaMock.emailSignature.create as any).mock.calls[0][0].data).toMatchObject({
      scope: 'ORG',
      userId: null,
    });
  });
});

describe('emailSignatures.update / delete / setDefault', () => {
  it('updates my signature by id within my tenant and scope', async () => {
    (prismaMock.emailSignature.findFirst as any).mockResolvedValue(sig());
    await member().update({ id: S1, name: 'Renamed', html: '<p>New</p>' });
    expect(prismaMock.emailSignature.findFirst).toHaveBeenCalledWith({
      where: { id: S1, tenantId },
    });
    expect(prismaMock.emailSignature.update).toHaveBeenCalledWith({
      where: { id: S1 },
      data: { name: 'Renamed', html: '<p>New</p>' },
    });
  });

  it('allows keeping the same name on rename', async () => {
    (prismaMock.emailSignature.findFirst as any).mockResolvedValue(sig());
    (prismaMock.emailSignature.findMany as any).mockResolvedValue([sig()]);
    await expect(member().update({ id: S1, name: 'WORK' })).resolves.toBeDefined();
  });

  it('cross-tenant / foreign id is NOT_FOUND and nothing is written', async () => {
    (prismaMock.emailSignature.findFirst as any).mockResolvedValue(null);
    await expect(member().update({ id: FOREIGN, name: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(member().delete({ id: FOREIGN })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(member().setDefault({ id: FOREIGN })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prismaMock.emailSignature.update).not.toHaveBeenCalled();
    expect(prismaMock.emailSignature.delete).not.toHaveBeenCalled();
  });

  it("is NOT_FOUND for another user's personal signature in the same tenant", async () => {
    (prismaMock.emailSignature.findFirst as any).mockResolvedValue(
      sig({ userId: TEST_UUIDS.user2 })
    );
    await expect(member().update({ id: S1, name: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(admin().delete({ id: S1 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('forbids members from changing org signatures', async () => {
    (prismaMock.emailSignature.findFirst as any).mockResolvedValue(
      sig({ scope: 'ORG', userId: null })
    );
    await expect(member().update({ id: S1, name: 'x' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(member().delete({ id: S1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('deletes inside a transaction', async () => {
    (prismaMock.emailSignature.findFirst as any).mockResolvedValue(sig());
    await member().delete({ id: S1 });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.emailSignature.delete).toHaveBeenCalledWith({ where: { id: S1 } });
  });

  it('setDefault clears the old default and sets the new one in one transaction', async () => {
    (prismaMock.emailSignature.findFirst as any).mockResolvedValue(
      sig({ scope: 'ORG', userId: null })
    );
    await admin().setDefault({ id: S1 });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.emailSignature.updateMany).toHaveBeenCalledWith({
      where: { tenantId, scope: 'ORG', userId: null, isDefault: true },
      data: { isDefault: false },
    });
    expect(prismaMock.emailSignature.update).toHaveBeenCalledWith({
      where: { id: S1 },
      data: { isDefault: true },
    });
  });
});

describe('emailSignatures.resolveDefault', () => {
  it('returns the user default before the org default, sanitised', async () => {
    (prismaMock.emailSignature.findMany as any).mockResolvedValue([
      sig({ isDefault: true, html: '<p>Mine</p><img src="javascript:x">' }),
      sig({ id: S2, scope: 'ORG', userId: null, isDefault: true, html: '<p>Org</p>' }),
    ]);
    await expect(member().resolveDefault()).resolves.toEqual({
      id: S1,
      html: '<p>Mine</p><img />',
    });
  });

  it('returns null when there is no default', async () => {
    await expect(member().resolveDefault()).resolves.toBeNull();
  });
});
