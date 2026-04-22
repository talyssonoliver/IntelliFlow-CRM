import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/llm-factory.js', () => ({ createLLMForTenant: vi.fn() }));
vi.mock('../utils/input-sanitizer.js', () => ({
  sanitizeStringField: vi.fn((v: string) => v),
}));

const updateMock = vi.fn().mockResolvedValue({});
vi.mock('@intelliflow/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@intelliflow/db');
  return {
    ...actual,
    prisma: {
      account: { update: updateMock },
    },
  };
});

describe('AccountIndustryInferenceChain (IFC-312)', () => {
  let createLLMForTenant: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.clearAllMocks();
    updateMock.mockResolvedValue({});
    createLLMForTenant = ((await import('../lib/llm-factory.js')) as any).createLLMForTenant;
  });

  const VOCAB = [
    { key: 'saas', label: 'SaaS' },
    { key: 'retail', label: 'Retail' },
    { key: 'healthcare', label: 'Healthcare' },
  ];

  it('returns {success: false, reason: "empty-vocabulary"} when vocabulary is empty', async () => {
    const mod = await import('../account-industry-inference.chain.js');
    const out = await mod.inferAccountIndustry({
      accountId: 'a-1',
      tenantId: 't-1',
      seed: { name: 'Acme', website: 'acme.io' },
      vocabulary: [],
    });
    expect(out.success).toBe(false);
    if (!out.success) expect(out.reason).toBe('empty-vocabulary');
  });

  it('writes the selected industry key to Account on success', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue({
          industryKey: 'saas',
          confidence: 0.9,
          reasoning: 'Cloud product',
          modelVersion: 'v1',
        }),
      })),
    });
    const mod = await import('../account-industry-inference.chain.js');
    const out = await mod.inferAccountIndustry({
      accountId: 'a-1',
      tenantId: 't-1',
      seed: { name: 'Acme', website: 'acme.io' },
      vocabulary: VOCAB,
    });
    expect(out.success).toBe(true);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const call = updateMock.mock.calls[0]![0];
    expect(call.data.industry).toBe('saas');
    expect(call.data.industryInferredAt).toBeDefined();
    expect(call.data.industryModelVersion).toBeDefined();
  });

  it('scopes update by tenantId', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue({
          industryKey: 'retail',
          confidence: 0.8,
          reasoning: 'r',
        }),
      })),
    });
    const mod = await import('../account-industry-inference.chain.js');
    await mod.inferAccountIndustry({
      accountId: 'a-1',
      tenantId: 't-tenant',
      seed: { name: 'Shop' },
      vocabulary: VOCAB,
    });
    const call = updateMock.mock.calls[0]![0];
    expect(call.where).toEqual({ tenantId_id: { tenantId: 't-tenant', id: 'a-1' } });
  });

  it('returns {success: false} + does not write when LLM emits off-taxonomy key', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue({
          industryKey: 'manufacturing', // not in vocab
          confidence: 0.9,
          reasoning: 'r',
        }),
      })),
    });
    const mod = await import('../account-industry-inference.chain.js');
    const out = await mod.inferAccountIndustry({
      accountId: 'a-1',
      tenantId: 't-1',
      seed: { name: 'Acme' },
      vocabulary: VOCAB,
    });
    expect(out.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('flags requiresReview when confidence < 0.5', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue({
          industryKey: 'healthcare',
          confidence: 0.3,
          reasoning: 'r',
        }),
      })),
    });
    const mod = await import('../account-industry-inference.chain.js');
    const out = await mod.inferAccountIndustry({
      accountId: 'a-1',
      tenantId: 't-1',
      seed: { name: 'Acme' },
      vocabulary: VOCAB,
    });
    expect(out.success).toBe(true);
    if (out.success) expect(out.requiresReview).toBe(true);
  });

  it('returns {success: false} when LLM throws', async () => {
    createLLMForTenant.mockRejectedValueOnce(new Error('boom'));
    const mod = await import('../account-industry-inference.chain.js');
    const out = await mod.inferAccountIndustry({
      accountId: 'a-1',
      tenantId: 't-1',
      seed: { name: 'Acme' },
      vocabulary: VOCAB,
    });
    expect(out.success).toBe(false);
  });
});
