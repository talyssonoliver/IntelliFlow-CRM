import { describe, it, expect, beforeEach, vi } from 'vitest';

const LLM_PAYLOAD = {
  draftSubject: 'Re: Pricing question',
  draftBody: 'Thanks for reaching out — happy to share pricing details.',
  tone: 'friendly' as const,
  confidence: 0.8,
  modelVersion: 'reply-draft-v1',
};

vi.mock('../lib/llm-factory.js', () => ({ createLLMForTenant: vi.fn() }));
vi.mock('../utils/input-sanitizer.js', () => ({
  sanitizeStringField: vi.fn((v: string) => v),
}));

describe('ContactReplyDraftChain (IFC-312)', () => {
  let createLLMForTenant: ReturnType<typeof vi.fn>;
  let sanitizeStringField: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.clearAllMocks();
    createLLMForTenant = ((await import('../lib/llm-factory.js')) as any).createLLMForTenant;
    sanitizeStringField = ((await import('../utils/input-sanitizer.js')) as any).sanitizeStringField;
  });

  it('returns {success: false, reason: "no-thread-context"} on empty thread', async () => {
    const mod = await import('../contact-reply-draft.chain.js');
    const out = await mod.draftContactReply({
      contactId: 'c-1',
      tenantId: 't-1',
      emailThread: [],
    });
    expect(out.success).toBe(false);
    if (!out.success) expect(out.reason).toBe('no-thread-context');
  });

  it('returns payload with draftSubject/draftBody/tone/confidence/modelVersion on success', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue(LLM_PAYLOAD) })),
    });
    const mod = await import('../contact-reply-draft.chain.js');
    const out = await mod.draftContactReply({
      contactId: 'c-1',
      tenantId: 't-1',
      emailThread: [
        { from: 'customer@acme.com', subject: 'Pricing', body: 'Can you send pricing?', at: '2026-01-01' },
      ],
    });
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.draft.draftSubject).toBe('Re: Pricing question');
      expect(out.draft.draftBody).toBeDefined();
      expect(['formal', 'friendly', 'direct']).toContain(out.draft.tone);
      expect(out.draft.modelVersion).toBe('reply-draft-v1');
    }
  });

  it('NEVER sets status:SENT — payload has no status field', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue(LLM_PAYLOAD) })),
    });
    const mod = await import('../contact-reply-draft.chain.js');
    const out = await mod.draftContactReply({
      contactId: 'c-1',
      tenantId: 't-1',
      emailThread: [
        { from: 'x@y.com', subject: 's', body: 'b', at: '2026-01-01' },
      ],
    });
    expect(out.success).toBe(true);
    if (out.success) {
      const draftAny = out.draft as Record<string, unknown>;
      expect(draftAny['status']).toBeUndefined();
    }
  });

  it('sanitizes thread entries (subject/body)', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue(LLM_PAYLOAD) })),
    });
    const mod = await import('../contact-reply-draft.chain.js');
    await mod.draftContactReply({
      contactId: 'c-1',
      tenantId: 't-1',
      emailThread: [
        { from: 'a@b.com', subject: 'S', body: 'B', at: '2026-01-01' },
        { from: 'c@d.com', subject: 'S2', body: 'B2', at: '2026-01-02' },
      ],
    });
    expect(sanitizeStringField.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('returns fallback {requiresReview: true} with source=fallback on LLM failure', async () => {
    createLLMForTenant.mockRejectedValueOnce(new Error('LLM down'));
    const mod = await import('../contact-reply-draft.chain.js');
    const out = await mod.draftContactReply({
      contactId: 'c-1',
      tenantId: 't-1',
      emailThread: [{ from: 'a@b.com', subject: 'S', body: 'B', at: '2026-01-01' }],
    });
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.draft.source).toBe('fallback');
      expect(out.draft.requiresReview).toBe(true);
    }
  });

  it('confidence stays within 0-1 range', async () => {
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn().mockResolvedValue({ ...LLM_PAYLOAD, confidence: 2.0 }), // invalid
      })),
    });
    const mod = await import('../contact-reply-draft.chain.js');
    const out = await mod.draftContactReply({
      contactId: 'c-1',
      tenantId: 't-1',
      emailThread: [{ from: 'a@b.com', subject: 'S', body: 'B', at: '2026-01-01' }],
    });
    expect(out.success).toBe(true);
    if (out.success) expect(out.draft.confidence).toBeLessThanOrEqual(1);
  });

  it('passes userInstructions through to LLM when provided', async () => {
    const invokeMock = vi.fn().mockResolvedValue(LLM_PAYLOAD);
    createLLMForTenant.mockResolvedValueOnce({
      withStructuredOutput: vi.fn(() => ({ invoke: invokeMock })),
    });
    const mod = await import('../contact-reply-draft.chain.js');
    await mod.draftContactReply({
      contactId: 'c-1',
      tenantId: 't-1',
      emailThread: [{ from: 'a@b.com', subject: 'S', body: 'B', at: '2026-01-01' }],
      userInstructions: 'Keep it short and professional.',
    });
    const messages = invokeMock.mock.calls[0]![0];
    const joined = JSON.stringify(messages);
    expect(joined).toContain('short and professional');
  });
});
