import { describe, it, expect, beforeEach, vi } from 'vitest';

// IFC-312 — consolidated job-handler safety tests.
// Covers: toggle re-check gating, ADR-037 DRAFT hard-coding, cross-tenant scoping,
// and synchronous tag-suggestion return-value contract.

const prismaContactSettingMock = { findUnique: vi.fn() };
const prismaAccountSettingMock = { findUnique: vi.fn() };
const prismaContactMock = { findUnique: vi.fn() };
const prismaAccountMock = { findUnique: vi.fn() };
const prismaOpportunityMock = { count: vi.fn() };
const prismaReplyDraftMock = { create: vi.fn() };
const prismaContactCountMock = vi.fn();

vi.mock('@intelliflow/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@intelliflow/db');
  return {
    ...actual,
    prisma: {
      contactAutomationSetting: prismaContactSettingMock,
      accountAutomationSetting: prismaAccountSettingMock,
      contact: {
        findUnique: prismaContactMock.findUnique,
        count: prismaContactCountMock,
        update: vi.fn().mockResolvedValue({}),
      },
      account: { findUnique: prismaAccountMock.findUnique, update: vi.fn().mockResolvedValue({}) },
      opportunity: { count: prismaOpportunityMock.count },
      contactReplyDraft: prismaReplyDraftMock,
      contactAIInsight: { upsert: vi.fn().mockResolvedValue({}) },
      accountAIInsight: { upsert: vi.fn().mockResolvedValue({}) },
      accountIndustryOption: { findMany: vi.fn().mockResolvedValue([]) },
    },
  };
});

vi.mock('../../shared/enrichment-adapter.js', () => ({
  getEnrichmentAdapter: vi.fn(() => ({
    enrichContact: vi.fn().mockResolvedValue(null),
    enrichAccount: vi.fn().mockResolvedValue(null),
  })),
}));

vi.mock('../../lib/llm-factory.js', () => ({
  createLLMForTenant: vi.fn().mockResolvedValue({
    withStructuredOutput: vi.fn(() => ({
      invoke: vi.fn().mockResolvedValue({
        draftSubject: 'Re: Hi',
        draftBody: 'Body',
        tone: 'friendly',
        confidence: 0.8,
        suggestions: [{ label: 'x', confidence: 0.5, reason: 'r' }],
        modelVersion: 'v1',
      }),
    })),
  }),
}));

vi.mock('../../utils/input-sanitizer.js', () => ({
  sanitizeStringField: vi.fn((v: string) => v),
}));

describe('IFC-312 job handlers — safety gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaReplyDraftMock.create.mockResolvedValue({ id: 'draft-1' });
  });

  describe('enrichment.job', () => {
    it('SKIPS when contact aiEnrichment flag is off', async () => {
      prismaContactSettingMock.findUnique.mockResolvedValue({ aiEnrichment: false });
      const { processEnrichmentJob } = await import('../enrichment.job.js');
      const out = await processEnrichmentJob({
        data: { entityType: 'contact', entityId: 'c-1', tenantId: 't-1' },
      } as any);
      expect(out.skipped).toBe(true);
    });

    it('SKIPS when both account aiEnrichment and aiIndustryInference are off', async () => {
      prismaAccountSettingMock.findUnique.mockResolvedValue({
        aiEnrichment: false,
        aiIndustryInference: false,
      });
      const { processEnrichmentJob } = await import('../enrichment.job.js');
      const out = await processEnrichmentJob({
        data: { entityType: 'account', entityId: 'a-1', tenantId: 't-1' },
      } as any);
      expect(out.skipped).toBe(true);
    });

    // IFC-312 audit fix F2: industry-inference dispatch through enrichment.job
    it('dispatches inferAccountIndustry when aiIndustryInference=true and industry is empty', async () => {
      prismaAccountSettingMock.findUnique.mockResolvedValue({
        aiEnrichment: false,
        aiIndustryInference: true,
      });
      prismaAccountMock.findUnique.mockResolvedValue({
        id: 'a-1',
        name: 'Acme',
        website: 'https://acme.io',
        description: 'Cloud',
        industry: null,
      });
      const actualMock = await import('@intelliflow/db');
      (actualMock.prisma as any).accountIndustryOption.findMany.mockResolvedValueOnce([
        { key: 'saas', label: 'SaaS' },
        { key: 'retail', label: 'Retail' },
      ]);

      const { processEnrichmentJob } = await import('../enrichment.job.js');
      const out = await processEnrichmentJob({
        data: { entityType: 'account', entityId: 'a-1', tenantId: 't-1' },
      } as any);
      expect(out.skipped).toBeUndefined();
      expect(out.enrichment).toBeUndefined();
      expect(out.industry).toBeDefined();
    });

    it('skips industry-inference when account.industry is already set', async () => {
      prismaAccountSettingMock.findUnique.mockResolvedValue({
        aiEnrichment: false,
        aiIndustryInference: true,
      });
      prismaAccountMock.findUnique.mockResolvedValue({
        id: 'a-1',
        name: 'Acme',
        industry: 'Technology',
        website: null,
        description: null,
      });
      const { processEnrichmentJob } = await import('../enrichment.job.js');
      const out = await processEnrichmentJob({
        data: { entityType: 'account', entityId: 'a-1', tenantId: 't-1' },
      } as any);
      expect(out.industry).toBeUndefined();
    });

    it('skips industry-inference when vocabulary is empty', async () => {
      prismaAccountSettingMock.findUnique.mockResolvedValue({
        aiEnrichment: false,
        aiIndustryInference: true,
      });
      prismaAccountMock.findUnique.mockResolvedValue({
        id: 'a-1',
        name: 'Acme',
        industry: '',
        website: null,
        description: null,
      });
      const actualMock = await import('@intelliflow/db');
      (actualMock.prisma as any).accountIndustryOption.findMany.mockResolvedValueOnce([]);

      const { processEnrichmentJob } = await import('../enrichment.job.js');
      const out = await processEnrichmentJob({
        data: { entityType: 'account', entityId: 'a-1', tenantId: 't-1' },
      } as any);
      expect(out.industry).toBeUndefined();
    });
  });

  describe('entity-insight.job', () => {
    it('SKIPS when aiInsightGeneration flag is off', async () => {
      prismaContactSettingMock.findUnique.mockResolvedValue({ aiInsightGeneration: false });
      const { processEntityInsightJob } = await import('../entity-insight.job.js');
      const out = await processEntityInsightJob({
        data: { entityType: 'contact', entityId: 'c-1', tenantId: 't-1' },
      } as any);
      expect(out.skipped).toBe(true);
    });
  });

  describe('reply-draft.job — ADR-037 compliance', () => {
    it('SKIPS when aiAutoReplyDrafting flag is off', async () => {
      prismaContactSettingMock.findUnique.mockResolvedValue({ aiAutoReplyDrafting: false });
      const { processReplyDraftJob } = await import('../reply-draft.job.js');
      const out = await processReplyDraftJob({
        data: {
          contactId: 'c-1',
          tenantId: 't-1',
          emailThread: [{ from: 'a@b.com', body: 'hi', at: '2026-01-01' }],
        },
      } as any);
      expect(out.skipped).toBe(true);
      expect(prismaReplyDraftMock.create).not.toHaveBeenCalled();
    });

    it('writes ContactReplyDraft with status="DRAFT" — NEVER "SENT"', async () => {
      prismaContactSettingMock.findUnique.mockResolvedValue({ aiAutoReplyDrafting: true });
      const { processReplyDraftJob } = await import('../reply-draft.job.js');
      await processReplyDraftJob({
        data: {
          contactId: 'c-1',
          tenantId: 't-1',
          emailThread: [{ from: 'a@b.com', body: 'hi', at: '2026-01-01' }],
        },
      } as any);
      expect(prismaReplyDraftMock.create).toHaveBeenCalledTimes(1);
      const call = prismaReplyDraftMock.create.mock.calls[0]![0];
      expect(call.data.status).toBe('DRAFT');
      expect(call.data.status).not.toBe('SENT');
      expect(call.data.tenantId).toBe('t-1');
    });
  });

  describe('account-scoring.job', () => {
    it('SKIPS when aiAccountScoring flag is off', async () => {
      prismaAccountSettingMock.findUnique.mockResolvedValue({ aiAccountScoring: false });
      const { processAccountScoringJob } = await import('../account-scoring.job.js');
      const out = await processAccountScoringJob({
        data: { accountId: 'a-1', tenantId: 't-1' },
      } as any);
      expect(out.skipped).toBe(true);
    });
  });

  describe('tag-suggestion.job', () => {
    it('returns empty payload when contact aiTagSuggestions is off', async () => {
      prismaContactSettingMock.findUnique.mockResolvedValue({ aiTagSuggestions: false });
      const { processTagSuggestionJob } = await import('../tag-suggestion.job.js');
      const out = await processTagSuggestionJob({
        data: {
          entityType: 'contact',
          entityId: 'c-1',
          tenantId: 't-1',
          profileSnapshot: { bio: 'x' },
        },
      } as any);
      expect(out.suggestions).toEqual([]);
      expect(out.modelVersion).toBe('disabled');
    });

    it('returns empty payload when account aiTagSuggestions is off', async () => {
      prismaAccountSettingMock.findUnique.mockResolvedValue({ aiTagSuggestions: false });
      const { processTagSuggestionJob } = await import('../tag-suggestion.job.js');
      const out = await processTagSuggestionJob({
        data: {
          entityType: 'account',
          entityId: 'a-1',
          tenantId: 't-1',
          profileSnapshot: { description: 'x' },
        },
      } as any);
      expect(out.suggestions).toEqual([]);
    });
  });
});
