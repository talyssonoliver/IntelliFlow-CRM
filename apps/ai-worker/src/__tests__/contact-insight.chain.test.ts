import { describe, it, expect, beforeEach, vi } from 'vitest';

const INSIGHT_PAYLOAD = {
  conversionProbability: 78,
  lifetimeValue: 120000,
  churnRisk: 'LOW' as const,
  nextBestAction: 'Send follow-up email',
  sentiment: 'POSITIVE' as const,
  engagementScore: 82,
  recommendations: ['schedule a call', 'share pricing page'],
  sentimentTrend: 'improving',
  lastEngagementDays: 3,
  modelVersion: 'contact-insight-v1',
};

vi.mock('../lib/llm-factory.js', () => ({ createLLMForTenant: vi.fn() }));
vi.mock('../utils/input-sanitizer.js', () => ({
  sanitizeStringField: vi.fn((v: string) => v),
}));

const upsertMock = vi.fn().mockResolvedValue({});
vi.mock('@intelliflow/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@intelliflow/db');
  return {
    ...actual,
    prisma: {
      contactAIInsight: { upsert: upsertMock },
    },
  };
});

describe('ContactInsightChain (IFC-312)', () => {
  let createLLMForTenant: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue({});
    createLLMForTenant = ((await import('../lib/llm-factory.js')) as any).createLLMForTenant;
  });

  it('returns {success: true} and upserts ContactAIInsight on happy path', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue(INSIGHT_PAYLOAD) })),
    });
    const mod = await import('../contact-insight.chain.js');
    const out = await mod.generateContactInsight({
      contactId: 'c-1',
      tenantId: 't-1',
      context: { activities: [], emails: [] },
    });
    expect(out.success).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const call = upsertMock.mock.calls[0]![0];
    expect(call.where).toEqual({ contactId: 'c-1' });
  });

  it('scopes upsert by tenantId', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue(INSIGHT_PAYLOAD) })),
    });
    const mod = await import('../contact-insight.chain.js');
    await mod.generateContactInsight({
      contactId: 'c-1',
      tenantId: 't-abc',
      context: { activities: [], emails: [] },
    });
    const call = upsertMock.mock.calls[0]![0];
    expect(call.create.tenantId).toBe('t-abc');
    expect(call.update.tenantId).toBe('t-abc');
  });

  it('records provenance (modelVersion, generatedAt, source=llm) in the upsert', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue(INSIGHT_PAYLOAD) })),
    });
    const mod = await import('../contact-insight.chain.js');
    await mod.generateContactInsight({
      contactId: 'c-1',
      tenantId: 't-1',
      context: { activities: [], emails: [] },
    });
    const call = upsertMock.mock.calls[0]![0];
    expect(call.create.modelVersion).toBe('contact-insight-v1');
    expect(call.create.source).toBe('llm');
    expect(call.create.generatedAt).toBeDefined();
  });

  it('returns a fallback insight (source=fallback) when LLM throws', async () => {
    createLLMForTenant.mockRejectedValueOnce(new Error('LLM down'));
    const mod = await import('../contact-insight.chain.js');
    const out = await mod.generateContactInsight({
      contactId: 'c-1',
      tenantId: 't-1',
      context: { activities: [], emails: [] },
    });
    expect(out.success).toBe(true);
    expect(out.source).toBe('fallback');
    const call = upsertMock.mock.calls[0]![0];
    expect(call.create.source).toBe('fallback');
  });

  it('churnRisk is a valid enum value (LOW|MEDIUM|HIGH|MINIMAL|CRITICAL)', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue(INSIGHT_PAYLOAD) })),
    });
    const mod = await import('../contact-insight.chain.js');
    await mod.generateContactInsight({
      contactId: 'c-1',
      tenantId: 't-1',
      context: { activities: [], emails: [] },
    });
    const call = upsertMock.mock.calls[0]![0];
    expect(['MINIMAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(call.create.churnRisk);
  });

  it('engagementScore is clamped to 0-100', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue({
        ...INSIGHT_PAYLOAD, engagementScore: 150, // out of range
      }) })),
    });
    const mod = await import('../contact-insight.chain.js');
    await mod.generateContactInsight({
      contactId: 'c-1',
      tenantId: 't-1',
      context: { activities: [], emails: [] },
    });
    const call = upsertMock.mock.calls[0]![0];
    expect(call.create.engagementScore).toBeLessThanOrEqual(100);
    expect(call.create.engagementScore).toBeGreaterThanOrEqual(0);
  });

  it('returns {success: false} if upsert throws', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue(INSIGHT_PAYLOAD) })),
    });
    upsertMock.mockRejectedValueOnce(new Error('DB unavailable'));
    const mod = await import('../contact-insight.chain.js');
    const out = await mod.generateContactInsight({
      contactId: 'c-1',
      tenantId: 't-1',
      context: { activities: [], emails: [] },
    });
    expect(out.success).toBe(false);
  });

  it('emits fallback source when Zod parse fails (LLM returned bad shape)', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue({ wrong: true }) })),
    });
    const mod = await import('../contact-insight.chain.js');
    const out = await mod.generateContactInsight({
      contactId: 'c-1',
      tenantId: 't-1',
      context: { activities: [], emails: [] },
    });
    expect(out.success).toBe(true);
    if (out.success) expect(out.source).toBe('fallback');
    const call = upsertMock.mock.calls[0]![0];
    expect(call.create.source).toBe('fallback');
    expect(call.create.conversionProbability).toBe(0); // fallback default
  });

  it('handles missing optional fields on LLM output (nextBestAction/sentiment/recommendations)', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue({
          conversionProbability: 50,
          lifetimeValue: 1000,
          churnRisk: 'MEDIUM',
          engagementScore: 60,
          // Omitting: nextBestAction, sentiment, recommendations, sentimentTrend, lastEngagementDays
        }),
      })),
    });
    const mod = await import('../contact-insight.chain.js');
    const out = await mod.generateContactInsight({
      contactId: 'c-1',
      tenantId: 't-1',
      context: {},
    });
    expect(out.success).toBe(true);
    const call = upsertMock.mock.calls[0]![0];
    expect(call.create.nextBestAction).toBeNull();
    expect(call.create.sentiment).toBeNull();
    expect(call.create.recommendations).toEqual([]);
    expect(call.create.sentimentTrend).toBeNull();
    expect(call.create.lastEngagementDays).toBe(0);
  });

  it('clamps negative lifetimeValue to 0', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue({
          ...INSIGHT_PAYLOAD,
          lifetimeValue: -500, // Zod requires int().min(0), but we handle max(0) defensively
        }),
      })),
    });
    const mod = await import('../contact-insight.chain.js');
    const out = await mod.generateContactInsight({
      contactId: 'c-1',
      tenantId: 't-1',
      context: {},
    });
    // Zod will reject negative → falls into fallback path (success with fallback)
    expect(out.success).toBe(true);
    if (out.success) expect(out.source).toBe('fallback');
  });
});
