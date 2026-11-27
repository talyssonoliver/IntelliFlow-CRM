/**
 * AI Chains settings page procedures (chain-usage.router.ts, IFC-086): getEffective and
 * getUsageStats, served under the chainVersion router.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { ChainVersionService, type ChainVersionRecord } from '@intelliflow/application';
import { chainVersionRouter } from '../chain-version.router';
import { createTRPCRouter } from '../../../trpc';
import { createTestContext, prismaMock } from '../../../test/setup';

vi.mock('../../../security/tenant-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../security/tenant-context')>();
  return {
    ...actual,
    getTenantContext: vi.fn((ctx: any) => {
      if (!ctx.tenant) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Tenant context required' });
      }
      return ctx as any;
    }),
  };
});

const TEST_VERSION_ID = '11111111-1111-4111-8111-111111111111';
const testRouter = createTRPCRouter({ chainVersion: chainVersionRouter });

/** The chain version repository the router reads: findActive is what the ai-worker runs. */
const versions = { findActive: vi.fn(), findByStatus: vi.fn() };

function tenantCtx(service: unknown = {}) {
  const ctx = createTestContext({ services: { chainVersion: service } as any }) as any;
  ctx.adapters.chainVersionRepository = versions;
  return ctx;
}

beforeEach(() => {
  vi.clearAllMocks();
  versions.findActive.mockResolvedValue(null);
  versions.findByStatus.mockResolvedValue([]);
  (prismaMock.tenantAIConfig.findUnique as any).mockResolvedValue(null);
});

function record(over: Partial<ChainVersionRecord>): ChainVersionRecord {
  return {
    id: TEST_VERSION_ID,
    chainType: 'SCORING',
    status: 'ACTIVE',
    prompt: 'Score:\n{lead_info}',
    model: 'claude-haiku-5-5',
    temperature: 0.2,
    maxTokens: 800,
    additionalParams: null,
    description: null,
    rolloutStrategy: 'IMMEDIATE',
    rolloutPercent: null,
    experimentId: null,
    tenantId: 't',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    ...over,
  } as ChainVersionRecord;
}

describe('getEffective', () => {
  it('returns every chain type, built-in when nothing is saved, looked up by the caller tenant', async () => {
    versions.findActive.mockResolvedValue(null);
    (prismaMock.tenantAIConfig.findUnique as any).mockResolvedValue(null);
    const ctx = tenantCtx();
    const caller = testRouter.createCaller(ctx);

    const result = await caller.chainVersion.getEffective();

    expect(Object.keys(result).sort()).toEqual([
      'EMAIL_WRITER',
      'FOLLOWUP',
      'QUALIFICATION',
      'SCORING',
    ]);
    expect(result.SCORING).toMatchObject({ source: 'builtin', label: 'Built-in v1' });
    const tenantId = (ctx as any).user.tenantId;
    for (const [, tenant] of versions.findActive.mock.calls) {
      expect(tenant).toBe(tenantId);
    }
    for (const [args] of (prismaMock.tenantAIConfig.findUnique as any).mock.calls) {
      expect(args.where.tenantId_purpose.tenantId).toBe(tenantId);
    }
  });

  it('shows a saved version, with the model the worker runs rather than the saved one', async () => {
    versions.findActive.mockImplementation(async (type: string) =>
      type === 'SCORING'
        ? {
            id: TEST_VERSION_ID,
            prompt: 'Score:\n{lead_info}',
            model: 'claude-haiku-5-5',
            temperature: 0.2,
            maxTokens: 800,
            description: null,
          }
        : null
    );
    (prismaMock.tenantAIConfig.findUnique as any).mockResolvedValue(null);
    const caller = testRouter.createCaller(tenantCtx());

    const result = await caller.chainVersion.getEffective();

    expect(result.SCORING).toMatchObject({
      source: 'saved',
      label: 'Saved version',
      savedVersionId: TEST_VERSION_ID,
      temperature: null,
    });
    expect(result.SCORING.modelSource).not.toBe('saved');
    expect(result.SCORING.model).not.toBe('claude-haiku-5-5');
    expect(result.SCORING.chains[0]).toMatchObject({ promptSource: 'saved' });
  });
});

describe('getUsageStats', () => {
  it("reads only the caller tenant's runs and labels derived scoring counts", async () => {
    (prismaMock.chainRun.groupBy as any).mockResolvedValue([]);
    (prismaMock.leadActivity.count as any).mockResolvedValue(7);
    (prismaMock.leadActivity.findFirst as any).mockResolvedValue({
      timestamp: new Date('2026-11-10T10:00:00Z'),
    });
    const ctx = tenantCtx();
    const caller = testRouter.createCaller(ctx);

    const result = await caller.chainVersion.getUsageStats({ days: 7 });

    const tenantId = (ctx as any).user.tenantId;
    for (const [args] of (prismaMock.chainRun.groupBy as any).mock.calls) {
      expect(args.where.tenantId).toBe(tenantId);
    }
    expect((prismaMock.leadActivity.count as any).mock.calls[0][0].where).toMatchObject({
      tenantId,
      title: 'Lead Scored by AI',
    });
    expect(result.SCORING).toMatchObject({
      runs: 7,
      source: 'derived',
      derivedFrom: 'Lead Scored by AI activities',
    });
    expect(result.FOLLOWUP.source).toBe('none');
  });

  it('reports recorded runs per chain type', async () => {
    (prismaMock.chainRun.groupBy as any).mockImplementation(async (args: any) =>
      args.where.success
        ? [{ chainType: 'FOLLOWUP', _count: { _all: 1 } }]
        : [
            {
              chainType: 'FOLLOWUP',
              _count: { _all: 2 },
              _min: { createdAt: new Date('2026-11-10T00:00:00Z') },
              _max: { createdAt: new Date('2026-11-11T00:00:00Z') },
              _avg: { latencyMs: 500 },
              _sum: { costUsd: '0.004', inputTokens: 300, outputTokens: 40 },
            },
          ]
    );
    const caller = testRouter.createCaller(tenantCtx());

    const result = await caller.chainVersion.getUsageStats();

    expect(result.FOLLOWUP).toMatchObject({
      runs: 2,
      successRate: 0.5,
      avgLatencyMs: 500,
      spend: { amount: 0.004, currency: 'USD' },
      inputTokens: 300,
      outputTokens: 40,
      source: 'recorded',
    });
  });

  it('counts since the tenant first recorded the type, read without the window filter', async () => {
    const firstEver = new Date('2026-01-01T00:00:00Z');
    (prismaMock.chainRun.groupBy as any).mockImplementation(async (args: any) => {
      if (!args.where.createdAt) {
        return [{ chainType: 'FOLLOWUP', _min: { createdAt: firstEver } }];
      }
      return args.where.success
        ? [{ chainType: 'FOLLOWUP', _count: { _all: 1 } }]
        : [
            {
              chainType: 'FOLLOWUP',
              _count: { _all: 1 },
              _min: { createdAt: new Date() },
              _max: { createdAt: new Date() },
              _avg: { latencyMs: 5 },
              _sum: { costUsd: '0', inputTokens: 1, outputTokens: 1 },
            },
          ];
    });
    const caller = testRouter.createCaller(tenantCtx());

    const result = await caller.chainVersion.getUsageStats({ days: 7 });

    const unfiltered = (prismaMock.chainRun.groupBy as any).mock.calls.find(
      ([args]: [any]) => !args.where.createdAt
    );
    expect(unfiltered[0].where).toEqual({ tenantId: expect.any(String) });
    // Recording started long before the 7-day window, so the whole window is counted.
    const windowStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(new Date(result.FOLLOWUP.countedSince).getTime() - windowStart)).toBeLessThan(
      60_000
    );
  });
});

describe('getEffective during a partial rollout', () => {
  it('names the version the ai-worker runs, not the older one a feature flag would pick', async () => {
    // 50% rollout of the ACTIVE version; the flag is off for this caller, and a DEPRECATED
    // version is newer than the ACTIVE one, so the flag-aware lookup falls back to it.
    const active = record({
      id: TEST_VERSION_ID,
      rolloutStrategy: 'PERCENTAGE',
      rolloutPercent: 50,
    });
    const deprecated = record({
      id: '22222222-2222-4222-8222-222222222222',
      status: 'DEPRECATED',
      createdAt: new Date('2026-11-05T00:00:00Z'),
    });
    versions.findActive.mockResolvedValue(active);
    versions.findByStatus.mockResolvedValue([deprecated]);
    const audit = { create: vi.fn(), findByVersion: vi.fn() } as never;
    const bus = { publish: vi.fn(), publishAll: vi.fn(), subscribe: vi.fn() } as never;
    const flagged = new ChainVersionService(
      versions as never,
      audit,
      {
        isEnabled: vi.fn(async () => false),
      } as never,
      bus
    );
    // The ai-worker builds its service without feature flags (configureVersionLoaderFromPrisma).
    const worker = new ChainVersionService(versions as never, audit, null, bus);

    const flaggedPick = await flagged.findActiveVersion('SCORING', { tenantId: 't' });
    const workerPick = await worker.findActiveVersion('SCORING', { tenantId: 't' });
    const page = await testRouter.createCaller(tenantCtx(flagged)).chainVersion.getEffective();

    expect(flaggedPick?.version.id).toBe(deprecated.id);
    expect(workerPick?.version.id).toBe(TEST_VERSION_ID);
    expect(page.SCORING.savedVersionId).toBe(workerPick?.version.id);
  });
});
