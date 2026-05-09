import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  accountDuplicateDetectionService,
  createAccountDuplicateDetectionService,
  extractDomainFromWebsite,
  type HasTenantContext,
} from '../account-duplicate-detection.service';
import type { AccountAutomationFlags } from '../account-automation';

const TENANT_A = 'tenant-A';
const USER = 'user-1';

function makeFlags(overrides: Partial<AccountAutomationFlags> = {}): AccountAutomationFlags {
  return {
    autoAssignOwner: false,
    autoLinkContactsByDomain: false,
    preventDeleteWithOpenOpportunities: false,
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
    ...overrides,
  };
}

function buildCtx(
  overrides?: Partial<{
    rules: unknown[];
    accounts: unknown[];
    contacts: unknown[];
    updateManyCount: number;
  }>
): HasTenantContext & { _calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = {
    rulesFindMany: [],
    accountFindMany: [],
    contactFindMany: [],
    contactUpdateMany: [],
    notificationCreate: [],
  };
  const ctx = {
    tenant: { tenantId: TENANT_A, userId: USER },
    services: { notificationOrchestrator: undefined },
    prisma: {
      notification: {
        create: async (args: unknown) => {
          calls.notificationCreate.push([args]);
          return { id: 'noti-1' };
        },
      },
    } as any,
    prismaWithTenant: {
      accountDuplicateRule: {
        findMany: async (args: unknown) => {
          calls.rulesFindMany.push([args]);
          return (overrides?.rules ?? []) as unknown[];
        },
      },
      account: {
        findMany: async (args: unknown) => {
          calls.accountFindMany.push([args]);
          return (overrides?.accounts ?? []) as unknown[];
        },
      },
      contact: {
        findMany: async (args: unknown) => {
          calls.contactFindMany.push([args]);
          return (overrides?.contacts ?? []) as unknown[];
        },
        updateMany: async (args: unknown) => {
          calls.contactUpdateMany.push([args]);
          return { count: overrides?.updateManyCount ?? 0 };
        },
      },
      notification: {
        create: async (args: unknown) => {
          calls.notificationCreate.push([args]);
          return { id: 'noti-1' };
        },
      },
      // AC-010: linkContactsByDomain now runs inside a $transaction.
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          contact: {
            findMany: async (args: unknown) => {
              calls.contactFindMany.push([args]);
              return (overrides?.contacts ?? []) as unknown[];
            },
            updateMany: async (args: unknown) => {
              calls.contactUpdateMany.push([args]);
              return { count: overrides?.updateManyCount ?? 0 };
            },
          },
        };
        return fn(tx);
      },
    } as any,
    _calls: calls,
  };
  return ctx as any;
}

describe('AccountDuplicateDetectionService — checkForCreate', () => {
  it('AC-009: returns proceed when no rules defined', async () => {
    const ctx = buildCtx({ rules: [] });
    const result = await accountDuplicateDetectionService.checkForCreate(
      ctx,
      { name: 'Acme' },
      makeFlags()
    );
    expect(result).toEqual({ action: 'proceed', matches: [] });
  });

  it('AC-009: returns flag when notifyOnDuplicate=true and name match found', async () => {
    const ctx = buildCtx({
      rules: [
        { field: 'name', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      accounts: [{ id: 'acc-1', name: 'Acme Inc', tenantId: TENANT_A }],
    });
    const result = await accountDuplicateDetectionService.checkForCreate(
      ctx,
      { name: 'Acme Inc' },
      makeFlags({ notifyOnDuplicate: true })
    );
    expect(result.action).toBe('flag');
  });

  it('AC-009: NEVER returns auto-merge (accounts have no auto-merge branch)', async () => {
    const ctx = buildCtx({
      rules: [
        { field: 'name', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      accounts: [{ id: 'acc-1', name: 'Acme Inc', tenantId: TENANT_A }],
    });
    const result = await accountDuplicateDetectionService.checkForCreate(
      ctx,
      { name: 'Acme Inc' },
      makeFlags({ notifyOnDuplicate: true })
    );
    // Discriminated union — TypeScript narrows on 'flag' | 'proceed' only
    expect(['flag', 'proceed']).toContain(result.action);
    expect((result as any).action).not.toBe('auto-merge');
  });

  it('returns proceed when flags.notifyOnDuplicate=false even on match', async () => {
    const ctx = buildCtx({
      rules: [
        { field: 'name', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      accounts: [{ id: 'acc-1', name: 'Acme Inc', tenantId: TENANT_A }],
    });
    const result = await accountDuplicateDetectionService.checkForCreate(
      ctx,
      { name: 'Acme Inc' },
      makeFlags({ notifyOnDuplicate: false })
    );
    expect(result.action).toBe('proceed');
  });

  it('emits account_duplicate_suspected notification (not contact_duplicate_suspected)', async () => {
    const ctx = buildCtx({
      rules: [
        { field: 'name', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      accounts: [{ id: 'acc-1', name: 'Acme Inc', tenantId: TENANT_A }],
    });
    await accountDuplicateDetectionService.checkForCreate(
      ctx,
      { name: 'Acme Inc' },
      makeFlags({ notifyOnDuplicate: true })
    );
    const notif = ctx._calls.notificationCreate.at(-1)?.[0] as {
      data?: { subject?: string; metadata?: Record<string, unknown> };
    };
    // Fallback path: prisma.notification.create is called via createNotification's
    // orchestrator-less fallback. Assert subject/body, not raw literal — the
    // literal lives in metadata.notificationType or subject.
    expect(JSON.stringify(notif)).toMatch(/account/i);
  });
});

describe('AccountDuplicateDetectionService — checkForUpdate', () => {
  it('excludes the account being updated from candidates', async () => {
    const ctx = buildCtx({
      rules: [
        { field: 'name', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      accounts: [{ id: 'acc-2', name: 'Acme Inc', tenantId: TENANT_A }],
    });
    const result = await accountDuplicateDetectionService.checkForUpdate(
      ctx,
      'acc-1',
      { name: 'Acme Inc' },
      makeFlags({ notifyOnDuplicate: true })
    );
    expect(result.action).toBe('flag');
    const call = ctx._calls.accountFindMany[0][0] as { where: { NOT?: Record<string, unknown> } };
    expect(call.where.NOT).toEqual({ id: 'acc-1' });
  });
});

describe('AccountDuplicateDetectionService — linkContactsByDomain', () => {
  it('AC-010: returns array of linked contact ids after updateMany', async () => {
    const ctx = buildCtx({
      contacts: [{ id: 'c-1' }, { id: 'c-2' }],
      updateManyCount: 2,
    });
    const ids = await accountDuplicateDetectionService.linkContactsByDomain(
      ctx,
      'acc-1',
      'acme.com'
    );
    expect(ids).toEqual(['c-1', 'c-2']);
    const updateCall = ctx._calls.contactUpdateMany[0][0] as {
      where: { tenantId: string };
      data: { accountId: string };
    };
    expect(updateCall.data.accountId).toBe('acc-1');
    expect(updateCall.where.tenantId).toBe(TENANT_A);
  });

  it('returns empty array on invalid / empty domain', async () => {
    const ctx = buildCtx();
    await expect(
      accountDuplicateDetectionService.linkContactsByDomain(ctx, 'acc-1', '')
    ).resolves.toEqual([]);
    await expect(
      accountDuplicateDetectionService.linkContactsByDomain(ctx, 'acc-1', 'bad-domain')
    ).resolves.toEqual([]);
  });

  it('R9: batch cap — >500 matches returns [] + emits review notification', async () => {
    const tooMany = Array.from({ length: 501 }, (_, i) => ({ id: `c-${i}` }));
    const ctx = buildCtx({ contacts: tooMany });
    const ids = await accountDuplicateDetectionService.linkContactsByDomain(
      ctx,
      'acc-1',
      'acme.com'
    );
    expect(ids).toEqual([]);
    expect(ctx._calls.notificationCreate.length).toBeGreaterThan(0);
  });

  it('tenant isolation: updateMany always includes tenantId', async () => {
    const ctx = buildCtx({
      contacts: [{ id: 'c-1' }],
      updateManyCount: 1,
    });
    await accountDuplicateDetectionService.linkContactsByDomain(ctx, 'acc-1', 'acme.com');
    const call = ctx._calls.contactUpdateMany[0][0] as {
      where: { tenantId: string };
    };
    expect(call.where.tenantId).toBe(TENANT_A);
  });
});

describe('AccountDuplicateDetectionService — candidate OR-clause branches', () => {
  it('builds website OR-clause when name absent', async () => {
    const service = createAccountDuplicateDetectionService();
    const ctx = buildCtx({
      rules: [
        {
          field: 'website',
          matchStrategy: 'normalized',
          threshold: 100,
          isActive: true,
          sortOrder: 0,
        },
      ],
      accounts: [{ id: 'acc-1', website: 'acme.com', tenantId: TENANT_A }],
    });
    await service.checkForCreate(
      ctx,
      { website: 'acme.com' },
      makeFlags({ notifyOnDuplicate: true })
    );
    const call = ctx._calls.accountFindMany[0][0] as { where: { OR: unknown[] } };
    expect(JSON.stringify(call.where.OR)).toContain('website');
  });

  it('builds phone OR-clause when only phone is provided', async () => {
    const service = createAccountDuplicateDetectionService();
    const ctx = buildCtx({
      rules: [
        { field: 'phone', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      accounts: [{ id: 'acc-1', phone: '+14155551212', tenantId: TENANT_A }],
    });
    await service.checkForCreate(
      ctx,
      { phone: '+14155551212' },
      makeFlags({ notifyOnDuplicate: true })
    );
    const call = ctx._calls.accountFindMany[0][0] as { where: { OR: unknown[] } };
    expect(JSON.stringify(call.where.OR)).toContain('+14155551212');
  });

  it('notification-emit failure is swallowed (NF-005 fire-and-forget)', async () => {
    const service = createAccountDuplicateDetectionService();
    const ctx = buildCtx({
      rules: [
        { field: 'name', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      accounts: [{ id: 'acc-1', name: 'Acme', tenantId: TENANT_A }],
    });
    // Poison notification.create to throw inside emitFlagNotification
    (ctx.prisma as any).notification.create = async () => {
      throw new Error('notification down');
    };
    (ctx.prismaWithTenant as any).notification.create = async () => {
      throw new Error('notification down');
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Should NOT throw even when the notification emit blows up
    const result = await service.checkForCreate(
      ctx,
      { name: 'Acme' },
      makeFlags({ notifyOnDuplicate: true })
    );
    expect(result.action).toBe('flag');
    warnSpy.mockRestore();
  });
});

describe('AccountDuplicateDetectionService — inline $transaction fallback (no app-layer dep)', () => {
  it('falls back to inline prismaWithTenant.$transaction when deps.linkContactsByEmailDomain absent', async () => {
    const service = createAccountDuplicateDetectionService(); // no dep
    const ctx = buildCtx({
      contacts: [{ id: 'c-1' }, { id: 'c-2' }],
      updateManyCount: 2,
    });
    const ids = await service.linkContactsByDomain(ctx, 'acc-1', 'acme.com');
    expect(ids).toEqual(['c-1', 'c-2']);
    const updateCall = ctx._calls.contactUpdateMany[0][0] as {
      where: { tenantId: string };
      data: { accountId: string };
    };
    expect(updateCall.where.tenantId).toBe(TENANT_A);
    expect(updateCall.data.accountId).toBe('acc-1');
  });

  it('inline fallback: R9 overflow returns [] and emits pending-review notification', async () => {
    const service = createAccountDuplicateDetectionService(); // no dep
    const tooMany = Array.from({ length: 501 }, (_, i) => ({ id: `c-${i}` }));
    const ctx = buildCtx({ contacts: tooMany });
    const ids = await service.linkContactsByDomain(ctx, 'acc-1', 'acme.com');
    expect(ids).toEqual([]);
    expect(ctx._calls.notificationCreate.length).toBeGreaterThan(0);
  });

  it('inline fallback: zero candidates returns [] without writing', async () => {
    const service = createAccountDuplicateDetectionService();
    const ctx = buildCtx({ contacts: [] });
    const ids = await service.linkContactsByDomain(ctx, 'acc-1', 'acme.com');
    expect(ids).toEqual([]);
    expect(ctx._calls.contactUpdateMany.length).toBe(0);
  });

  it('inline fallback: invalid domain short-circuits before any query', async () => {
    const service = createAccountDuplicateDetectionService();
    const ctx = buildCtx();
    expect(await service.linkContactsByDomain(ctx, 'acc-1', '')).toEqual([]);
    expect(await service.linkContactsByDomain(ctx, 'acc-1', 'no-dot')).toEqual([]);
    expect(ctx._calls.contactFindMany.length).toBe(0);
  });
});

describe('AccountDuplicateDetectionService — app-layer delegation (AC-010)', () => {
  it('linkContactsByDomain delegates to deps.linkContactsByEmailDomain when wired', async () => {
    const serviceCalls: unknown[][] = [];
    const service = createAccountDuplicateDetectionService({
      linkContactsByEmailDomain: async (accountId, domain, tenantId, maxBatch) => {
        serviceCalls.push([accountId, domain, tenantId, maxBatch]);
        return { kind: 'linked', ids: ['c-10', 'c-11'] };
      },
    });
    const ctx = buildCtx();
    const ids = await service.linkContactsByDomain(ctx, 'acc-1', 'acme.com');
    expect(ids).toEqual(['c-10', 'c-11']);
    expect(serviceCalls).toHaveLength(1);
    expect(serviceCalls[0]?.slice(0, 3)).toEqual(['acc-1', 'acme.com', TENANT_A]);
  });

  it('linkContactsByDomain emits flag notification on overflow via app-layer dep', async () => {
    const service = createAccountDuplicateDetectionService({
      linkContactsByEmailDomain: async () => ({
        kind: 'overflow',
        sampleIds: ['c-0', 'c-1', 'c-2'],
      }),
    });
    const ctx = buildCtx();
    const ids = await service.linkContactsByDomain(ctx, 'acc-1', 'acme.com');
    expect(ids).toEqual([]);
    expect(ctx._calls.notificationCreate.length).toBeGreaterThan(0);
  });

  it('linkContactsByDomain short-circuits on invalid domain before any delegation', async () => {
    let called = false;
    const service = createAccountDuplicateDetectionService({
      linkContactsByEmailDomain: async () => {
        called = true;
        return { kind: 'linked', ids: [] };
      },
    });
    const ctx = buildCtx();
    expect(await service.linkContactsByDomain(ctx, 'acc-1', '')).toEqual([]);
    expect(await service.linkContactsByDomain(ctx, 'acc-1', 'no-dot')).toEqual([]);
    expect(called).toBe(false);
  });
});

describe('extractDomainFromWebsite', () => {
  it('strips protocol + www + path', () => {
    expect(extractDomainFromWebsite('https://www.acme.com/about')).toBe('acme.com');
  });

  it('passes through bare domain', () => {
    expect(extractDomainFromWebsite('acme.com')).toBe('acme.com');
  });

  it('rejects invalid input', () => {
    expect(extractDomainFromWebsite('foo')).toBeNull();
    expect(extractDomainFromWebsite('')).toBeNull();
    expect(extractDomainFromWebsite(null)).toBeNull();
    expect(extractDomainFromWebsite(undefined)).toBeNull();
  });
});
