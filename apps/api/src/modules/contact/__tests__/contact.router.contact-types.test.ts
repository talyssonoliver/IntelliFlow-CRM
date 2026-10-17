/**
 * Contact router × contact types — PG-205 (ADR-080).
 *
 * contact.create applies the chosen type (default status/department/owner rule/
 * tags, extra required fields), contact.update validates a changed type and the
 * effective type's required fields, contact.list filters by type and by the
 * `vip` segment. Includes the B14 fix (tenant `jobTitle` rule checks `title`).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CONTACT_TYPES } from '@intelliflow/domain';
import { contactRouter } from '../contact.router';
import { prismaMock, createTestContext, generateTestUUID, TEST_UUIDS } from '../../../test/setup';

vi.mock('../../../lib/load-bullmq', () => ({
  loadBullMQ: vi.fn(async () => ({
    Queue: class MockQueue {
      add = vi.fn().mockResolvedValue({ id: 'job-stub' });
      close = vi.fn().mockResolvedValue(undefined);
    },
    QueueEvents: class MockQueueEvents {
      close = vi.fn().mockResolvedValue(undefined);
    },
  })),
}));

const assertQuota = vi.fn();
vi.mock('../../../shared/quota-guard', () => ({
  assertQuota: (...args: unknown[]) => assertQuota(...args),
  withQuotaLock: (_ctx: unknown, _t: unknown, _r: unknown, _n: unknown, fn: () => unknown) => fn(),
}));

const logAction = vi.fn();
vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction, logPermissionDenied: vi.fn().mockResolvedValue('d') }),
}));

const tenantId = TEST_UUIDS.tenant;
const userId = TEST_UUIDS.user1;
const TYPE_ID = generateTestUUID('contact-type-vendor');
const ACCOUNT_ID = TEST_UUIDS.account1;
const ACCOUNT_OWNER = generateTestUUID('account-owner');
const CONTACT_ID = TEST_UUIDS.contact1;

function typeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TYPE_ID,
    key: 'vendor',
    isActive: true,
    defaultStatus: 'PROSPECT',
    defaultDepartment: 'Procurement',
    defaultOwner: 'CREATOR',
    requiredFields: [],
    ...overrides,
  };
}

function domainContact(overrides: Record<string, unknown> = {}) {
  return {
    id: { value: CONTACT_ID },
    email: { value: 'new@example.com' },
    firstName: 'Ann',
    lastName: 'Lee',
    title: null,
    phone: null,
    department: null,
    status: 'ACTIVE',
    accountId: null,
    leadId: null,
    ownerId: userId,
    tenantId,
    tags: [],
    contactType: null,
    lastContactedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

const base = { email: 'new@example.com', firstName: 'Ann', lastName: 'Lee' };

function setupCreate() {
  const ctx = createTestContext();
  const createContact = vi
    .fn()
    .mockResolvedValue({ isSuccess: true, isFailure: false, value: domainContact() });
  ctx.services!.contact!.createContact = createContact;
  return { caller: contactRouter.createCaller(ctx), createContact };
}

function seededWith(row: Record<string, unknown> | null, tags: string[] = []) {
  (prismaMock.contactType.count as any).mockResolvedValue(6);
  (prismaMock.contactType.findFirst as any).mockResolvedValue(row);
  (prismaMock.contactTypeDefaultTag.findMany as any).mockResolvedValue(
    tags.map((name) => ({ contactTag: { name } }))
  );
}

beforeEach(() => {
  assertQuota.mockReset().mockResolvedValue(undefined);
  logAction.mockReset().mockResolvedValue('audit-1');
  (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(prismaMock));
});

describe('contact.create with a contact type', () => {
  it('applies the type defaults: status, department and active default tags', async () => {
    seededWith(typeRow(), ['supplier']);
    const { caller, createContact } = setupCreate();

    await caller.create({ ...base, contactType: 'vendor' });

    expect(prismaMock.contactType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, key: 'vendor', isActive: true } })
    );
    expect(createContact).toHaveBeenCalledWith(
      expect.objectContaining({
        contactType: 'vendor',
        status: 'PROSPECT',
        department: 'Procurement',
        tags: ['supplier'],
        ownerId: userId,
        tenantId,
      })
    );
  });

  it('keeps explicit input over the type defaults and merges tags', async () => {
    seededWith(typeRow(), ['supplier']);
    const { caller, createContact } = setupCreate();
    await caller.create({
      ...base,
      contactType: 'vendor',
      status: 'CUSTOMER',
      department: 'Sales',
      tags: ['vip'],
    });
    expect(createContact).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'CUSTOMER',
        department: 'Sales',
        tags: ['vip', 'supplier'],
      })
    );
  });

  it.each(['unknown', 'foreign', 'inactive'])(
    'rejects a %s type with one identical message before any quota or write',
    async () => {
      seededWith(null);
      const { caller, createContact } = setupCreate();
      await expect(caller.create({ ...base, contactType: 'reseller' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Invalid contact type',
      });
      expect(createContact).not.toHaveBeenCalled();
      expect(assertQuota).not.toHaveBeenCalled();
    }
  );

  it.each([...CONTACT_TYPES])('accepts the seed key %s', async (key) => {
    seededWith(typeRow({ key, defaultStatus: null, defaultDepartment: null }));
    const { caller, createContact } = setupCreate();
    await caller.create({ ...base, contactType: key });
    expect(createContact).toHaveBeenCalledWith(expect.objectContaining({ contactType: key }));
  });

  it('ACCOUNT_OWNER: uses the linked same-tenant account owner who is a live member', async () => {
    seededWith(typeRow({ defaultOwner: 'ACCOUNT_OWNER' }));
    (prismaMock.account.findFirst as any).mockResolvedValueOnce({ ownerId: ACCOUNT_OWNER });
    (prismaMock.user.findFirst as any).mockResolvedValueOnce({ id: ACCOUNT_OWNER });
    const { caller, createContact } = setupCreate();

    await caller.create({ ...base, contactType: 'vendor', accountId: ACCOUNT_ID });

    expect(prismaMock.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ACCOUNT_ID, tenantId } })
    );
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: ACCOUNT_OWNER }) })
    );
    expect(createContact).toHaveBeenCalledWith(expect.objectContaining({ ownerId: ACCOUNT_OWNER }));
    // The lookup runs before the insert.
    const lookupOrder = (prismaMock.account.findFirst as any).mock.invocationCallOrder[0];
    expect(lookupOrder).toBeLessThan(createContact.mock.invocationCallOrder[0]);
  });

  it('ACCOUNT_OWNER: a foreign or missing account falls back to the creator', async () => {
    seededWith(typeRow({ defaultOwner: 'ACCOUNT_OWNER' }));
    (prismaMock.account.findFirst as any).mockResolvedValueOnce(null);
    const { caller, createContact } = setupCreate();
    await caller.create({ ...base, contactType: 'vendor', accountId: ACCOUNT_ID });
    expect(createContact).toHaveBeenCalledWith(expect.objectContaining({ ownerId: userId }));
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    const audit = logAction.mock.calls.find((c) => c[0] === 'CREATE');
    expect(audit?.[4].afterState.ownerFallback).toBe('no_account');
  });

  it('ACCOUNT_OWNER: an owner who is no longer a member falls back to the creator', async () => {
    seededWith(typeRow({ defaultOwner: 'ACCOUNT_OWNER' }));
    (prismaMock.account.findFirst as any).mockResolvedValueOnce({ ownerId: ACCOUNT_OWNER });
    (prismaMock.user.findFirst as any).mockResolvedValueOnce(null);
    const { caller, createContact } = setupCreate();
    await caller.create({ ...base, contactType: 'vendor', accountId: ACCOUNT_ID });
    expect(createContact).toHaveBeenCalledWith(expect.objectContaining({ ownerId: userId }));
    const audit = logAction.mock.calls.find((c) => c[0] === 'CREATE');
    expect(audit?.[4].afterState.ownerFallback).toBe('account_owner_invalid');
  });

  it('enforces the type required fields after defaults (tenant ∪ type)', async () => {
    seededWith(typeRow({ requiredFields: ['phone', 'department'] }));
    const { caller, createContact } = setupCreate();
    // department is filled by the type default; phone is still missing.
    await expect(caller.create({ ...base, contactType: 'vendor' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('phone'),
    });
    expect(createContact).not.toHaveBeenCalled();
  });

  it('audits the type, the applied default field names and no default values', async () => {
    seededWith(typeRow(), ['supplier']);
    const { caller } = setupCreate();
    await caller.create({ ...base, contactType: 'vendor' });
    const audit = logAction.mock.calls.find((c) => c[0] === 'CREATE');
    expect(audit?.[4].afterState).toMatchObject({
      contactType: 'vendor',
      appliedDefaults: ['status', 'department', 'tags'],
      ownerFallback: null,
    });
    expect(JSON.stringify(audit?.[4].afterState)).not.toContain('Procurement');
    expect(JSON.stringify(audit?.[4].afterState)).not.toContain('supplier');
  });

  it('never honours a client ownerId, tenantId or dataClassification', async () => {
    seededWith(typeRow());
    const { caller, createContact } = setupCreate();
    await caller.create({
      ...base,
      contactType: 'vendor',
      ownerId: 'evil-owner',
      tenantId: 'evil-tenant',
      dataClassification: 'PUBLIC',
    } as typeof base);
    const props = createContact.mock.calls[0][0];
    expect(props.ownerId).toBe(userId);
    expect(props.tenantId).toBe(tenantId);
    expect(props).not.toHaveProperty('dataClassification');
  });

  it('without a type, does not touch contact types at all', async () => {
    const { caller, createContact } = setupCreate();
    await caller.create(base);
    expect(prismaMock.contactType.findFirst).not.toHaveBeenCalled();
    expect(createContact).toHaveBeenCalled();
  });
});

describe('B14: tenant "job title" required rule checks the title field', () => {
  beforeEach(() => {
    (prismaMock.contactRequiredField.findMany as any).mockResolvedValue([{ fieldKey: 'jobTitle' }]);
  });

  it('create fails without a title', async () => {
    const { caller, createContact } = setupCreate();
    await expect(caller.create(base)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('jobTitle'),
    });
    expect(createContact).not.toHaveBeenCalled();
  });

  it('create passes with a title', async () => {
    const { caller, createContact } = setupCreate();
    await caller.create({ ...base, title: 'CTO' });
    expect(createContact).toHaveBeenCalled();
  });

  it('update fails when the title is explicitly cleared', async () => {
    const ctx = createTestContext();
    (prismaMock.contact.findFirst as any).mockResolvedValue({ id: CONTACT_ID });
    (prismaMock.contact.findUnique as any).mockResolvedValue({ id: CONTACT_ID, contactType: null });
    ctx.services!.contact!.updateContactInfo = vi.fn();
    await expect(
      // nameSchema trims after min(1): whitespace reaches the policy check as ''.
      contactRouter.createCaller(ctx).update({ id: CONTACT_ID, title: '   ' } as never)
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(ctx.services!.contact!.updateContactInfo).not.toHaveBeenCalled();
  });
});

describe('contact.update with a contact type', () => {
  function setupUpdate(before: Record<string, unknown>) {
    const ctx = createTestContext();
    (prismaMock.contact.findFirst as any).mockResolvedValue({ id: CONTACT_ID });
    (prismaMock.contact.findUnique as any).mockResolvedValue({ id: CONTACT_ID, ...before });
    const updateContactInfo = vi
      .fn()
      .mockResolvedValue({ isSuccess: true, isFailure: false, value: domainContact() });
    ctx.services!.contact!.updateContactInfo = updateContactInfo;
    ctx.services!.contact!.associateWithAccount = vi
      .fn()
      .mockResolvedValue({ isSuccess: true, isFailure: false, value: domainContact() });
    ctx.services!.contact!.getContactById = vi
      .fn()
      .mockResolvedValue({ isSuccess: true, isFailure: false, value: domainContact() });
    return { caller: contactRouter.createCaller(ctx), updateContactInfo };
  }

  it('accepts the unchanged stored key even when that type is inactive', async () => {
    seededWith(typeRow({ isActive: false }));
    const { caller, updateContactInfo } = setupUpdate({ contactType: 'vendor' });
    await caller.update({ id: CONTACT_ID, contactType: 'vendor', firstName: 'Anna' });
    expect(updateContactInfo).toHaveBeenCalled();
    expect(prismaMock.contactType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, key: 'vendor' } })
    );
  });

  it('rejects a change to an inactive, unknown or foreign type', async () => {
    seededWith(null);
    const { caller, updateContactInfo } = setupUpdate({ contactType: 'customer' });
    await expect(caller.update({ id: CONTACT_ID, contactType: 'vendor' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Invalid contact type',
    });
    expect(prismaMock.contactType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, key: 'vendor', isActive: true } })
    );
    expect(updateContactInfo).not.toHaveBeenCalled();
  });

  it('checks the new type required fields against the stored row plus the input', async () => {
    seededWith(typeRow({ requiredFields: ['phone'] }));
    const { caller, updateContactInfo } = setupUpdate({ contactType: 'customer', phone: null });
    await expect(caller.update({ id: CONTACT_ID, contactType: 'vendor' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('phone'),
    });
    expect(updateContactInfo).not.toHaveBeenCalled();
  });

  it('passes a type change when the stored row already has the required fields', async () => {
    seededWith(typeRow({ requiredFields: ['company'] }));
    const { caller, updateContactInfo } = setupUpdate({ contactType: 'customer', company: 'Acme' });
    await caller.update({ id: CONTACT_ID, contactType: 'vendor' });
    expect(updateContactInfo).toHaveBeenCalled();
  });

  it('does not re-apply the type defaults on update', async () => {
    seededWith(typeRow());
    const { caller, updateContactInfo } = setupUpdate({ contactType: 'customer' });
    await caller.update({ id: CONTACT_ID, contactType: 'vendor' });
    const updates = updateContactInfo.mock.calls[0][1];
    expect(updates).toEqual({ contactType: 'vendor' });
  });

  it('keeps explicit-clear semantics for the effective type required fields', async () => {
    seededWith(typeRow({ requiredFields: ['company'] }));
    const { caller, updateContactInfo } = setupUpdate({ contactType: 'vendor', company: 'Acme' });
    await expect(caller.update({ id: CONTACT_ID, company: '' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('company'),
    });
    expect(updateContactInfo).not.toHaveBeenCalled();
  });

  it('a type that requires an account rejects an unknown or foreign account before any write (codex 068bafef)', async () => {
    seededWith(typeRow({ requiredFields: ['accountId'] }));
    (prismaMock.account.findFirst as any).mockResolvedValue(null);
    const { caller, updateContactInfo } = setupUpdate({ contactType: 'customer', accountId: null });
    await expect(
      caller.update({ id: CONTACT_ID, contactType: 'vendor', accountId: ACCOUNT_ID })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('account') });
    expect(prismaMock.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ACCOUNT_ID, tenantId } })
    );
    expect(updateContactInfo).not.toHaveBeenCalled();
  });

  it('a type that requires an account accepts a same-tenant account', async () => {
    seededWith(typeRow({ requiredFields: ['accountId'] }));
    (prismaMock.account.findFirst as any).mockResolvedValue({ id: ACCOUNT_ID });
    const { caller, updateContactInfo } = setupUpdate({ contactType: 'customer', accountId: null });
    await caller.update({ id: CONTACT_ID, contactType: 'vendor', accountId: ACCOUNT_ID });
    expect(updateContactInfo).toHaveBeenCalled();
  });

  it('replaces a linked account in one service call, before the other fields (codex 18941caa, a3d0b852)', async () => {
    const OTHER_ACCOUNT = generateTestUUID('account-other');
    seededWith(null);
    const ctx = createTestContext();
    (prismaMock.contact.findFirst as any).mockResolvedValue({ id: CONTACT_ID });
    (prismaMock.contact.findUnique as any).mockResolvedValue({
      id: CONTACT_ID,
      accountId: ACCOUNT_ID,
    });
    const ok = { isSuccess: true, isFailure: false, value: domainContact() };
    const calls: string[] = [];
    ctx.services!.contact!.updateContactInfo = vi.fn(async () => (calls.push('info'), ok)) as any;
    ctx.services!.contact!.disassociateFromAccount = vi.fn(
      async () => (calls.push('unlink'), ok)
    ) as any;
    ctx.services!.contact!.associateWithAccount = vi.fn(
      async () => (calls.push('link'), ok)
    ) as any;
    ctx.services!.contact!.replaceAccount = vi.fn(async () => (calls.push('replace'), ok)) as any;
    ctx.services!.contact!.getContactById = vi.fn().mockResolvedValue(ok);

    await contactRouter
      .createCaller(ctx)
      .update({ id: CONTACT_ID, accountId: OTHER_ACCOUNT, firstName: 'Anna' });

    expect(ctx.services!.contact!.replaceAccount).toHaveBeenCalledWith(
      CONTACT_ID,
      OTHER_ACCOUNT,
      expect.any(String),
      tenantId
    );
    // One atomic replace, and it runs first, so a failed link leaves the other fields unsaved.
    expect(calls).toEqual(['replace', 'info']);
  });

  it('unlinking saves the other fields first, so a failed unlink never leaves a type without its required account (codex 068bafef)', async () => {
    seededWith(null);
    const ctx = createTestContext();
    (prismaMock.contact.findFirst as any).mockResolvedValue({ id: CONTACT_ID });
    (prismaMock.contact.findUnique as any).mockResolvedValue({
      id: CONTACT_ID,
      accountId: ACCOUNT_ID,
    });
    const ok = { isSuccess: true, isFailure: false, value: domainContact() };
    const calls: string[] = [];
    ctx.services!.contact!.updateContactInfo = vi.fn(async () => (calls.push('info'), ok)) as any;
    ctx.services!.contact!.disassociateFromAccount = vi.fn(
      async () => (calls.push('unlink'), ok)
    ) as any;
    ctx.services!.contact!.getContactById = vi.fn().mockResolvedValue(ok);

    await contactRouter
      .createCaller(ctx)
      .update({ id: CONTACT_ID, accountId: null, contactType: null });

    expect(calls).toEqual(['info', 'unlink']);
  });

  it('replacing with an unknown or foreign account fails before any other write', async () => {
    seededWith(null);
    const ctx = createTestContext();
    (prismaMock.contact.findFirst as any).mockResolvedValue({ id: CONTACT_ID });
    (prismaMock.contact.findUnique as any).mockResolvedValue({
      id: CONTACT_ID,
      accountId: ACCOUNT_ID,
    });
    const ok = { isSuccess: true, isFailure: false, value: domainContact() };
    const missing = { isSuccess: false, isFailure: true, error: new Error('Account not found: x') };
    ctx.services!.contact!.updateContactInfo = vi.fn().mockResolvedValue(ok);
    ctx.services!.contact!.disassociateFromAccount = vi.fn().mockResolvedValue(ok);
    ctx.services!.contact!.replaceAccount = vi.fn().mockResolvedValue(missing);
    ctx.services!.contact!.getContactById = vi.fn().mockResolvedValue(ok);

    await expect(
      contactRouter
        .createCaller(ctx)
        .update({ id: CONTACT_ID, accountId: generateTestUUID('account-foreign'), firstName: 'A' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(ctx.services!.contact!.disassociateFromAccount).not.toHaveBeenCalled();
    expect(ctx.services!.contact!.updateContactInfo).not.toHaveBeenCalled();
  });

  it('a replace that fails for another reason is a bad request', async () => {
    seededWith(null);
    const ctx = createTestContext();
    (prismaMock.contact.findFirst as any).mockResolvedValue({ id: CONTACT_ID });
    (prismaMock.contact.findUnique as any).mockResolvedValue({
      id: CONTACT_ID,
      accountId: ACCOUNT_ID,
    });
    const failed = {
      isSuccess: false,
      isFailure: true,
      error: new Error('Failed to save contact'),
    };
    ctx.services!.contact!.replaceAccount = vi.fn().mockResolvedValue(failed);
    ctx.services!.contact!.updateContactInfo = vi.fn();

    await expect(
      contactRouter
        .createCaller(ctx)
        .update({ id: CONTACT_ID, accountId: generateTestUUID('account-b'), firstName: 'A' })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(ctx.services!.contact!.updateContactInfo).not.toHaveBeenCalled();
  });

  it('null clears the stored type without looking up any type (codex 1f2a3c92)', async () => {
    seededWith(typeRow({ requiredFields: ['company'] }));
    const { caller, updateContactInfo } = setupUpdate({ contactType: 'vendor', company: null });
    await caller.update({ id: CONTACT_ID, contactType: null });
    expect(prismaMock.contactType.findFirst).not.toHaveBeenCalled();
    expect(updateContactInfo.mock.calls[0][1]).toEqual({ contactType: null });
  });

  it('skips type rules when the stored key has no type row (legacy data)', async () => {
    seededWith(null);
    const { caller, updateContactInfo } = setupUpdate({ contactType: 'legacy_key' });
    await caller.update({ id: CONTACT_ID, company: '' });
    expect(updateContactInfo).toHaveBeenCalled();
  });
});

describe('contact.list type filter and vip segment', () => {
  function listCaller() {
    (prismaMock.contact.findMany as any).mockResolvedValue([]);
    (prismaMock.contact.count as any).mockResolvedValue(0);
    return contactRouter.createCaller(createTestContext());
  }

  it('filters by contact type inside the tenant', async () => {
    await listCaller().list({ contactType: 'partner' });
    const where = (prismaMock.contact.findMany as any).mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId, contactType: 'partner' });
    expect((prismaMock.contact.count as any).mock.calls[0][0].where).toMatchObject({
      contactType: 'partner',
    });
  });

  it('vip: matches the tenant tag spellings of "vip" case-insensitively', async () => {
    (prismaMock.contactTag.findMany as any).mockResolvedValueOnce([
      { name: 'VIP' },
      { name: 'Vip' },
    ]);
    await listCaller().list({ segment: 'vip' });
    expect(prismaMock.contactTag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId, name: { equals: 'vip', mode: 'insensitive' } },
        take: 20,
      })
    );
    const where = (prismaMock.contact.findMany as any).mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId, tags: { hasSome: ['vip', 'VIP', 'Vip'] } });
  });

  it('vip: still matches the plain "vip" tag when the tenant has no tag row', async () => {
    (prismaMock.contactTag.findMany as any).mockResolvedValueOnce([]);
    await listCaller().list({ segment: 'vip' });
    const where = (prismaMock.contact.findMany as any).mock.calls[0][0].where;
    expect(where.tags).toEqual({ hasSome: ['vip'] });
  });
});
