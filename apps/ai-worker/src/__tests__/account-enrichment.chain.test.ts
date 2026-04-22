import { describe, it, expect, beforeEach, vi } from 'vitest';

// IFC-312 — account-enrichment.chain unit tests.

const ENRICHMENT_PAYLOAD = {
  industry: 'saas',
  employees: 250,
  revenue: 50000000,
  description: 'Cloud-native CRM platform for SMBs.',
  website: 'https://acme.example.com',
  confidence: 0.9,
  modelVersion: 'enrichment-litellm-v1',
  source: 'llm' as const,
};

vi.mock('../shared/enrichment-adapter.js', () => ({
  getEnrichmentAdapter: vi.fn(() => ({
    enrichContact: vi.fn(),
    enrichAccount: vi.fn().mockResolvedValue(ENRICHMENT_PAYLOAD),
  })),
}));

const prismaUpdateMock = vi.fn().mockResolvedValue({});
const prismaFindUniqueMock = vi.fn();
const prismaIndustryFindManyMock = vi.fn().mockResolvedValue([
  { key: 'saas', label: 'SaaS', tenantId: 't-1' },
  { key: 'retail', label: 'Retail', tenantId: 't-1' },
]);

vi.mock('@intelliflow/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@intelliflow/db');
  return {
    ...actual,
    prisma: {
      account: {
        findUnique: prismaFindUniqueMock,
        update: prismaUpdateMock,
      },
      accountIndustryOption: {
        findMany: prismaIndustryFindManyMock,
      },
    },
  };
});

async function primeHappyPath() {
  const { getEnrichmentAdapter } = await import('../shared/enrichment-adapter.js');
  (getEnrichmentAdapter as any).mockReturnValue({
    enrichContact: vi.fn(),
    enrichAccount: vi.fn().mockResolvedValue(ENRICHMENT_PAYLOAD),
  });
}

describe('AccountEnrichmentChain (IFC-312)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    prismaUpdateMock.mockResolvedValue({});
    prismaIndustryFindManyMock.mockResolvedValue([
      { key: 'saas', label: 'SaaS', tenantId: 't-1' },
      { key: 'retail', label: 'Retail', tenantId: 't-1' },
    ]);
    await primeHappyPath();
  });

  it('returns `{success: false, reason: "insufficient-seed"}` when name is missing', async () => {
    const mod = await import('../account-enrichment.chain.js');
    const out = await mod.enrichAccount({
      accountId: 'a-1',
      tenantId: 't-1',
      seed: { name: '' },
    });
    expect(out.success).toBe(false);
    if (!out.success) expect(out.reason).toBe('insufficient-seed');
    expect(prismaUpdateMock).not.toHaveBeenCalled();
  });

  it('returns `{success: false}` when adapter returns null', async () => {
    prismaFindUniqueMock.mockResolvedValue({
      id: 'a-1',
      tenantId: 't-1',
      name: 'Acme',
      website: null,
      industry: null,
      employees: null,
      revenue: null,
      description: null,
    });
    const { getEnrichmentAdapter } = await import('../shared/enrichment-adapter.js');
    (getEnrichmentAdapter as any).mockReturnValueOnce({
      enrichContact: vi.fn(),
      enrichAccount: vi.fn().mockResolvedValue(null),
    });
    const mod = await import('../account-enrichment.chain.js');
    const out = await mod.enrichAccount({
      accountId: 'a-1',
      tenantId: 't-1',
      seed: { name: 'Acme' },
    });
    expect(out.success).toBe(false);
  });

  it('fills only empty DB fields, never overwrites non-empty values', async () => {
    prismaFindUniqueMock.mockResolvedValue({
      id: 'a-1',
      tenantId: 't-1',
      name: 'Acme',
      website: 'https://original.example.com', // non-empty → must NOT be overwritten
      industry: null,
      employees: null,
      revenue: null,
      description: null,
    });
    await primeHappyPath();
    const mod = await import('../account-enrichment.chain.js');
    const out = await mod.enrichAccount({
      accountId: 'a-1',
      tenantId: 't-1',
      seed: { name: 'Acme' },
    });
    expect(out.success).toBe(true);
    expect(prismaUpdateMock).toHaveBeenCalledTimes(1);
    const updateCall = prismaUpdateMock.mock.calls[0]![0];
    expect(updateCall.data.website).not.toBe('https://acme.example.com');
  });

  it('drops enriched industry when it is NOT in the tenant vocabulary', async () => {
    prismaIndustryFindManyMock.mockResolvedValueOnce([
      { key: 'retail', label: 'Retail', tenantId: 't-1' },
      // `saas` is intentionally absent for this tenant
    ]);
    prismaFindUniqueMock.mockResolvedValue({
      id: 'a-1',
      tenantId: 't-1',
      name: 'Acme',
      website: null,
      industry: null,
      employees: null,
      revenue: null,
      description: null,
    });
    await primeHappyPath();
    const mod = await import('../account-enrichment.chain.js');
    await mod.enrichAccount({
      accountId: 'a-1',
      tenantId: 't-1',
      seed: { name: 'Acme' },
    });
    expect(prismaUpdateMock).toHaveBeenCalledTimes(1);
    const updateCall = prismaUpdateMock.mock.calls[0]![0];
    expect(updateCall.data.industry).toBeUndefined();
  });

  it('scopes Prisma update by tenantId (cross-tenant safety)', async () => {
    prismaFindUniqueMock.mockResolvedValue({
      id: 'a-1',
      tenantId: 't-1',
      name: 'Acme',
      website: null,
      industry: null,
      employees: null,
      revenue: null,
      description: null,
    });
    const mod = await import('../account-enrichment.chain.js');
    await mod.enrichAccount({
      accountId: 'a-1',
      tenantId: 't-1',
      seed: { name: 'Acme' },
    });
    const updateCall = prismaUpdateMock.mock.calls[0]![0];
    expect(updateCall.where).toEqual({ tenantId_id: { tenantId: 't-1', id: 'a-1' } });
  });

  it('returns provenance in the result', async () => {
    prismaFindUniqueMock.mockResolvedValue({
      id: 'a-1',
      tenantId: 't-1',
      name: 'Acme',
      website: null,
      industry: null,
      employees: null,
      revenue: null,
      description: null,
    });
    const mod = await import('../account-enrichment.chain.js');
    const out = await mod.enrichAccount({
      accountId: 'a-1',
      tenantId: 't-1',
      seed: { name: 'Acme' },
    });
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.modelVersion).toBe('enrichment-litellm-v1');
      expect(out.source).toBe('llm');
    }
  });

  it('returns `{success: false, reason: "account-not-found"}` when Prisma returns null', async () => {
    prismaFindUniqueMock.mockResolvedValue(null);
    const mod = await import('../account-enrichment.chain.js');
    const out = await mod.enrichAccount({
      accountId: 'a-missing',
      tenantId: 't-1',
      seed: { name: 'Missing Co' },
    });
    expect(out.success).toBe(false);
    if (!out.success) expect(out.reason).toBe('account-not-found');
  });

  it('survives Prisma update throwing — never re-throws', async () => {
    prismaFindUniqueMock.mockResolvedValue({
      id: 'a-1',
      tenantId: 't-1',
      name: 'Acme',
      website: null,
      industry: null,
      employees: null,
      revenue: null,
      description: null,
    });
    prismaUpdateMock.mockRejectedValueOnce(new Error('DB down'));
    const mod = await import('../account-enrichment.chain.js');
    const out = await mod.enrichAccount({
      accountId: 'a-1',
      tenantId: 't-1',
      seed: { name: 'Acme' },
    });
    expect(out.success).toBe(false);
  });
});
