import { describe, it, expect, beforeEach, vi } from 'vitest';

const INSIGHT_PAYLOAD = {
  healthSummary: 'High-engagement account with expanding footprint.',
  nextBestAction: 'Schedule QBR',
  keySignals: [
    { label: 'revenue growth', impact: 'positive', weight: 0.7 },
    { label: 'support escalations', impact: 'negative', weight: 0.3 },
  ],
  churnRisk: 'LOW' as const,
  engagementScore: 85,
  sentimentTrend: 'improving',
  recommendations: ['share roadmap', 'introduce CSM'],
  modelVersion: 'account-insight-v1',
};

vi.mock('../lib/llm-factory.js', () => ({ createLLMForTenant: vi.fn() }));

const upsertMock = vi.fn().mockResolvedValue({});
vi.mock('@intelliflow/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@intelliflow/db');
  return {
    ...actual,
    prisma: { accountAIInsight: { upsert: upsertMock } },
  };
});

describe('AccountInsightChain (IFC-312)', () => {
  let createLLMForTenant: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue({});
    createLLMForTenant = ((await import('../lib/llm-factory.js')) as any).createLLMForTenant;
  });

  it('upserts AccountAIInsight on happy path', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue(INSIGHT_PAYLOAD) })),
    });
    const mod = await import('../account-insight.chain.js');
    const out = await mod.generateAccountInsight({
      accountId: 'a-1',
      tenantId: 't-1',
      context: { activities: [], opportunities: [] },
    });
    expect(out.success).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0]![0].where).toEqual({ accountId: 'a-1' });
  });

  it('records provenance on upsert', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue(INSIGHT_PAYLOAD) })),
    });
    const mod = await import('../account-insight.chain.js');
    await mod.generateAccountInsight({
      accountId: 'a-1',
      tenantId: 't-1',
      context: { activities: [] },
    });
    const call = upsertMock.mock.calls[0]![0];
    expect(call.create.modelVersion).toBe('account-insight-v1');
    expect(call.create.source).toBe('llm');
    expect(call.create.generatedAt).toBeDefined();
  });

  it('scopes by tenantId', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue(INSIGHT_PAYLOAD) })),
    });
    const mod = await import('../account-insight.chain.js');
    await mod.generateAccountInsight({
      accountId: 'a-1',
      tenantId: 't-xyz',
      context: {},
    });
    const call = upsertMock.mock.calls[0]![0];
    expect(call.create.tenantId).toBe('t-xyz');
  });

  it('returns fallback when LLM throws', async () => {
    createLLMForTenant.mockRejectedValueOnce(new Error('LLM down'));
    const mod = await import('../account-insight.chain.js');
    const out = await mod.generateAccountInsight({
      accountId: 'a-1',
      tenantId: 't-1',
      context: {},
    });
    expect(out.success).toBe(true);
    expect(out.source).toBe('fallback');
  });

  it('engagementScore clamped to 0-100', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue({
          ...INSIGHT_PAYLOAD,
          engagementScore: 999,
        }),
      })),
    });
    const mod = await import('../account-insight.chain.js');
    await mod.generateAccountInsight({
      accountId: 'a-1',
      tenantId: 't-1',
      context: {},
    });
    const call = upsertMock.mock.calls[0]![0];
    expect(call.create.engagementScore).toBeLessThanOrEqual(100);
  });

  it('returns {success: false} when upsert fails', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue(INSIGHT_PAYLOAD) })),
    });
    upsertMock.mockRejectedValueOnce(new Error('DB boom'));
    const mod = await import('../account-insight.chain.js');
    const out = await mod.generateAccountInsight({
      accountId: 'a-1',
      tenantId: 't-1',
      context: {},
    });
    expect(out.success).toBe(false);
  });

  it('emits fallback source when Zod parse fails', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue({ wrong: 'shape' }),
      })),
    });
    const mod = await import('../account-insight.chain.js');
    const out = await mod.generateAccountInsight({
      accountId: 'a-1',
      tenantId: 't-1',
      context: {},
    });
    expect(out.success).toBe(true);
    if (out.success) expect(out.source).toBe('fallback');
    const call = upsertMock.mock.calls[0]![0];
    expect(call.create.source).toBe('fallback');
  });

  it('handles optional fields being undefined', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue({
          churnRisk: 'LOW',
          engagementScore: 70,
          // All optional fields omitted
        }),
      })),
    });
    const mod = await import('../account-insight.chain.js');
    const out = await mod.generateAccountInsight({
      accountId: 'a-1',
      tenantId: 't-1',
      context: {},
    });
    expect(out.success).toBe(true);
    const call = upsertMock.mock.calls[0]![0];
    expect(call.create.healthSummary).toBeNull();
    expect(call.create.nextBestAction).toBeNull();
    expect(call.create.keySignals).toBeNull();
    expect(call.create.sentimentTrend).toBeNull();
    expect(call.create.recommendations).toEqual([]);
  });
});
