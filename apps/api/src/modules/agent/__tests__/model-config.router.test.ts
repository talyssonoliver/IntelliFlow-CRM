/**
 * Model Config Router Tests - PG-199 (Module Settings: Model Config, ADR-082)
 *
 * Callback-form $transaction mocked with mockImplementationOnce(fn => fn(txMock))
 * (playbook §12). Mutations are admin-only, tenant-scoped by explicit tenantId,
 * serialised by a per-tenant advisory lock and Never-Downgrade checked server-side.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  LLM_PURPOSES,
  MODEL_CATALOG,
  MODEL_CONFIG_LIMITS,
  type LLMPurpose,
} from '@intelliflow/domain';
import type { PurposeConfigInput } from '@intelliflow/validators';

const logAction = vi.hoisted(() => vi.fn());
vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction }),
}));

import { modelConfigRouter } from '../model-config.router';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  createManagerContext,
  createPublicContext,
  TEST_UUIDS,
} from '../../../test/setup';

const tenantId = TEST_UUIDS.tenant;
const NOW = new Date('2026-10-19T12:00:00.000Z');
const SAVED = new Date('2026-10-18T09:00:00.000Z');

function configRow(purpose: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `cfg-${purpose}`,
    purpose,
    tier: null,
    modelId: null,
    fallbackModelIds: [],
    temperature: null,
    maxTokens: null,
    monthlyCostCeilingCents: null,
    rateLimitPerMinute: null,
    updatedAt: SAVED,
    ...overrides,
  };
}

function edit(
  purpose: LLMPurpose,
  overrides: Partial<PurposeConfigInput> = {}
): PurposeConfigInput {
  return {
    purpose,
    modelId: null,
    fallbackModelIds: [],
    temperature: null,
    maxTokens: null,
    monthlyCostCeilingCents: null,
    ...overrides,
  };
}

function txMock(existing: ReturnType<typeof configRow>[] = []) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
    tenantAIConfig: {
      findMany: vi.fn().mockResolvedValue(existing),
      upsert: vi.fn().mockImplementation(async ({ create, update }: any) => ({
        ...configRow(create.purpose),
        ...create,
        ...update,
        updatedAt: NOW,
      })),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function useTx(existing: ReturnType<typeof configRow>[] = []) {
  const tx = txMock(existing);
  (prismaMock.$transaction as any).mockImplementationOnce(async (fn: any) => fn(tx));
  return tx;
}

function failTx(error: unknown) {
  (prismaMock.$transaction as any).mockImplementationOnce(async () => {
    throw error;
  });
}

async function expectCode(promise: Promise<unknown>, code: TRPCError['code']) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('modelConfigRouter (PG-199)', () => {
  let admin: ReturnType<typeof modelConfigRouter.createCaller>;
  let user: ReturnType<typeof modelConfigRouter.createCaller>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    logAction.mockReset().mockResolvedValue('audit-1');
    admin = modelConfigRouter.createCaller(createAdminContext());
    user = modelConfigRouter.createCaller(createTestContext());
    (prismaMock.tenantAIConfig.findMany as any).mockResolvedValue([]);
    (prismaMock.tenantUsageCounter.findMany as any).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects an unauthenticated caller', async () => {
    const anon = modelConfigRouter.createCaller(createPublicContext());
    await expect(anon.get()).rejects.toBeInstanceOf(TRPCError);
  });

  // ─── get ──────────────────────────────────────────────────────────────────
  describe('get', () => {
    it('returns all six purposes with defaults when the tenant has no rows', async () => {
      const result = await user.get();
      expect(result.purposes.map((p) => p.purpose)).toEqual([...LLM_PURPOSES]);
      expect(result.purposes[0]).toMatchObject({
        purpose: 'scoring',
        modelId: null,
        fallbackModelIds: [],
        temperature: null,
        maxTokens: null,
        monthlyCostCeilingCents: null,
        updatedAt: null,
        defaultModelIds: ['llama-3.1-8b-instant', 'mistral-small'],
        spentCents: 0,
        blocked: false,
        retired: false,
        locked: false,
      });
      expect(result.purposes.find((p) => p.purpose === 'rag')?.locked).toBe(true);
      expect(result.limits).toEqual(MODEL_CONFIG_LIMITS);
      expect(result.period).toBe('2026-10');
      expect(result.catalog).toHaveLength(MODEL_CATALOG.length);
      expect(result.catalog.find((m) => m.id === 'mistral-small')).toMatchObject({
        price: 800,
        onOpenRouter: false,
      });
      expect(result.canManage).toBe(false);
    });

    // PG-199 (owner Q10): the locked rag card shows the model the worker reports running.
    it('carries the embedding model the worker publishes on the rag row only', async () => {
      const ctx = createTestContext() as any;
      ctx.services = {
        ...ctx.services,
        activeEmbeddingModel: vi
          .fn()
          .mockResolvedValue({ id: 'gemini-embedding-001', dimensions: 1536 }),
      };
      const result = await modelConfigRouter.createCaller(ctx).get();
      const rag = result.purposes.find((p) => p.purpose === 'rag');
      expect(rag?.activeModel).toEqual({ id: 'gemini-embedding-001', dimensions: 1536 });
      expect(result.purposes.filter((p) => p.activeModel !== null).map((p) => p.purpose)).toEqual([
        'rag',
      ]);
    });

    it('reports no active embedding model when the worker has not published one', async () => {
      const ctx = createTestContext() as any;
      ctx.services = { ...ctx.services, activeEmbeddingModel: vi.fn().mockResolvedValue(null) };
      const result = await modelConfigRouter.createCaller(ctx).get();
      expect(result.purposes.find((p) => p.purpose === 'rag')?.activeModel).toBeNull();
    });

    it('reports canManage for admins and managers', async () => {
      await expect(admin.get()).resolves.toMatchObject({ canManage: true });
      const manager = modelConfigRouter.createCaller(createManagerContext());
      await expect(manager.get()).resolves.toMatchObject({ canManage: true });
    });

    it('scopes every read by the caller tenant (cross-tenant negative)', async () => {
      await user.get();
      expect(prismaMock.tenantAIConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } })
      );
      expect(prismaMock.tenantUsageCounter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            period: '2026-10',
            key: { in: LLM_PURPOSES.map((p) => `aiSpendCentiCents:${p}`) },
          }),
        })
      );
    });

    it('maps stored rows, spend (centicents → cents) and the blocked flag', async () => {
      (prismaMock.tenantAIConfig.findMany as any).mockResolvedValue([
        configRow('email', { monthlyCostCeilingCents: 500, modelId: 'claude-haiku-4-5' }),
      ]);
      (prismaMock.tenantUsageCounter.findMany as any).mockResolvedValue([
        { key: 'aiSpendCentiCents:email', value: 50_000 },
      ]);
      const email = (await user.get()).purposes.find((p) => p.purpose === 'email');
      expect(email).toMatchObject({
        modelId: 'claude-haiku-4-5',
        monthlyCostCeilingCents: 500,
        spentCents: 500,
        blocked: true,
        updatedAt: SAVED.toISOString(),
      });
    });

    it('flags a pin that is no longer in the catalog as retired', async () => {
      (prismaMock.tenantAIConfig.findMany as any).mockResolvedValue([
        configRow('reasoning', { modelId: 'gpt-4-turbo-preview' }),
      ]);
      const reasoning = (await user.get()).purposes.find((p) => p.purpose === 'reasoning');
      expect(reasoning?.retired).toBe(true);
    });

    it('degrades spend to null (never blocked) when the spend read fails', async () => {
      (prismaMock.tenantUsageCounter.findMany as any).mockRejectedValue(new Error('db down'));
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await user.get();
      expect(result.purposes.every((p) => p.spentCents === null && p.blocked === false)).toBe(true);
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });

  // ─── authorisation ─────────────────────────────────────────────────────────
  describe('admin gate', () => {
    it.each([
      [
        'update',
        () => user.update({ purposes: [edit('scoring', { temperature: 0.2 })], expected: {} }),
      ],
      ['resetToDefaults', () => user.resetToDefaults({ expected: {} })],
    ])('%s is FORBIDDEN for a plain user and never opens a transaction', async (_name, call) => {
      await expectCode(call(), 'FORBIDDEN');
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────
  describe('update', () => {
    // Codex round 15: an unpinned row runs its stored tier's default, not the caller defaults.
    describe('fallbacks versus the effective primary (stored tier override)', () => {
      const premium = () => configRow('qualification', { tier: 'premium', updatedAt: SAVED });
      const expected = { qualification: SAVED.toISOString() };

      it('accepts a caller default as a fallback when the stored tier runs another model', async () => {
        const tx = useTx([premium()]);
        await admin.update({
          purposes: [edit('qualification', { fallbackModelIds: ['llama-3.3-70b-versatile'] })],
          expected,
          acknowledgeDowngrade: true,
        });
        expect(tx.tenantAIConfig.upsert).toHaveBeenCalledTimes(1);
      });

      it('rejects the stored tier default as a fallback (it is the primary)', async () => {
        const tx = useTx([premium()]);
        await expectCode(
          admin.update({
            purposes: [edit('qualification', { fallbackModelIds: ['gpt-4o'] })],
            expected,
            acknowledgeDowngrade: true,
          }),
          'BAD_REQUEST'
        );
        expect(tx.tenantAIConfig.upsert).not.toHaveBeenCalled();
      });

      it('still rejects a caller default as a fallback with no stored tier', async () => {
        const tx = useTx();
        await expectCode(
          admin.update({
            purposes: [edit('reasoning', { fallbackModelIds: ['claude-sonnet-4-5'] })],
            expected: { reasoning: null },
            acknowledgeDowngrade: true,
          }),
          'BAD_REQUEST'
        );
        expect(tx.tenantAIConfig.upsert).not.toHaveBeenCalled();
      });

      it('reports the stored tier default as the default model on get', async () => {
        (prismaMock.tenantAIConfig.findMany as any).mockResolvedValue([premium()]);
        const result = await user.get();
        expect(result.purposes.find((p) => p.purpose === 'qualification')?.defaultModelIds).toEqual(
          ['gpt-4o']
        );
      });
    });

    it('takes the tenant advisory lock before reading', async () => {
      const tx = useTx();
      await admin.update({
        purposes: [edit('scoring', { temperature: 0.2 })],
        expected: { scoring: null },
      });
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      const lockSql = (tx.$executeRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
      expect(lockSql).toMatch(/pg_advisory_xact_lock/);
      expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.tenantAIConfig.findMany.mock.invocationCallOrder[0]
      );
    });

    it('creates a row with a NULL tier and only the edited fields, scoped by tenant', async () => {
      const tx = useTx();
      await admin.update({
        purposes: [edit('scoring', { temperature: 0.2, monthlyCostCeilingCents: 1000 })],
        expected: { scoring: null },
      });
      expect(tx.tenantAIConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId, purpose: { in: ['scoring'] } } })
      );
      expect(tx.tenantAIConfig.upsert).toHaveBeenCalledWith({
        where: { tenantId_purpose: { tenantId, purpose: 'scoring' } },
        create: {
          tenantId,
          purpose: 'scoring',
          tier: null,
          modelId: null,
          fallbackModelIds: [],
          temperature: 0.2,
          maxTokens: null,
          monthlyCostCeilingCents: 1000,
        },
        update: {
          modelId: null,
          fallbackModelIds: [],
          temperature: 0.2,
          maxTokens: null,
          monthlyCostCeilingCents: 1000,
        },
      });
    });

    it('skips purposes whose values did not change (no write, no audit)', async () => {
      const tx = useTx([configRow('email', { temperature: 0.5, updatedAt: SAVED })]);
      const result = await admin.update({
        purposes: [edit('email', { temperature: 0.5 })],
        expected: { email: SAVED.toISOString() },
      });
      expect(tx.tenantAIConfig.upsert).not.toHaveBeenCalled();
      expect(logAction).not.toHaveBeenCalled();
      expect(result.updated).toEqual([]);
    });

    it('returns CONFLICT with zero writes when the row changed since it was read', async () => {
      const tx = useTx([configRow('email', { updatedAt: new Date('2026-10-19T11:00:00Z') })]);
      await expectCode(
        admin.update({
          purposes: [edit('email', { temperature: 0.4 })],
          expected: { email: SAVED.toISOString() },
        }),
        'CONFLICT'
      );
      expect(tx.tenantAIConfig.upsert).not.toHaveBeenCalled();
    });

    it('returns CONFLICT when a row appeared that the client did not see (null expected)', async () => {
      const tx = useTx([configRow('email')]);
      await expectCode(
        admin.update({
          purposes: [edit('email', { temperature: 0.4 })],
          expected: { email: null },
        }),
        'CONFLICT'
      );
      expect(tx.tenantAIConfig.upsert).not.toHaveBeenCalled();
    });

    it('returns CONFLICT when a row the client saw was reset away', async () => {
      useTx([]);
      await expectCode(
        admin.update({
          purposes: [edit('email', { temperature: 0.4 })],
          expected: { email: SAVED.toISOString() },
        }),
        'CONFLICT'
      );
    });

    it('refuses an unconfirmed downgrade with PRECONDITION_FAILED and writes nothing', async () => {
      const tx = useTx([configRow('reasoning', { modelId: 'claude-sonnet-4-5' })]);
      await expect(
        admin.update({
          purposes: [edit('reasoning', { modelId: 'claude-haiku-4-5' })],
          expected: { reasoning: SAVED.toISOString() },
        })
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: expect.stringMatching(
          /^DOWNGRADE_UNCONFIRMED: reasoning primary claude-sonnet-4-5 → claude-haiku-4-5/
        ),
      });
      expect(tx.tenantAIConfig.upsert).not.toHaveBeenCalled();
    });

    it('treats a cheaper new fallback as a downgrade too (Q4)', async () => {
      useTx([configRow('reasoning', { modelId: 'claude-sonnet-4-5' })]);
      await expectCode(
        admin.update({
          purposes: [
            edit('reasoning', {
              modelId: 'claude-sonnet-4-5',
              fallbackModelIds: ['gpt-oss-20b-free'],
            }),
          ],
          expected: { reasoning: SAVED.toISOString() },
        }),
        'PRECONDITION_FAILED'
      );
    });

    it('writes an acknowledged downgrade and audits the actor, models and prices', async () => {
      const tx = useTx([configRow('reasoning', { modelId: 'claude-sonnet-4-5' })]);
      await admin.update({
        purposes: [edit('reasoning', { modelId: 'claude-haiku-4-5' })],
        expected: { reasoning: SAVED.toISOString() },
        acknowledgeDowngrade: true,
      });
      expect(tx.tenantAIConfig.upsert).toHaveBeenCalledTimes(1);
      expect(logAction).toHaveBeenCalledWith(
        'UPDATE',
        'model_config',
        'cfg-reasoning',
        tenantId,
        expect.objectContaining({
          actorId: TEST_UUIDS.admin1,
          eventType: 'ModelConfigDowngraded',
          beforeState: expect.objectContaining({
            purpose: 'reasoning',
            modelId: 'claude-sonnet-4-5',
          }),
          afterState: expect.objectContaining({
            purpose: 'reasoning',
            modelId: 'claude-haiku-4-5',
          }),
          metadata: expect.objectContaining({
            downgrade: true,
            lateral: false,
            downgrades: [
              expect.objectContaining({
                slot: 'primary',
                from: 'claude-sonnet-4-5',
                to: 'claude-haiku-4-5',
                fromPrice: 18000,
                toPrice: 4800,
              }),
            ],
          }),
        })
      );
    });

    it('audits a non-model change as a plain update (neither downgrade nor lateral)', async () => {
      useTx([configRow('reasoning', { modelId: 'gpt-oss-20b-free' })]);
      await admin.update({
        purposes: [edit('reasoning', { modelId: 'gpt-oss-20b-free', temperature: 0.1 })],
        expected: { reasoning: SAVED.toISOString() },
      });
      expect(logAction).toHaveBeenCalledWith(
        'UPDATE',
        'model_config',
        expect.any(String),
        tenantId,
        expect.objectContaining({
          eventType: 'ModelConfigUpdated',
          metadata: expect.objectContaining({ downgrade: false, lateral: false }),
        })
      );
    });

    it('records an equal-price primary change as lateral, without asking for a confirm', async () => {
      // Unpinned scoring is priced at its dearest caller default, mistral-small (800);
      // pinning mistral-small is neither cheaper nor dearer.
      const tx = useTx([configRow('scoring')]);
      await admin.update({
        purposes: [edit('scoring', { modelId: 'mistral-small' })],
        expected: { scoring: SAVED.toISOString() },
      });
      expect(tx.tenantAIConfig.upsert).toHaveBeenCalledTimes(1);
      expect(logAction.mock.calls[0][4]).toMatchObject({
        eventType: 'ModelConfigUpdated',
        metadata: { downgrade: false, lateral: true },
      });
    });

    it('does not mark an upgrade as lateral', async () => {
      useTx([configRow('structured', { modelId: 'gemini-2.5-flash' })]);
      await admin.update({
        purposes: [edit('structured', { modelId: 'mistral-small' })],
        expected: { structured: SAVED.toISOString() },
      });
      expect(logAction.mock.calls[0][4].metadata).toMatchObject({
        downgrade: false,
        lateral: false,
      });
    });

    it('rejects a rag change other than its ceiling (BAD_REQUEST, no transaction)', async () => {
      await expectCode(
        admin.update({
          purposes: [edit('rag', { modelId: 'text-embedding-3-small' })],
          expected: {},
        }),
        'BAD_REQUEST'
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a model outside the catalog (retired id) with BAD_REQUEST', async () => {
      await expectCode(
        admin.update({
          purposes: [edit('reasoning', { modelId: 'gpt-4-turbo-preview' })],
          expected: {},
        }),
        'BAD_REQUEST'
      );
    });

    it('maps a unique-constraint race (P2002) to CONFLICT', async () => {
      failTx(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
      await expectCode(
        admin.update({
          purposes: [edit('scoring', { temperature: 0.2 })],
          expected: { scoring: null },
        }),
        'CONFLICT'
      );
    });

    it('rolls back every purpose when one write fails inside the transaction', async () => {
      failTx(new Error('write failed'));
      await expect(
        admin.update({
          purposes: [edit('scoring', { temperature: 0.2 }), edit('email', { temperature: 0.3 })],
          expected: { scoring: null, email: null },
        })
      ).rejects.toThrow('write failed');
      expect(logAction).not.toHaveBeenCalled();
    });

    it('does not fail the save when the audit log write fails', async () => {
      useTx();
      logAction.mockRejectedValueOnce(new Error('audit down'));
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(
        admin.update({
          purposes: [edit('scoring', { temperature: 0.2 })],
          expected: { scoring: null },
        })
      ).resolves.toMatchObject({ updated: ['scoring'] });
      await Promise.resolve();
      errSpy.mockRestore();
    });
  });

  // ─── resetToDefaults ───────────────────────────────────────────────────────
  describe('resetToDefaults', () => {
    it('is a no-op without rows (no writes, no audit)', async () => {
      const tx = useTx([]);
      await expect(admin.resetToDefaults({ expected: {} })).resolves.toEqual({ reset: 0 });
      expect(tx.tenantAIConfig.deleteMany).not.toHaveBeenCalled();
      expect(logAction).not.toHaveBeenCalled();
    });

    it('deletes rows without a rate limit and clears PG-199 fields on rows that keep one', async () => {
      const tx = useTx([
        configRow('scoring', { temperature: 0.2 }),
        configRow('email', { rateLimitPerMinute: 30, monthlyCostCeilingCents: 100 }),
      ]);
      await expect(
        admin.resetToDefaults({
          expected: { scoring: SAVED.toISOString(), email: SAVED.toISOString() },
        })
      ).resolves.toEqual({ reset: 2 });
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(tx.tenantAIConfig.deleteMany).toHaveBeenCalledWith({
        where: { tenantId, rateLimitPerMinute: null },
      });
      expect(tx.tenantAIConfig.updateMany).toHaveBeenCalledWith({
        where: { tenantId, rateLimitPerMinute: { not: null } },
        data: {
          tier: null,
          modelId: null,
          fallbackModelIds: [],
          temperature: null,
          maxTokens: null,
          monthlyCostCeilingCents: null,
        },
      });
      expect(logAction).toHaveBeenCalledWith(
        'UPDATE',
        'model_config',
        tenantId,
        tenantId,
        expect.objectContaining({ actorId: TEST_UUIDS.admin1, eventType: 'ModelConfigReset' })
      );
    });

    it('returns CONFLICT when a row changed since the page loaded', async () => {
      const tx = useTx([configRow('scoring', { updatedAt: new Date('2026-10-19T11:59:00Z') })]);
      await expectCode(
        admin.resetToDefaults({ expected: { scoring: SAVED.toISOString() } }),
        'CONFLICT'
      );
      expect(tx.tenantAIConfig.deleteMany).not.toHaveBeenCalled();
    });

    it('needs an acknowledgement when the reset lowers a pinned model', async () => {
      const tx = useTx([configRow('qualification', { modelId: 'gpt-4o' })]);
      await expectCode(
        admin.resetToDefaults({ expected: { qualification: SAVED.toISOString() } }),
        'PRECONDITION_FAILED'
      );
      expect(tx.tenantAIConfig.deleteMany).not.toHaveBeenCalled();

      const tx2 = useTx([configRow('qualification', { modelId: 'gpt-4o' })]);
      await admin.resetToDefaults({
        expected: { qualification: SAVED.toISOString() },
        acknowledgeDowngrade: true,
      });
      expect(tx2.tenantAIConfig.deleteMany).toHaveBeenCalled();
    });

    it('counts an existing tier override: resetting a premium tier is a downgrade', async () => {
      const tx = useTx([configRow('qualification', { tier: 'premium' })]);
      await expect(
        admin.resetToDefaults({ expected: { qualification: SAVED.toISOString() } })
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: expect.stringMatching(
          /^DOWNGRADE_UNCONFIRMED: qualification primary gpt-4o → default/
        ),
      });
      expect(tx.tenantAIConfig.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('existing tier overrides on update', () => {
    it('does not report a downgrade when an unpinned row keeps its tier', async () => {
      const tx = useTx([configRow('qualification', { tier: 'premium' })]);
      await admin.update({
        purposes: [edit('qualification', { temperature: 0.3 })],
        expected: { qualification: SAVED.toISOString() },
      });
      expect(tx.tenantAIConfig.upsert).toHaveBeenCalledTimes(1);
    });

    it('compares a new pin with the tier default the tenant runs on today', async () => {
      useTx([configRow('qualification', { tier: 'premium' })]);
      await expect(
        admin.update({
          purposes: [edit('qualification', { modelId: 'mistral-medium' })],
          expected: { qualification: SAVED.toISOString() },
        })
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: expect.stringMatching(/qualification primary gpt-4o → mistral-medium/),
      });
    });
  });
});
