import { describe, it, expect, beforeEach, vi } from 'vitest';

// IFC-312 — contact tag-suggestion chain tests.

const LLM_PAYLOAD = {
  suggestions: [
    { label: 'enterprise', confidence: 0.9, reason: 'Large company mentioned in title' },
    { label: 'decision-maker', confidence: 0.85, reason: 'VP-level title' },
    { label: 'technical', confidence: 0.8, reason: 'Engineering domain' },
    { label: 'priority', confidence: 0.4, reason: 'Recent activity' },
    { label: 'low-confidence', confidence: 0.2, reason: 'weak signal' }, // < 0.3 → filtered
    { label: 'extra', confidence: 0.5, reason: 'should be within cap' },
    { label: 'too-many', confidence: 0.6, reason: 'beyond cap' },
  ],
  modelVersion: 'tag-suggestion-v1',
};

vi.mock('../lib/llm-factory.js', () => ({
  createLLMForTenant: vi.fn(),
}));

vi.mock('../utils/input-sanitizer.js', () => ({
  sanitizeStringField: vi.fn((v: string) => `SAN(${v})`),
}));

describe('ContactTagSuggestionChain (IFC-312)', () => {
  let createLLMForTenant: ReturnType<typeof vi.fn>;
  let sanitizeStringField: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const llm = (await import('../lib/llm-factory.js')) as any;
    createLLMForTenant = llm.createLLMForTenant;
    const san = (await import('../utils/input-sanitizer.js')) as any;
    sanitizeStringField = san.sanitizeStringField;
  });

  it('returns [] when the LLM output has no suggestions', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue({ suggestions: [], modelVersion: 'v1' }),
      })),
    });
    const mod = await import('../contact-tag-suggestion.chain.js');
    const out = await mod.suggestContactTags({
      contactId: 'c-1',
      tenantId: 't-1',
      profileSnapshot: { bio: 'engineer', company: 'Acme', title: 'VP' },
    });
    expect(out.suggestions).toEqual([]);
    expect(out.modelVersion).toBeDefined();
  });

  it('caps suggestions at 5 entries', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue(LLM_PAYLOAD),
      })),
    });
    const mod = await import('../contact-tag-suggestion.chain.js');
    const out = await mod.suggestContactTags({
      contactId: 'c-1',
      tenantId: 't-1',
      profileSnapshot: { bio: 'engineer', company: 'Acme', title: 'VP' },
    });
    expect(out.suggestions.length).toBeLessThanOrEqual(5);
  });

  it('filters out suggestions with confidence < 0.3', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue(LLM_PAYLOAD),
      })),
    });
    const mod = await import('../contact-tag-suggestion.chain.js');
    const out = await mod.suggestContactTags({
      contactId: 'c-1',
      tenantId: 't-1',
      profileSnapshot: { bio: 'engineer', company: 'Acme', title: 'VP' },
    });
    const labels = out.suggestions.map((s) => s.label);
    expect(labels).not.toContain('low-confidence');
    for (const s of out.suggestions) {
      expect(s.confidence).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('each suggestion has label, confidence, reason', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue(LLM_PAYLOAD),
      })),
    });
    const mod = await import('../contact-tag-suggestion.chain.js');
    const out = await mod.suggestContactTags({
      contactId: 'c-1',
      tenantId: 't-1',
      profileSnapshot: { bio: 'engineer', company: 'Acme', title: 'VP' },
    });
    for (const s of out.suggestions) {
      expect(typeof s.label).toBe('string');
      expect(typeof s.confidence).toBe('number');
      expect(typeof s.reason).toBe('string');
    }
  });

  it('calls sanitizeStringField on profile text fields', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue(LLM_PAYLOAD),
      })),
    });
    const mod = await import('../contact-tag-suggestion.chain.js');
    await mod.suggestContactTags({
      contactId: 'c-1',
      tenantId: 't-1',
      profileSnapshot: { bio: 'engineer', company: 'Acme', title: 'VP' },
    });
    expect(sanitizeStringField).toHaveBeenCalled();
    expect(sanitizeStringField.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('returns [] when LLM call throws (never propagates)', async () => {
    createLLMForTenant.mockRejectedValueOnce(new Error('LLM unreachable'));
    const mod = await import('../contact-tag-suggestion.chain.js');
    const out = await mod.suggestContactTags({
      contactId: 'c-1',
      tenantId: 't-1',
      profileSnapshot: { bio: 'engineer', company: 'Acme', title: 'VP' },
    });
    expect(out.suggestions).toEqual([]);
  });

  it('returns [] when structured output fails Zod validation', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue({ garbage: true }),
      })),
    });
    const mod = await import('../contact-tag-suggestion.chain.js');
    const out = await mod.suggestContactTags({
      contactId: 'c-1',
      tenantId: 't-1',
      profileSnapshot: { bio: 'engineer', company: 'Acme', title: 'VP' },
    });
    expect(out.suggestions).toEqual([]);
  });

  it('calls createLLMForTenant with structured purpose + tenantId', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue(LLM_PAYLOAD),
      })),
    });
    const mod = await import('../contact-tag-suggestion.chain.js');
    await mod.suggestContactTags({
      contactId: 'c-1',
      tenantId: 't-abc',
      profileSnapshot: { bio: 'engineer', company: 'Acme', title: 'VP' },
    });
    expect(createLLMForTenant).toHaveBeenCalledTimes(1);
    const [purpose, _tier, opts] = createLLMForTenant.mock.calls[0]!;
    expect(purpose).toBe('structured');
    expect(opts).toMatchObject({ tenantId: 't-abc' });
  });
});
