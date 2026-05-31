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

function buildCtx(
  overrides?: Partial<{
    rules: unknown[];
    contacts: unknown[];
  }>
): HasTenantContext & {
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
      makeFlags()
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
      makeFlags()
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
      makeFlags({ autoMergeOnExactEmail: true })
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
      makeFlags({ notifyOnDuplicate: true })
    );
    expect(result.action).toBe('flag');
  });

  it('AC-004: flag branch emits contact_duplicate_suspected notification', async () => {
    const ctx = buildCtx({
      rules: [
        { field: 'email', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      contacts: [{ id: 'c-1', email: 'a@b.com', tenantId: TENANT_A }],
    });
    await contactDuplicateDetectionService.checkForCreate(
      ctx,
      { email: 'a@b.com' },
      makeFlags({ notifyOnDuplicate: true })
    );
    expect(ctx._calls.notificationCreate.length).toBeGreaterThanOrEqual(1);
    const call = ctx._calls.notificationCreate.at(0)?.[0] as {
      data?: { subject?: string; metadata?: Record<string, unknown> };
    };
    // createNotification fallback path writes via prisma.notification.create with
    // shape that includes the type in metadata (see notifications.router.ts:827).
    expect(JSON.stringify(call)).toContain('contact');
  });

  it('AC-004: proceed branch does NOT emit notification (no flags set)', async () => {
    const ctx = buildCtx({
      rules: [
        { field: 'email', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      contacts: [{ id: 'c-1', email: 'a@b.com', tenantId: TENANT_A }],
    });
    await contactDuplicateDetectionService.checkForCreate(ctx, { email: 'a@b.com' }, makeFlags());
    expect(ctx._calls.notificationCreate.length).toBe(0);
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
      makeFlags()
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
      makeFlags({ aiDuplicateDetection: true, notifyOnDuplicate: true })
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
      makeFlags({ aiDuplicateDetection: true, notifyOnDuplicate: true })
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
      makeFlags({ notifyOnDuplicate: true, aiDuplicateDetection: false })
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
      makeFlags({ notifyOnDuplicate: true })
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
      expect.objectContaining({ contactId: 'c-1', tenantId: TENANT_A, reason: 'merge' })
    );
  });

  it('throws when no merger dep is provided (singleton fallback)', async () => {
    const ctx = buildCtx();
    await expect(
      contactDuplicateDetectionService.applyAutoMerge(ctx, 'c-1', 'c-2', USER)
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

describe('ContactDuplicateDetectionService — candidate fetch branches', () => {
  it('narrows by phone OR-clause when email absent', async () => {
    const ctx = buildCtx({
      rules: [
        { field: 'phone', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      contacts: [{ id: 'c-1', phone: '+14155551212', tenantId: TENANT_A }],
    });
    const result = await contactDuplicateDetectionService.checkForCreate(
      ctx,
      { phone: '+14155551212' },
      makeFlags({ notifyOnDuplicate: true })
    );
    expect(result.action).toBe('flag');
    const call = ctx._calls.contactFindMany[0][0] as { where: { OR: unknown[] } };
    expect(JSON.stringify(call.where.OR)).toContain('+14155551212');
  });

  it('narrows by firstName+lastName AND-clause when both provided', async () => {
    const ctx = buildCtx({
      rules: [
        { field: 'name', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      contacts: [{ id: 'c-1', firstName: 'Ada', lastName: 'Lovelace', tenantId: TENANT_A }],
    });
    await contactDuplicateDetectionService.checkForCreate(
      ctx,
      { firstName: 'Ada', lastName: 'Lovelace' },
      makeFlags({ notifyOnDuplicate: true })
    );
    const call = ctx._calls.contactFindMany[0][0] as { where: { OR: unknown[] } };
    expect(JSON.stringify(call.where.OR)).toContain('Lovelace');
  });

  it('returns proceed when orClauses would be empty (no identifying fields)', async () => {
    const ctx = buildCtx({
      rules: [
        { field: 'email', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      contacts: [{ id: 'c-1', email: 'a@b.com', tenantId: TENANT_A }],
    });
    const result = await contactDuplicateDetectionService.checkForCreate(
      ctx,
      { company: 'X' },
      makeFlags({ notifyOnDuplicate: true })
    );
    expect(result.action).toBe('proceed');
  });
});

describe('ContactDuplicateDetectionService — AI branch unions', () => {
  it('unions AI matches with deterministic, deduping by id — NP-045 batched', async () => {
    const service = createContactDuplicateDetectionService({
      findSimilarContacts: async () => [
        { id: 'c-1', similarity: 0.9 },
        { id: 'c-2', similarity: 0.8 },
      ],
      generateEmbedding: async () => [0.1, 0.2, 0.3],
    });
    const ctx = buildCtx({
      rules: [
        { field: 'email', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      contacts: [{ id: 'c-1', email: 'a@b.com', tenantId: TENANT_A }],
    });
    // AI branch now uses findMany (batched) — mock returns rows for AI candidates (c-2 only,
    // since c-1 is already in the seen set from deterministic matches)
    const aiRows = [{ id: 'c-2', email: 'similar@b.com', tenantId: TENANT_A }];
    let findManyCallCount = 0;
    (ctx.prismaWithTenant as any).contact.findMany = async (args: any) => {
      findManyCallCount++;
      // First call: deterministic fetchCandidates (uses OR clause)
      // Second call (AI): uses { id: { in: [...] } } filter
      if (args?.where?.id?.in) {
        // AI batch lookup
        return aiRows.filter((r) => args.where.id.in.includes(r.id));
      }
      // Deterministic path
      return [{ id: 'c-1', email: 'a@b.com', tenantId: TENANT_A }];
    };

    const result = await service.checkForCreate(
      ctx,
      { email: 'a@b.com' },
      makeFlags({ aiDuplicateDetection: true, notifyOnDuplicate: true })
    );
    expect(result.action).toBe('flag');
    if (result.action === 'flag') {
      const ids = result.matches.map((m) => m.candidate.id);
      expect(ids).toContain('c-1');
      // c-2 comes from AI path only
      expect(ids).toContain('c-2');
      // no duplicates (c-1 present once)
      expect(ids.filter((id) => id === 'c-1')).toHaveLength(1);
    }
    // Assert that the AI branch used findMany (batched) — exactly 2 findMany calls total
    // (1 for deterministic candidates, 1 for AI batch lookup)
    expect(findManyCallCount).toBe(2);
  });

  it('AI branch tolerates missing candidate rows (findMany returns empty) — NP-045', async () => {
    const service = createContactDuplicateDetectionService({
      findSimilarContacts: async () => [{ id: 'c-missing', similarity: 0.9 }],
      generateEmbedding: async () => [0.1],
    });
    const ctx = buildCtx({
      rules: [
        { field: 'email', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
      ],
      contacts: [{ id: 'c-1', email: 'a@b.com', tenantId: TENANT_A }],
    });
    // AI batch lookup returns empty (c-missing not found)
    (ctx.prismaWithTenant as any).contact.findMany = async (args: any) => {
      if (args?.where?.id?.in) {
        return []; // c-missing not found
      }
      return [{ id: 'c-1', email: 'a@b.com', tenantId: TENANT_A }];
    };

    const result = await service.checkForCreate(
      ctx,
      { email: 'a@b.com' },
      makeFlags({ aiDuplicateDetection: true, notifyOnDuplicate: true })
    );
    expect(result.action).toBe('flag');
    if (result.action === 'flag') {
      expect(result.matches.map((m) => m.candidate.id)).toEqual(['c-1']);
    }
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
      makeFlags({ notifyOnDuplicate: true })
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
