import { describe, it, expect, beforeEach, vi } from 'vitest';

// IFC-312 — contact-enrichment.chain unit tests (RED phase).

const ENRICHMENT_PAYLOAD = {
  company: 'Acme Corp',
  jobTitle: 'VP of Engineering',
  location: 'San Francisco, CA',
  city: 'San Francisco',
  country: 'USA',
  linkedinUrl: 'https://linkedin.com/in/janedoe',
  confidence: 0.88,
  modelVersion: 'enrichment-litellm-v1',
  source: 'llm' as const,
};

vi.mock('../shared/enrichment-adapter.js', () => ({
  getEnrichmentAdapter: vi.fn(() => ({
    enrichContact: vi.fn().mockResolvedValue(ENRICHMENT_PAYLOAD),
    enrichAccount: vi.fn(),
  })),
}));

const prismaUpdateMock = vi.fn().mockResolvedValue({});
const prismaFindUniqueMock = vi.fn();

vi.mock('@intelliflow/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@intelliflow/db');
  return {
    ...actual,
    prisma: {
      contact: {
        findUnique: prismaFindUniqueMock,
        update: prismaUpdateMock,
      },
    },
  };
});

async function primeHappyPath() {
  const { getEnrichmentAdapter } = await import('../shared/enrichment-adapter.js');
  (getEnrichmentAdapter as any).mockReturnValue({
    enrichContact: vi.fn().mockResolvedValue(ENRICHMENT_PAYLOAD),
    enrichAccount: vi.fn(),
  });
}

describe('ContactEnrichmentChain (IFC-312)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    prismaUpdateMock.mockResolvedValue({});
    await primeHappyPath();
  });

  it('returns `{success: false, reason: "insufficient-seed"}` when email is missing', async () => {
    const mod = await import('../contact-enrichment.chain.js');
    const out = await mod.enrichContact({
      contactId: 'c-1',
      tenantId: 't-1',
      seed: { email: '' },
    });
    expect(out.success).toBe(false);
    expect(out.reason).toBe('insufficient-seed');
    expect(prismaUpdateMock).not.toHaveBeenCalled();
  });

  it('returns `{success: false}` when the adapter returns null', async () => {
    prismaFindUniqueMock.mockResolvedValue({
      id: 'c-1',
      tenantId: 't-1',
      email: 'jane@acme.com',
      firstName: null,
      lastName: null,
      company: null,
      title: null,
      city: null,
      country: null,
      linkedInUrl: null,
    });
    const { getEnrichmentAdapter } = await import('../shared/enrichment-adapter.js');
    (getEnrichmentAdapter as any).mockReturnValueOnce({
      enrichContact: vi.fn().mockResolvedValue(null),
      enrichAccount: vi.fn(),
    });
    const mod = await import('../contact-enrichment.chain.js');
    const out = await mod.enrichContact({
      contactId: 'c-1',
      tenantId: 't-1',
      seed: { email: 'jane@acme.com', firstName: 'Jane' },
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      expect(out.reason).toBe('adapter-returned-null');
    }
  });

  it('fills only empty DB fields, never overwrites non-empty values', async () => {
    prismaFindUniqueMock.mockResolvedValue({
      id: 'c-1',
      tenantId: 't-1',
      email: 'jane@acme.com',
      firstName: 'Jane',
      lastName: 'Doe',
      company: 'ExistingCo', // already set → must NOT be overwritten
      title: null, // empty → may be filled (via jobTitle)
      city: null,
      country: null,
      linkedInUrl: null,
    });
    await primeHappyPath();
    const mod = await import('../contact-enrichment.chain.js');
    const out = await mod.enrichContact({
      contactId: 'c-1',
      tenantId: 't-1',
      seed: { email: 'jane@acme.com' },
    });
    expect(out.success).toBe(true);
    expect(prismaUpdateMock).toHaveBeenCalledTimes(1);
    const updateCall = prismaUpdateMock.mock.calls[0]![0];
    // `company` must be absent OR equal to 'ExistingCo' — never 'Acme Corp'
    expect(updateCall.data.company).not.toBe('Acme Corp');
  });

  it('scopes Prisma update by tenantId (cross-tenant safety)', async () => {
    prismaFindUniqueMock.mockResolvedValue({
      id: 'c-1',
      tenantId: 't-1',
      email: 'jane@acme.com',
      firstName: null,
      lastName: null,
      company: null,
      title: null,
      city: null,
      linkedInUrl: null,
    });
    const mod = await import('../contact-enrichment.chain.js');
    await mod.enrichContact({
      contactId: 'c-1',
      tenantId: 't-1',
      seed: { email: 'jane@acme.com' },
    });
    const updateCall = prismaUpdateMock.mock.calls[0]![0];
    expect(updateCall.where).toEqual({ tenantId_id: { tenantId: 't-1', id: 'c-1' } });
  });

  it('returns `{success: true, updated: N}` indicating filled field count', async () => {
    prismaFindUniqueMock.mockResolvedValue({
      id: 'c-1',
      tenantId: 't-1',
      email: 'jane@acme.com',
      firstName: null,
      lastName: null,
      company: null,
      title: null,
      city: null,
      linkedInUrl: null,
    });
    const mod = await import('../contact-enrichment.chain.js');
    const out = await mod.enrichContact({
      contactId: 'c-1',
      tenantId: 't-1',
      seed: { email: 'jane@acme.com' },
    });
    expect(out.success).toBe(true);
    expect(out.updated).toBeGreaterThan(0);
  });

  it('bubbles provenance fields (`modelVersion`, `source`) in the result', async () => {
    prismaFindUniqueMock.mockResolvedValue({
      id: 'c-1',
      tenantId: 't-1',
      email: 'jane@acme.com',
      firstName: null,
      lastName: null,
      company: null,
      title: null,
      city: null,
      linkedInUrl: null,
    });
    const mod = await import('../contact-enrichment.chain.js');
    const out = await mod.enrichContact({
      contactId: 'c-1',
      tenantId: 't-1',
      seed: { email: 'jane@acme.com' },
    });
    expect(out.success).toBe(true);
    expect(out.modelVersion).toBe('enrichment-litellm-v1');
    expect(out.source).toBe('llm');
  });

  it('returns `{success: false, reason: "contact-not-found"}` when Prisma returns null', async () => {
    prismaFindUniqueMock.mockResolvedValue(null);
    const mod = await import('../contact-enrichment.chain.js');
    const out = await mod.enrichContact({
      contactId: 'c-missing',
      tenantId: 't-1',
      seed: { email: 'nobody@acme.com' },
    });
    expect(out.success).toBe(false);
    expect(out.reason).toBe('contact-not-found');
    expect(prismaUpdateMock).not.toHaveBeenCalled();
  });

  it('survives Prisma update throwing — returns `{success: false}` and does not re-throw', async () => {
    prismaFindUniqueMock.mockResolvedValue({
      id: 'c-1',
      tenantId: 't-1',
      email: 'jane@acme.com',
      firstName: null,
      lastName: null,
      company: null,
      title: null,
      city: null,
      linkedInUrl: null,
    });
    prismaUpdateMock.mockRejectedValueOnce(new Error('DB down'));
    const mod = await import('../contact-enrichment.chain.js');
    const out = await mod.enrichContact({
      contactId: 'c-1',
      tenantId: 't-1',
      seed: { email: 'jane@acme.com' },
    });
    expect(out.success).toBe(false);
  });
});
