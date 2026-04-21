import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  contactDuplicateDetectionService,
  createContactDuplicateDetectionService,
  type HasTenantContext,
} from '../contact-duplicate-detection.service';
import type { ContactAutomationFlags } from '../contact-automation';

const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';
const USER = 'user-1';

function makeFlags(overrides: Partial<ContactAutomationFlags> = {}): ContactAutomationFlags {
  return {
    autoMergeOnExactEmail: false,
    notifyOnDuplicate: false,
    restrictTagCreationToAdmins: false,
    normalizePhoneNumbers: false,
    autoCapitalizeNames: false,
    preventDeleteWithOpenDeals: false,
    notifyOnOwnerChange: false,
    aiDuplicateDetection: false,
    aiEnrichment: false,
    aiTagSuggestions: false,
    aiInsightGeneration: false,
    aiAutoReplyDrafting: false,
    ...overrides,
  };
}

function buildCtx(overrides?: Partial<{
  rules: unknown[];
  contacts: unknown[];
}>): HasTenantContext & {
  _calls: Record<string, unknown[][]>;
} {
  const calls: Record<string, unknown[][]> = {
    rulesFindMany: [],
    contactFindMany: [],
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
      contactDuplicateRule: {
        findMany: async (args: unknown) => {
          calls.rulesFindMany.push([args]);
          return (overrides?.rules ?? []) as unknown[];
        },
      },
      contact: {
        findMany: async (args: unknown) => {
          calls.contactFindMany.push([args]);
          return (overrides?.contacts ?? []) as unknown[];
        },
        findFirst: async () => null,
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

describe('ContactDuplicateDetectionService — checkForCreate', () => {
  it('returns proceed when rules table is empty', async () => {
    const ctx = buildCtx({ rules: [] });
    const result = await contactDuplicateDetectionService.checkForCreate(
      ctx,
      { email: 'a@b.com' },
      makeFlags(),
    );
    expect(result).toEqual({ action: 'proceed', matches: [] });
  });

  it('returns proceed when no existing candidates match', async () => {
    const ctx = buildCtx({
      rules: [
        { field: 'email', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      contacts: [],
    });
    const result = await contactDuplicateDetectionService.checkForCreate(
      ctx,
      { email: 'a@b.com' },
      makeFlags(),
    );
    expect(result).toEqual({ action: 'proceed', matches: [] });
  });

  it('returns auto-merge when autoMergeOnExactEmail=true and exact email match found', async () => {
    const ctx = buildCtx({
      rules: [
        { field: 'email', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      contacts: [{ id: 'c-1', email: 'a@b.com', tenantId: TENANT_A }],
    });
    const result = await contactDuplicateDetectionService.checkForCreate(
      ctx,
      { email: 'a@b.com' },
      makeFlags({ autoMergeOnExactEmail: true }),
    );
    expect(result.action).toBe('auto-merge');
    if (result.action === 'auto-merge') {
      expect(result.primaryId).toBe('c-1');
      expect(result.matches).toHaveLength(1);
    }
  });

  it('returns flag when notifyOnDuplicate=true + autoMergeOnExactEmail=false + match found', async () => {
    const ctx = buildCtx({
      rules: [
        { field: 'email', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      contacts: [{ id: 'c-1', email: 'a@b.com', tenantId: TENANT_A }],
    });
    const result = await contactDuplicateDetectionService.checkForCreate(
      ctx,
      { email: 'a@b.com' },
      makeFlags({ notifyOnDuplicate: true }),
    );
    expect(result.action).toBe('flag');
  });

  it('returns proceed when all flags are false even when match found', async () => {
    const ctx = buildCtx({
      rules: [
        { field: 'email', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      contacts: [{ id: 'c-1', email: 'a@b.com', tenantId: TENANT_A }],
    });
    const result = await contactDuplicateDetectionService.checkForCreate(
      ctx,
      { email: 'a@b.com' },
      makeFlags(),
    );
    expect(result.action).toBe('proceed');
    expect(result.matches).toEqual([]);
  });

  it('AC-008: AI branch degrades gracefully when embeddings are unavailable', async () => {
    const service = createContactDuplicateDetectionService({
      findSimilarContacts: async () => [],
      generateEmbedding: async () => null, // null embedding → AI branch skipped
    });
    const ctx = buildCtx({
      rules: [
        { field: 'email', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      contacts: [{ id: 'c-1', email: 'a@b.com', tenantId: TENANT_A }],
    });
    const result = await service.checkForCreate(
      ctx,
      { email: 'a@b.com' },
      makeFlags({ aiDuplicateDetection: true, notifyOnDuplicate: true }),
    );
    expect(result.action).toBe('flag');
  });

  it('AC-008: LiteLLM unavailable (throws) → catch + proceed deterministic-only', async () => {
    const service = createContactDuplicateDetectionService({
      findSimilarContacts: async () => {
        throw new Error('LiteLLM unavailable');
      },
      generateEmbedding: async () => [0.1, 0.2, 0.3],
    });
    const ctx = buildCtx({
      rules: [
        { field: 'email', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      contacts: [{ id: 'c-1', email: 'a@b.com', tenantId: TENANT_A }],
    });
    const result = await service.checkForCreate(
      ctx,
      { email: 'a@b.com' },
      makeFlags({ aiDuplicateDetection: true, notifyOnDuplicate: true }),
    );
    expect(result.action).toBe('flag');
  });

  it('aiDuplicateDetection=false → no LLM call', async () => {
    const findSimilar = vi.fn();
    const service = createContactDuplicateDetectionService({
      findSimilarContacts: findSimilar,
      generateEmbedding: async () => [0.1],
    });
    const ctx = buildCtx({
      rules: [
        { field: 'email', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      contacts: [{ id: 'c-1', email: 'a@b.com', tenantId: TENANT_A }],
    });
    await service.checkForCreate(
      ctx,
      { email: 'a@b.com' },
      makeFlags({ notifyOnDuplicate: true, aiDuplicateDetection: false }),
    );
    expect(findSimilar).not.toHaveBeenCalled();
  });
});

describe('ContactDuplicateDetectionService — checkForUpdate', () => {
  it('excludes the contact being updated from candidate set', async () => {
    const ctx = buildCtx({
      rules: [
        { field: 'email', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      contacts: [{ id: 'c-2', email: 'a@b.com', tenantId: TENANT_A }],
    });
    const result = await contactDuplicateDetectionService.checkForUpdate(
      ctx,
      'c-1',
      { email: 'a@b.com' },
      makeFlags({ notifyOnDuplicate: true }),
    );
    expect(result.action).toBe('flag');
    if (result.action === 'flag') {
      expect(result.matches.every((m) => m.candidate.id !== 'c-1')).toBe(true);
    }
    // Confirm NOT: { id: 'c-1' } clause was passed
    const lastCall = ctx._calls.contactFindMany.at(-1)?.[0] as {
      where?: Record<string, unknown>;
    };
    expect(lastCall?.where?.NOT).toEqual({ id: 'c-1' });
  });
});

describe('ContactDuplicateDetectionService — applyAutoMerge', () => {
  it('delegates to injected merger and emits post-commit notification + embed job', async () => {
    const merger = vi.fn(async () => ({
      survivingContactId: 'c-1',
      mergedContactId: 'c-2',
      fieldsUpdated: ['title'],
      mergedAt: new Date('2026-04-20T12:00:00Z'),
    }));
    const enqueueEmbed = vi.fn(async () => {});
    const service = createContactDuplicateDetectionService({
      mergeContacts: merger,
      enqueueEmbeddingJob: enqueueEmbed,
    });

    const ctx = buildCtx();
    const result = await service.applyAutoMerge(ctx, 'c-1', 'c-2', USER);

    expect(merger).toHaveBeenCalledOnce();
    expect(result.survivingContactId).toBe('c-1');
    expect(result.mergedContactId).toBe('c-2');
    expect(enqueueEmbed).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 'c-1', tenantId: TENANT_A, reason: 'merge' }),
    );
  });

  it('throws when no merger dep is provided (singleton fallback)', async () => {
    const ctx = buildCtx();
    await expect(
      contactDuplicateDetectionService.applyAutoMerge(ctx, 'c-1', 'c-2', USER),
    ).rejects.toThrow(/requires a mergeContacts dep/);
  });

  it('notification failure is swallowed — fire-and-forget (NF-005)', async () => {
    const merger = vi.fn(async () => ({
      survivingContactId: 'c-1',
      mergedContactId: 'c-2',
      fieldsUpdated: [],
      mergedAt: new Date(),
    }));
    const service = createContactDuplicateDetectionService({ mergeContacts: merger });
    const ctx = buildCtx();
    // Poison notification create
    (ctx.prisma as any).notification.create = async () => {
      throw new Error('notification down');
    };
    (ctx.prismaWithTenant as any).notification.create = async () => {
      throw new Error('notification down');
    };
    // Should not throw
    await expect(service.applyAutoMerge(ctx, 'c-1', 'c-2', USER)).resolves.toMatchObject({
      survivingContactId: 'c-1',
    });
  });
});

describe('ContactDuplicateDetectionService — tenant isolation', () => {
  it('all prisma queries filter by tenantId from ctx.tenant.tenantId', async () => {
    const ctx = buildCtx({
      rules: [
        { field: 'email', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      contacts: [{ id: 'c-1', email: 'a@b.com', tenantId: TENANT_A }],
    });
    await contactDuplicateDetectionService.checkForCreate(
      ctx,
      { email: 'a@b.com' },
      makeFlags({ notifyOnDuplicate: true }),
    );
    const ruleCall = ctx._calls.rulesFindMany[0][0] as {
      where: { tenantId: string; isActive: boolean };
    };
    expect(ruleCall.where.tenantId).toBe(TENANT_A);
    expect(ruleCall.where.tenantId).not.toBe(TENANT_B);

    const contactCall = ctx._calls.contactFindMany[0][0] as {
      where: { tenantId: string };
    };
    expect(contactCall.where.tenantId).toBe(TENANT_A);
  });
});
