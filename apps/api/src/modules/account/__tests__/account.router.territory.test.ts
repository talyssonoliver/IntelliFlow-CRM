/**
 * PG-197 — account.create owner resolution (BR-13..BR-18) and geography
 * pass-through on create/update (BR-1, BR-2).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { logAction, createNotification } = vi.hoisted(() => ({
  logAction: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({
    logAction: (...args: unknown[]) => {
      logAction(...args);
      return Promise.resolve();
    },
    logPermissionDenied: () => Promise.resolve(),
  }),
}));

vi.mock('../../notifications/notifications.router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../notifications/notifications.router')>()),
  createNotification,
}));

import { accountRouter } from '../account.router';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  generateTestUUID,
  TEST_UUIDS,
} from '../../../test/setup';

const tenantId = TEST_UUIDS.tenant;
const OTHER = generateTestUUID('territory-assignee');

function domainAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: { value: TEST_UUIDS.account1 },
    name: 'Geo Corp',
    website: undefined,
    industry: undefined,
    employees: undefined,
    revenue: undefined,
    description: undefined,
    country: 'GB',
    region: 'London',
    postalCode: 'SW1A 1AA',
    ownerId: TEST_UUIDS.user1,
    tenantId,
    createdAt: new Date(),
    updatedAt: new Date(),
    getDomainEvents: () => [],
    clearDomainEvents: () => {},
    ...overrides,
  };
}

const territoryRow = {
  id: 'terr-gb',
  priority: 1,
  isActive: true,
  isDefault: false,
  strategy: 'ROUND_ROBIN',
  createdAt: new Date('2026-01-01'),
  rules: [{ country: 'GB', region: null, postalPrefix: null }],
  members: [{ userId: OTHER, sortOrder: 0 }],
};

function setFlags(flags: Record<string, boolean>) {
  (prismaMock.accountAutomationSetting.findUnique as any).mockResolvedValue({
    autoAssignOwner: false,
    autoLinkContactsByDomain: false,
    preventDeleteWithOpenOpportunities: true,
    notifyOnOwnerChange: false,
    normalizeWebsiteDomain: false,
    autoCapitalizeAccountNames: false,
    notifyOnDuplicate: false,
    restrictTagCreationToAdmins: false,
    aiIndustryInference: false,
    aiEnrichment: false,
    aiTagSuggestions: false,
    aiInsightGeneration: false,
    aiAccountScoring: false,
    ...flags,
  });
}

describe('account.create — territory owner assignment', () => {
  let ctx: ReturnType<typeof createTestContext>;
  let caller: ReturnType<typeof accountRouter.createCaller>;
  let createAccount: ReturnType<typeof vi.fn>;

  function useCaller(context: ReturnType<typeof createTestContext>) {
    ctx = context;
    createAccount = vi.fn().mockImplementation(async (props: { ownerId: string }) => ({
      isSuccess: true,
      isFailure: false,
      value: domainAccount({ ownerId: props.ownerId }),
    }));
    ctx.services!.account!.createAccount = createAccount as any;
    ctx.services!.accountDuplicateDetection = undefined as any;
    caller = accountRouter.createCaller(ctx);
  }

  beforeEach(() => {
    logAction.mockReset();
    createNotification.mockReset().mockResolvedValue({});
    (prismaMock as any).$extends = vi.fn().mockReturnValue(prismaMock);
    (prismaMock.accountRequiredField.findMany as any).mockResolvedValue([]);
    // PG-196: create reads the tier policy. No rows ⇒ default tiers, no parent rule.
    (prismaMock.accountTierDefinition.findMany as any).mockResolvedValue([]);
    (prismaMock.accountTierConfig.findUnique as any).mockResolvedValue(null);
    (prismaMock.accountHierarchyConfig.findUnique as any).mockResolvedValue(null);
    setFlags({});
    useCaller(createTestContext());
  });

  it('flag off: owner is the caller, with zero territory or user queries (NF-002)', async () => {
    await caller.create({ name: 'Geo Corp', country: 'GB' });

    expect(createAccount.mock.calls[0][0]).toMatchObject({
      ownerId: TEST_UUIDS.user1,
      country: 'GB',
    });
    expect(prismaMock.accountTerritory.findMany).not.toHaveBeenCalled();
    expect(prismaMock.accountTerritory.update).not.toHaveBeenCalled();
    expect(prismaMock.account.groupBy).not.toHaveBeenCalled();
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    expect(logAction.mock.calls[0][4].afterState).toEqual({
      ownerId: TEST_UUIDS.user1,
      ownerSource: 'creator',
    });
  });

  it('explicit owner from a non-admin is FORBIDDEN before any user lookup', async () => {
    await expect(caller.create({ name: 'Geo Corp', ownerId: OTHER })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(createAccount).not.toHaveBeenCalled();
  });

  it('explicit owner who is not a tenant user is BAD_REQUEST', async () => {
    useCaller(createAdminContext());
    (prismaMock.user.findFirst as any).mockResolvedValueOnce(null);
    await expect(caller.create({ name: 'Geo Corp', ownerId: OTHER })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('a valid explicit owner is used and never overridden, even with the flag on', async () => {
    setFlags({ autoAssignOwner: true });
    useCaller(createAdminContext());
    (prismaMock.user.findFirst as any).mockResolvedValueOnce({ id: OTHER });

    await caller.create({ name: 'Geo Corp', ownerId: OTHER, country: 'GB' });

    expect(createAccount.mock.calls[0][0].ownerId).toBe(OTHER);
    expect(prismaMock.accountTerritory.findMany).not.toHaveBeenCalled();
    expect(logAction.mock.calls[0][4].afterState).toEqual({
      ownerId: OTHER,
      ownerSource: 'explicit',
    });
  });

  it('flag on + match: the territory owner is passed to the service and audited (NF-001)', async () => {
    setFlags({ autoAssignOwner: true });
    (prismaMock.accountTerritory.findMany as any).mockResolvedValueOnce([territoryRow]);
    (prismaMock.user.findMany as any).mockResolvedValueOnce([{ id: OTHER }]);
    (prismaMock.accountTerritory.update as any).mockResolvedValueOnce({ rrCursor: 1 });

    const result = await caller.create({ name: 'Geo Corp', country: 'gb', postalCode: 'SW1A 1AA' });

    expect(createAccount.mock.calls[0][0]).toMatchObject({ ownerId: OTHER, tenantId });
    expect(result.ownerId).toBe(OTHER);
    expect(prismaMock.accountTerritory.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.accountTerritory.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.account.groupBy).not.toHaveBeenCalled();
    expect(logAction.mock.calls[0][4].afterState).toEqual({
      ownerId: OTHER,
      ownerSource: 'territory',
      territoryId: 'terr-gb',
      strategy: 'ROUND_ROBIN',
    });
  });

  it('resolver failure: owner = caller and the create succeeds (BR-15)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setFlags({ autoAssignOwner: true });
    (prismaMock.accountTerritory.findMany as any).mockRejectedValueOnce(new Error('db down'));

    const result = await caller.create({ name: 'Geo Corp', country: 'GB' });

    expect(result.ownerId).toBe(TEST_UUIDS.user1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('notifies the assignee only when notifyOnOwnerChange is on and owner ≠ caller (BR-18)', async () => {
    setFlags({ autoAssignOwner: true, notifyOnOwnerChange: true });
    (prismaMock.accountTerritory.findMany as any).mockResolvedValueOnce([territoryRow]);
    (prismaMock.user.findMany as any).mockResolvedValueOnce([{ id: OTHER }]);
    (prismaMock.accountTerritory.update as any).mockResolvedValueOnce({ rrCursor: 1 });

    await caller.create({ name: 'Geo Corp', country: 'GB' });

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification.mock.calls[0][1]).toMatchObject({
      userId: OTHER,
      type: 'account_reassigned',
      entityId: TEST_UUIDS.account1,
    });
  });

  it('does not notify when the creator owns the account', async () => {
    setFlags({ notifyOnOwnerChange: true });
    await caller.create({ name: 'Geo Corp' });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('does not notify when the flag is off', async () => {
    setFlags({ autoAssignOwner: true });
    (prismaMock.accountTerritory.findMany as any).mockResolvedValueOnce([territoryRow]);
    (prismaMock.user.findMany as any).mockResolvedValueOnce([{ id: OTHER }]);
    (prismaMock.accountTerritory.update as any).mockResolvedValueOnce({ rrCursor: 1 });
    await caller.create({ name: 'Geo Corp', country: 'GB' });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('a notification failure never fails the create', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setFlags({ notifyOnOwnerChange: true });
    useCaller(createAdminContext());
    (prismaMock.user.findFirst as any).mockResolvedValueOnce({ id: OTHER });
    createNotification.mockRejectedValueOnce(new Error('mail down'));

    await expect(caller.create({ name: 'Geo Corp', ownerId: OTHER })).resolves.toMatchObject({
      ownerId: OTHER,
    });
    warn.mockRestore();
  });

  it('a required ownerId policy never blocks create (BR-14)', async () => {
    (prismaMock.accountRequiredField.findMany as any).mockResolvedValue([
      { fieldKey: 'ownerId', isRequired: true },
    ]);
    await expect(caller.create({ name: 'Geo Corp' })).resolves.toBeDefined();
  });

  it('returns geography in the response', async () => {
    const result = await caller.create({ name: 'Geo Corp', country: 'GB' });
    expect(result).toMatchObject({ country: 'GB', region: 'London', postalCode: 'SW1A 1AA' });
  });
});

describe('account.update — geography (BR-2)', () => {
  it('passes geography (incl. null) and never resolves a territory or changes the owner', async () => {
    const ctx = createTestContext();
    (prismaMock as any).$extends = vi.fn().mockReturnValue(prismaMock);
    (prismaMock.accountRequiredField.findMany as any).mockResolvedValue([]);
    setFlags({ autoAssignOwner: true });
    const updateAccountInfo = vi.fn().mockResolvedValue({
      isSuccess: true,
      isFailure: false,
      value: domainAccount({ country: null, region: 'Leeds' }),
    });
    ctx.services!.account!.updateAccountInfo = updateAccountInfo as any;
    ctx.services!.accountDuplicateDetection = undefined as any;
    const caller = accountRouter.createCaller(ctx);

    const result = await caller.update({ id: TEST_UUIDS.account1, country: null, region: 'Leeds' });

    const updates = updateAccountInfo.mock.calls[0][1];
    expect(updates).toMatchObject({ country: null, region: 'Leeds' });
    expect(updates).not.toHaveProperty('ownerId');
    expect(prismaMock.accountTerritory.findMany).not.toHaveBeenCalled();
    expect(prismaMock.accountTerritory.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ country: null, region: 'Leeds' });
  });
});
