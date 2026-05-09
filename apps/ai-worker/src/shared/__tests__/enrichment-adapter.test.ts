import { describe, it, expect, beforeEach, vi } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// IFC-312 shared enrichment adapter — RED phase test.
// Verifies EnrichmentProvider contract, mock adapter, LiteLLM adapter, factory
// routing, sanitization, provenance, and error handling.
// ────────────────────────────────────────────────────────────────────────────

const CONTACT_ENRICHMENT_PAYLOAD = {
  company: 'Acme Corp',
  jobTitle: 'VP of Engineering',
  location: 'San Francisco, CA',
  city: 'San Francisco',
  country: 'USA',
  linkedinUrl: 'https://linkedin.com/in/janedoe',
  confidence: 0.88,
};

const ACCOUNT_ENRICHMENT_PAYLOAD = {
  industry: 'saas',
  employees: 250,
  revenue: 50000000,
  description: 'Cloud-native CRM platform for SMBs.',
  website: 'https://acme.example.com',
  confidence: 0.9,
};

vi.mock('../../lib/llm-factory.js', () => ({
  createLLMForTenant: vi.fn(),
}));

vi.mock('../../utils/input-sanitizer.js', () => ({
  sanitizeStringField: vi.fn((v: string) => `SAN(${v})`),
}));

vi.mock('../../config/ai.config.js', () => ({
  aiConfig: {
    provider: 'litellm',
    performance: { retryAttempts: 3, retryDelay: 10 },
  },
}));

describe('EnrichmentProvider port + adapter (IFC-312)', () => {
  let createLLMForTenant: ReturnType<typeof vi.fn>;
  let sanitizeStringField: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const llmMod = (await import('../../lib/llm-factory.js')) as unknown as {
      createLLMForTenant: ReturnType<typeof vi.fn>;
    };
    createLLMForTenant = llmMod.createLLMForTenant;

    const sanMod = (await import('../../utils/input-sanitizer.js')) as unknown as {
      sanitizeStringField: ReturnType<typeof vi.fn>;
    };
    sanitizeStringField = sanMod.sanitizeStringField;
  });

  describe('Zod schemas', () => {
    it('ContactEnrichmentSchema parses a complete payload + provenance', async () => {
      const mod = await import('../enrichment-adapter.js');
      const parsed = mod.ContactEnrichmentSchema.parse({
        ...CONTACT_ENRICHMENT_PAYLOAD,
        modelVersion: 'enrichment-v1',
        source: 'llm',
      });
      expect(parsed.company).toBe('Acme Corp');
      expect(parsed.confidence).toBe(0.88);
      expect(parsed.modelVersion).toBe('enrichment-v1');
      expect(parsed.source).toBe('llm');
    });

    it('AccountEnrichmentSchema restricts source enum to llm|adapter|fallback', async () => {
      const mod = await import('../enrichment-adapter.js');
      expect(() =>
        mod.AccountEnrichmentSchema.parse({
          ...ACCOUNT_ENRICHMENT_PAYLOAD,
          modelVersion: 'v1',
          source: 'clearbit' as any,
        })
      ).toThrow();
    });
  });

  describe('getEnrichmentAdapter factory', () => {
    it('returns LiteLLMEnrichmentAdapter when aiConfig.provider is litellm', async () => {
      const mod = await import('../enrichment-adapter.js');
      const adapter = mod.getEnrichmentAdapter();
      expect(adapter).toBeInstanceOf(mod.LiteLLMEnrichmentAdapter);
    });

    it('returns MockEnrichmentAdapter when aiConfig.provider is mock', async () => {
      vi.resetModules();
      vi.doMock('../../config/ai.config.js', () => ({
        aiConfig: { provider: 'mock', performance: { retryAttempts: 3, retryDelay: 10 } },
      }));
      const mod = await import('../enrichment-adapter.js');
      const adapter = mod.getEnrichmentAdapter();
      expect(adapter).toBeInstanceOf(mod.MockEnrichmentAdapter);
      vi.doUnmock('../../config/ai.config.js');
    });
  });

  describe('MockEnrichmentAdapter', () => {
    it('enrichContact returns a deterministic stub', async () => {
      const mod = await import('../enrichment-adapter.js');
      const adapter = new mod.MockEnrichmentAdapter();
      const out = await adapter.enrichContact(
        { email: 'jane@acme.com', firstName: 'Jane', lastName: 'Doe' },
        'tenant-1'
      );
      expect(out).not.toBeNull();
      expect(out!.source).toBe('adapter');
      expect(out!.modelVersion).toMatch(/^mock-/);
    });

    it('enrichAccount returns a deterministic stub', async () => {
      const mod = await import('../enrichment-adapter.js');
      const adapter = new mod.MockEnrichmentAdapter();
      const out = await adapter.enrichAccount({ name: 'Acme' }, 'tenant-1');
      expect(out).not.toBeNull();
      expect(out!.source).toBe('adapter');
    });
  });

  describe('LiteLLMEnrichmentAdapter.enrichContact', () => {
    it('calls createLLMForTenant with structured purpose + standard tier + tenantId', async () => {
      const structuredInvoke = vi.fn().mockResolvedValue(CONTACT_ENRICHMENT_PAYLOAD);
      const mockModel = {
        withStructuredOutput: vi.fn(() => ({ invoke: structuredInvoke })),
      };
      createLLMForTenant.mockResolvedValueOnce(mockModel);

      const mod = await import('../enrichment-adapter.js');
      const adapter = new mod.LiteLLMEnrichmentAdapter();
      await adapter.enrichContact({ email: 'jane@acme.com', firstName: 'Jane' }, 'tenant-abc');

      expect(createLLMForTenant).toHaveBeenCalledTimes(1);
      const [purpose, tier, opts] = createLLMForTenant.mock.calls[0]!;
      expect(purpose).toBe('structured');
      expect(tier).toBe('standard');
      expect(opts).toMatchObject({ tenantId: 'tenant-abc' });
    });

    it('returns a Zod-valid payload with provenance fields', async () => {
      const structuredInvoke = vi.fn().mockResolvedValue(CONTACT_ENRICHMENT_PAYLOAD);
      createLLMForTenant.mockResolvedValueOnce({
        withStructuredOutput: vi.fn(() => ({ invoke: structuredInvoke })),
      });

      const mod = await import('../enrichment-adapter.js');
      const adapter = new mod.LiteLLMEnrichmentAdapter();
      const out = await adapter.enrichContact(
        { email: 'jane@acme.com', firstName: 'Jane' },
        'tenant-1'
      );

      expect(out).not.toBeNull();
      expect(out!.company).toBe('Acme Corp');
      expect(out!.source).toBe('llm');
      expect(out!.modelVersion).toBeDefined();
      expect(typeof out!.modelVersion).toBe('string');
    });

    it('calls sanitizeStringField on every free-text seed field', async () => {
      const structuredInvoke = vi.fn().mockResolvedValue(CONTACT_ENRICHMENT_PAYLOAD);
      createLLMForTenant.mockResolvedValueOnce({
        withStructuredOutput: vi.fn(() => ({ invoke: structuredInvoke })),
      });

      const mod = await import('../enrichment-adapter.js');
      const adapter = new mod.LiteLLMEnrichmentAdapter();
      await adapter.enrichContact(
        { email: 'jane@acme.com', firstName: 'Jane', lastName: 'Doe', company: 'Acme' },
        'tenant-1'
      );

      // email + firstName + lastName + company = at least 4 string sanitizations
      expect(sanitizeStringField).toHaveBeenCalled();
      expect(sanitizeStringField.mock.calls.length).toBeGreaterThanOrEqual(4);
    });

    it('returns null (never throws) when the LLM call fails', async () => {
      createLLMForTenant.mockRejectedValueOnce(new Error('LLM unreachable'));

      const mod = await import('../enrichment-adapter.js');
      const adapter = new mod.LiteLLMEnrichmentAdapter();
      const out = await adapter.enrichContact(
        { email: 'jane@acme.com', firstName: 'Jane' },
        'tenant-1'
      );

      expect(out).toBeNull();
    });

    it('returns null when structured output fails Zod validation', async () => {
      const structuredInvoke = vi.fn().mockResolvedValue({
        // missing required `confidence` field → Zod parse should reject
        company: 'Acme',
      });
      createLLMForTenant.mockResolvedValueOnce({
        withStructuredOutput: vi.fn(() => ({ invoke: structuredInvoke })),
      });

      const mod = await import('../enrichment-adapter.js');
      const adapter = new mod.LiteLLMEnrichmentAdapter();
      const out = await adapter.enrichContact(
        { email: 'jane@acme.com', firstName: 'Jane' },
        'tenant-1'
      );

      expect(out).toBeNull();
    });
  });

  describe('LiteLLMEnrichmentAdapter.enrichAccount', () => {
    it('returns a Zod-valid AccountEnrichment with provenance', async () => {
      const structuredInvoke = vi.fn().mockResolvedValue(ACCOUNT_ENRICHMENT_PAYLOAD);
      createLLMForTenant.mockResolvedValueOnce({
        withStructuredOutput: vi.fn(() => ({ invoke: structuredInvoke })),
      });

      const mod = await import('../enrichment-adapter.js');
      const adapter = new mod.LiteLLMEnrichmentAdapter();
      const out = await adapter.enrichAccount(
        { name: 'Acme Corp', website: 'https://acme.example.com', domain: 'acme.example.com' },
        'tenant-1'
      );

      expect(out).not.toBeNull();
      expect(out!.industry).toBe('saas');
      expect(out!.employees).toBe(250);
      expect(out!.source).toBe('llm');
      expect(out!.modelVersion).toBeDefined();
    });
  });
});
