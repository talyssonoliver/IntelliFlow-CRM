import { describe, it, expect, beforeEach, vi } from 'vitest';

const LLM_PAYLOAD = {
  suggestions: [
    { label: 'saas', confidence: 0.9, reason: 'Cloud product' },
    { label: 'mid-market', confidence: 0.7, reason: 'Employee count' },
    { label: 'low-conf', confidence: 0.2, reason: 'weak' },
  ],
  modelVersion: 'account-tag-suggestion-v1',
};

vi.mock('../lib/llm-factory.js', () => ({ createLLMForTenant: vi.fn() }));
vi.mock('../utils/input-sanitizer.js', () => ({
  sanitizeStringField: vi.fn((v: string) => `SAN(${v})`),
}));

describe('AccountTagSuggestionChain (IFC-312)', () => {
  let createLLMForTenant: ReturnType<typeof vi.fn>;
  let sanitizeStringField: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.clearAllMocks();
    createLLMForTenant = ((await import('../lib/llm-factory.js')) as any).createLLMForTenant;
    sanitizeStringField = ((await import('../utils/input-sanitizer.js')) as any)
      .sanitizeStringField;
  });

  it('returns [] when LLM emits no suggestions', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue({ suggestions: [], modelVersion: 'v1' }),
      })),
    });
    const mod = await import('../account-tag-suggestion.chain.js');
    const out = await mod.suggestAccountTags({
      accountId: 'a-1',
      tenantId: 't-1',
      profileSnapshot: { description: 'Cloud CRM', industry: 'tech', website: 'https://x' },
    });
    expect(out.suggestions).toEqual([]);
  });

  it('caps at 5 and filters confidence < 0.3', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue(LLM_PAYLOAD) })),
    });
    const mod = await import('../account-tag-suggestion.chain.js');
    const out = await mod.suggestAccountTags({
      accountId: 'a-1',
      tenantId: 't-1',
      profileSnapshot: { description: 'Cloud CRM', industry: 'tech', website: 'https://x' },
    });
    expect(out.suggestions.length).toBeLessThanOrEqual(5);
    for (const s of out.suggestions) expect(s.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('sanitizes free-text inputs', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue(LLM_PAYLOAD) })),
    });
    const mod = await import('../account-tag-suggestion.chain.js');
    await mod.suggestAccountTags({
      accountId: 'a-1',
      tenantId: 't-1',
      profileSnapshot: { description: 'Cloud CRM', industry: 'tech', website: 'https://x' },
    });
    expect(sanitizeStringField.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('returns [] when LLM throws', async () => {
    createLLMForTenant.mockRejectedValueOnce(new Error('boom'));
    const mod = await import('../account-tag-suggestion.chain.js');
    const out = await mod.suggestAccountTags({
      accountId: 'a-1',
      tenantId: 't-1',
      profileSnapshot: { description: 'Cloud CRM' },
    });
    expect(out.suggestions).toEqual([]);
  });

  it('returns [] when Zod validation fails', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue({ wrong: true }) })),
    });
    const mod = await import('../account-tag-suggestion.chain.js');
    const out = await mod.suggestAccountTags({
      accountId: 'a-1',
      tenantId: 't-1',
      profileSnapshot: { description: 'X' },
    });
    expect(out.suggestions).toEqual([]);
  });

  it('passes tenantId to createLLMForTenant', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue(LLM_PAYLOAD) })),
    });
    const mod = await import('../account-tag-suggestion.chain.js');
    await mod.suggestAccountTags({
      accountId: 'a-1',
      tenantId: 't-z',
      profileSnapshot: { description: 'X' },
    });
    const [, , opts] = createLLMForTenant.mock.calls[0]!;
    expect(opts).toMatchObject({ tenantId: 't-z' });
  });

  it('always returns modelVersion in result', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue(LLM_PAYLOAD) })),
    });
    const mod = await import('../account-tag-suggestion.chain.js');
    const out = await mod.suggestAccountTags({
      accountId: 'a-1',
      tenantId: 't-1',
      profileSnapshot: { description: 'X' },
    });
    expect(out.modelVersion).toBeDefined();
    expect(typeof out.modelVersion).toBe('string');
  });
});
