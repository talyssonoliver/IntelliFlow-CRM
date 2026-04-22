import { describe, it, expect, beforeEach, vi } from 'vitest';

const SCORE_PAYLOAD = {
  score: 78,
  confidence: 0.85,
  factors: [
    { name: 'Engagement', impact: 25, reasoning: 'High recent activity' },
    { name: 'Revenue Growth', impact: 20, reasoning: 'ARR growing' },
  ],
  modelVersion: 'account-scoring-v1',
};

vi.mock('../lib/llm-factory.js', () => ({ createLLMForTenant: vi.fn() }));

const updateMock = vi.fn().mockResolvedValue({});
vi.mock('@intelliflow/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@intelliflow/db');
  return {
    ...actual,
    prisma: { account: { update: updateMock } },
  };
});

describe('AccountScoringChain (IFC-312)', () => {
  let createLLMForTenant: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.clearAllMocks();
    updateMock.mockResolvedValue({});
    createLLMForTenant = ((await import('../lib/llm-factory.js')) as any).createLLMForTenant;
  });

  it('writes score, scoreProvenance (factors), scoredAt, scoreModelVersion to Account', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue(SCORE_PAYLOAD) })),
    });
    const mod = await import('../account-scoring.chain.js');
    const out = await mod.scoreAccount({
      accountId: 'a-1',
      tenantId: 't-1',
      signals: { contactCount: 12, openDealCount: 3, totalRevenue: 200_000 },
    });
    expect(out.success).toBe(true);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const call = updateMock.mock.calls[0]![0];
    expect(call.data.score).toBe(78);
    expect(call.data.scoreProvenance).toBeDefined();
    expect(call.data.scoredAt).toBeDefined();
    expect(call.data.scoreModelVersion).toBe('account-scoring-v1');
  });

  it('scopes update by tenantId', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue(SCORE_PAYLOAD) })),
    });
    const mod = await import('../account-scoring.chain.js');
    await mod.scoreAccount({
      accountId: 'a-1',
      tenantId: 't-tenant',
      signals: { contactCount: 0, openDealCount: 0, totalRevenue: 0 },
    });
    const call = updateMock.mock.calls[0]![0];
    expect(call.where).toEqual({ tenantId_id: { tenantId: 't-tenant', id: 'a-1' } });
  });

  it('clamps score to 0-100 range', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue({ ...SCORE_PAYLOAD, score: 150 }),
      })),
    });
    const mod = await import('../account-scoring.chain.js');
    const out = await mod.scoreAccount({
      accountId: 'a-1',
      tenantId: 't-1',
      signals: { contactCount: 0, openDealCount: 0, totalRevenue: 0 },
    });
    expect(out.success).toBe(true);
    if (out.success) expect(out.score).toBeLessThanOrEqual(100);
  });

  it('flags requiresReview when confidence < 0.5', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue({ ...SCORE_PAYLOAD, confidence: 0.3 }),
      })),
    });
    const mod = await import('../account-scoring.chain.js');
    const out = await mod.scoreAccount({
      accountId: 'a-1',
      tenantId: 't-1',
      signals: { contactCount: 0, openDealCount: 0, totalRevenue: 0 },
    });
    expect(out.success).toBe(true);
    if (out.success) expect(out.requiresReview).toBe(true);
  });

  it('falls back to zero-score on LLM error', async () => {
    createLLMForTenant.mockRejectedValueOnce(new Error('LLM down'));
    const mod = await import('../account-scoring.chain.js');
    const out = await mod.scoreAccount({
      accountId: 'a-1',
      tenantId: 't-1',
      signals: { contactCount: 0, openDealCount: 0, totalRevenue: 0 },
    });
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.score).toBe(0);
      expect(out.source).toBe('fallback');
    }
  });

  it('returns {success: false} on DB update error', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue(SCORE_PAYLOAD) })),
    });
    updateMock.mockRejectedValueOnce(new Error('DB boom'));
    const mod = await import('../account-scoring.chain.js');
    const out = await mod.scoreAccount({
      accountId: 'a-1',
      tenantId: 't-1',
      signals: { contactCount: 0, openDealCount: 0, totalRevenue: 0 },
    });
    expect(out.success).toBe(false);
  });
});
