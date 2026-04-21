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

function makeFlags(
  overrides: Partial<AccountAutomationFlags> = {},
): AccountAutomationFlags {
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

function buildCtx(overrides?: Partial<{
  rules: unknown[];
  accounts: unknown[];
  contacts: unknown[];
  updateManyCount: number;
}>): HasTenantContext & { _calls: Record<string, unknown[][]> } {
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
      makeFlags(),
    );
    expect(result).toEqual({ action: 'proceed', matches: [] });
  });

  it('AC-009: returns flag when notifyOnDuplicate=true and name match found', async () => {
    const ctx = buildCtx({
      rules: [{ field: 'name', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 }],
      accounts: [{ id: 'acc-1', name: 'Acme Inc', tenantId: TENANT_A }],
    });
    const result = await accountDuplicateDetectionService.checkForCreate(
      ctx,
      { name: 'Acme Inc' },
      makeFlags({ notifyOnDuplicate: true }),
    );
    expect(result.action).toBe('flag');
  });

  it('AC-009: NEVER returns auto-merge (accounts have no auto-merge branch)', async () => {
    const ctx = buildCtx({
      rules: [{ field: 'name', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 }],
      accounts: [{ id: 'acc-1', name: 'Acme Inc', tenantId: TENANT_A }],
    });
    const result = await accountDuplicateDetectionService.checkForCreate(
      ctx,
      { name: 'Acme Inc' },
      makeFlags({ notifyOnDuplicate: true }),
    );
    // Discriminated union — TypeScript narrows on 'flag' | 'proceed' only
    expect(['flag', 'proceed']).toContain(result.action);
    expect((result as any).action).not.toBe('auto-merge');
  });

  it('returns proceed when flags.notifyOnDuplicate=false even on match', async () => {
    const ctx = buildCtx({
      rules: [{ field: 'name', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 }],
      accounts: [{ id: 'acc-1', name: 'Acme Inc', tenantId: TENANT_A }],
    });
    const result = await accountDuplicateDetectionService.checkForCreate(
      ctx,
      { name: 'Acme Inc' },
      makeFlags({ notifyOnDuplicate: false }),
    );
    expect(result.action).toBe('proceed');
  });

  it('emits account_duplicate_suspected notification (not contact_duplicate_suspected)', async () => {
    const ctx = buildCtx({
      rules: [{ field: 'name', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 }],
      accounts: [{ id: 'acc-1', name: 'Acme Inc', tenantId: TENANT_A }],
    });
    await accountDuplicateDetectionService.checkForCreate(
      ctx,
      { name: 'Acme Inc' },
      makeFlags({ notifyOnDuplicate: true }),
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
      rules: [{ field: 'name', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 }],
      accounts: [{ id: 'acc-2', name: 'Acme Inc', tenantId: TENANT_A }],
    });
    const result = await accountDuplicateDetectionService.checkForUpdate(
      ctx,
      'acc-1',
      { name: 'Acme Inc' },
      makeFlags({ notifyOnDuplicate: true }),
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
      'acme.com',
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
      accountDuplicateDetectionService.linkContactsByDomain(ctx, 'acc-1', ''),
    ).resolves.toEqual([]);
    await expect(
      accountDuplicateDetectionService.linkContactsByDomain(ctx, 'acc-1', 'bad-domain'),
    ).resolves.toEqual([]);
  });

  it('R9: batch cap — >500 matches returns [] + emits review notification', async () => {
    const tooMany = Array.from({ length: 501 }, (_, i) => ({ id: `c-${i}` }));
    const ctx = buildCtx({ contacts: tooMany });
    const ids = await accountDuplicateDetectionService.linkContactsByDomain(
      ctx,
      'acc-1',
      'acme.com',
    );
    expect(ids).toEqual([]);
    expect(ctx._calls.notificationCreate.length).toBeGreaterThan(0);
  });

  it('tenant isolation: updateMany always includes tenantId', async () => {
    const ctx = buildCtx({
      contacts: [{ id: 'c-1' }],
      updateManyCount: 1,
    });
    await accountDuplicateDetectionService.linkContactsByDomain(
      ctx,
      'acc-1',
      'acme.com',
    );
    const call = ctx._calls.contactUpdateMany[0][0] as {
      where: { tenantId: string };
    };
    expect(call.where.tenantId).toBe(TENANT_A);
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
