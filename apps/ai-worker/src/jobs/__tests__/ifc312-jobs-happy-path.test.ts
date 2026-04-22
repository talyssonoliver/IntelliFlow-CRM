/**
 * IFC-312 — Job handler happy-path tests.
 *
 * Complements `ifc312-jobs.test.ts` (which covers toggle-off + ADR-037 safety)
 * by exercising the enabled/happy path through each handler, which is the
 * bulk of uncovered branches in jobs/*.job.ts per the coverage report.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// Shared Prisma + chain mocks
// ────────────────────────────────────────────────────────────────────────────

const prismaContactSettingMock = { findUnique: vi.fn() };
const prismaAccountSettingMock = { findUnique: vi.fn() };
const prismaContactFindUniqueMock = vi.fn();
const prismaAccountFindUniqueMock = vi.fn();
const prismaContactUpdateMock = vi.fn().mockResolvedValue({});
const prismaAccountUpdateMock = vi.fn().mockResolvedValue({});
const prismaContactAIInsightUpsertMock = vi.fn().mockResolvedValue({});
const prismaAccountAIInsightUpsertMock = vi.fn().mockResolvedValue({});
const prismaReplyDraftCreateMock = vi.fn();
const prismaContactCountMock = vi.fn();
const prismaOpportunityCountMock = vi.fn();
const prismaIndustryFindManyMock = vi.fn().mockResolvedValue([]);

vi.mock('@intelliflow/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@intelliflow/db');
  return {
    ...actual,
    prisma: {
      contactAutomationSetting: prismaContactSettingMock,
      accountAutomationSetting: prismaAccountSettingMock,
      contact: {
        findUnique: prismaContactFindUniqueMock,
        count: prismaContactCountMock,
        update: prismaContactUpdateMock,
      },
      account: {
        findUnique: prismaAccountFindUniqueMock,
        update: prismaAccountUpdateMock,
      },
      contactAIInsight: { upsert: prismaContactAIInsightUpsertMock },
      accountAIInsight: { upsert: prismaAccountAIInsightUpsertMock },
      contactReplyDraft: { create: prismaReplyDraftCreateMock },
      opportunity: { count: prismaOpportunityCountMock },
      accountIndustryOption: { findMany: prismaIndustryFindManyMock },
    },
  };
});

const enrichAdapterContactMock = vi.fn();
const enrichAdapterAccountMock = vi.fn();
vi.mock('../../shared/enrichment-adapter.js', () => ({
  getEnrichmentAdapter: vi.fn(() => ({
    enrichContact: enrichAdapterContactMock,
    enrichAccount: enrichAdapterAccountMock,
  })),
}));

vi.mock('../../lib/llm-factory.js', () => ({
  createLLMForTenant: vi.fn().mockResolvedValue({
    withStructuredOutput: vi.fn(() => ({
      invoke: vi.fn().mockResolvedValue({
        // Contact/Account insight
        conversionProbability: 70,
        lifetimeValue: 10000,
        healthSummary: 'Good',
        churnRisk: 'LOW',
        engagementScore: 80,
        modelVersion: 'v1',
        // Reply-draft
        draftSubject: 'Re: Hi',
        draftBody: 'Thanks',
        tone: 'friendly',
        confidence: 0.8,
        // Scoring
        score: 75,
        factors: [{ name: 'Engagement', impact: 20, reasoning: 'good' }],
        // Tag-suggestion
        suggestions: [{ label: 'hot', confidence: 0.7, reason: 'recent activity' }],
      }),
    })),
  }),
}));

vi.mock('../../utils/input-sanitizer.js', () => ({
  sanitizeStringField: vi.fn((v: string) => v),
}));

// ────────────────────────────────────────────────────────────────────────────
// Happy-path tests
// ────────────────────────────────────────────────────────────────────────────

describe('IFC-312 job happy paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaContactUpdateMock.mockResolvedValue({});
    prismaAccountUpdateMock.mockResolvedValue({});
    prismaContactAIInsightUpsertMock.mockResolvedValue({});
    prismaAccountAIInsightUpsertMock.mockResolvedValue({});
    prismaReplyDraftCreateMock.mockResolvedValue({ id: 'draft-new' });
    prismaContactCountMock.mockResolvedValue(5);
    prismaOpportunityCountMock.mockResolvedValue(2);
    prismaIndustryFindManyMock.mockResolvedValue([]);
  });

  describe('enrichment.job — enabled paths', () => {
    it('executes contact enrichment when contact + flag present', async () => {
      prismaContactSettingMock.findUnique.mockResolvedValue({ aiEnrichment: true });
      prismaContactFindUniqueMock.mockResolvedValue({
        id: 'c-1',
        email: 'jane@acme.com',
        firstName: 'Jane',
        lastName: null,
        company: null,
        title: null,
        city: null,
        country: null,
        linkedInUrl: null,
        tenantId: 't-1',
      });
      enrichAdapterContactMock.mockResolvedValueOnce({
        company: 'Acme',
        jobTitle: 'VP',
        confidence: 0.8,
        modelVersion: 'v1',
        source: 'llm',
      });
      const { processEnrichmentJob } = await import('../enrichment.job.js');
      const out = await processEnrichmentJob({
        data: { entityType: 'contact', entityId: 'c-1', tenantId: 't-1' },
      } as any);
      expect(out.skipped).toBeUndefined();
      expect(enrichAdapterContactMock).toHaveBeenCalledTimes(1);
    });

    it('skips when contact row not found (deleted between enqueue and execute)', async () => {
      prismaContactSettingMock.findUnique.mockResolvedValue({ aiEnrichment: true });
      prismaContactFindUniqueMock.mockResolvedValue(null);
      const { processEnrichmentJob } = await import('../enrichment.job.js');
      const out = await processEnrichmentJob({
        data: { entityType: 'contact', entityId: 'c-1', tenantId: 't-1' },
      } as any);
      expect(out.skipped).toBe(true);
    });

    it('executes account enrichment when account + flag present', async () => {
      prismaAccountSettingMock.findUnique.mockResolvedValue({ aiEnrichment: true });
      prismaAccountFindUniqueMock.mockResolvedValue({
        id: 'a-1',
        tenantId: 't-1',
        name: 'Acme',
        website: null,
        industry: null,
        employees: null,
        revenue: null,
        description: null,
      });
      enrichAdapterAccountMock.mockResolvedValueOnce({
        industry: 'saas',
        employees: 100,
        confidence: 0.8,
        modelVersion: 'v1',
        source: 'llm',
      });
      const { processEnrichmentJob } = await import('../enrichment.job.js');
      const out = await processEnrichmentJob({
        data: { entityType: 'account', entityId: 'a-1', tenantId: 't-1' },
      } as any);
      expect(out.skipped).toBeUndefined();
      expect(enrichAdapterAccountMock).toHaveBeenCalledTimes(1);
    });

    it('skips account enrichment when account row missing', async () => {
      prismaAccountSettingMock.findUnique.mockResolvedValue({ aiEnrichment: true });
      prismaAccountFindUniqueMock.mockResolvedValue(null);
      const { processEnrichmentJob } = await import('../enrichment.job.js');
      const out = await processEnrichmentJob({
        data: { entityType: 'account', entityId: 'a-1', tenantId: 't-1' },
      } as any);
      expect(out.skipped).toBe(true);
    });

    it('propagates errors from chain (BullMQ retry policy applies)', async () => {
      prismaContactSettingMock.findUnique.mockResolvedValue({ aiEnrichment: true });
      prismaContactFindUniqueMock.mockRejectedValueOnce(new Error('DB boom'));
      const { processEnrichmentJob } = await import('../enrichment.job.js');
      await expect(
        processEnrichmentJob({
          data: { entityType: 'contact', entityId: 'c-1', tenantId: 't-1' },
        } as any)
      ).rejects.toThrow('DB boom');
    });
  });

  describe('entity-insight.job — enabled paths', () => {
    it('executes contact insight chain when flag on', async () => {
      prismaContactSettingMock.findUnique.mockResolvedValue({ aiInsightGeneration: true });
      const { processEntityInsightJob } = await import('../entity-insight.job.js');
      const out = await processEntityInsightJob({
        data: {
          entityType: 'contact',
          entityId: 'c-1',
          tenantId: 't-1',
          context: { activities: [] },
        },
      } as any);
      expect(out.skipped).toBeUndefined();
      expect(prismaContactAIInsightUpsertMock).toHaveBeenCalledTimes(1);
    });

    it('executes account insight chain when flag on', async () => {
      prismaAccountSettingMock.findUnique.mockResolvedValue({ aiInsightGeneration: true });
      const { processEntityInsightJob } = await import('../entity-insight.job.js');
      const out = await processEntityInsightJob({
        data: {
          entityType: 'account',
          entityId: 'a-1',
          tenantId: 't-1',
          context: { activities: [] },
        },
      } as any);
      expect(out.skipped).toBeUndefined();
      expect(prismaAccountAIInsightUpsertMock).toHaveBeenCalledTimes(1);
    });

    it('handles context being undefined gracefully (defaults empty)', async () => {
      prismaContactSettingMock.findUnique.mockResolvedValue({ aiInsightGeneration: true });
      const { processEntityInsightJob } = await import('../entity-insight.job.js');
      await processEntityInsightJob({
        data: { entityType: 'contact', entityId: 'c-1', tenantId: 't-1' },
      } as any);
      expect(prismaContactAIInsightUpsertMock).toHaveBeenCalledTimes(1);
    });

    it('re-throws chain errors for BullMQ retry', async () => {
      prismaContactSettingMock.findUnique.mockRejectedValueOnce(new Error('Redis down'));
      const { processEntityInsightJob } = await import('../entity-insight.job.js');
      await expect(
        processEntityInsightJob({
          data: { entityType: 'contact', entityId: 'c-1', tenantId: 't-1' },
        } as any)
      ).rejects.toThrow('Redis down');
    });
  });

  describe('reply-draft.job — enabled paths', () => {
    it('returns draftId on success path', async () => {
      prismaContactSettingMock.findUnique.mockResolvedValue({ aiAutoReplyDrafting: true });
      const { processReplyDraftJob } = await import('../reply-draft.job.js');
      const out = await processReplyDraftJob({
        data: {
          contactId: 'c-1',
          tenantId: 't-1',
          emailThread: [{ from: 'x@y.com', body: 'hi', at: '2026-01-01' }],
        },
      } as any);
      expect(out.draftId).toBe('draft-new');
      expect(prismaReplyDraftCreateMock).toHaveBeenCalledTimes(1);
    });

    it('includes createdBy + emailThreadId + userInstructions on insert when provided', async () => {
      prismaContactSettingMock.findUnique.mockResolvedValue({ aiAutoReplyDrafting: true });
      const { processReplyDraftJob } = await import('../reply-draft.job.js');
      await processReplyDraftJob({
        data: {
          contactId: 'c-1',
          tenantId: 't-1',
          emailThreadId: 'thread-42',
          userInstructions: 'Keep it brief',
          createdBy: 'user-9',
          emailThread: [{ from: 'x@y.com', body: 'hi', at: '2026-01-01' }],
        },
      } as any);
      const call = prismaReplyDraftCreateMock.mock.calls[0]![0];
      expect(call.data.emailThreadId).toBe('thread-42');
      expect(call.data.createdBy).toBe('user-9');
    });
  });

  describe('account-scoring.job — enabled paths', () => {
    it('runs score chain + writes Account.score when flag on', async () => {
      prismaAccountSettingMock.findUnique.mockResolvedValue({ aiAccountScoring: true });
      prismaAccountFindUniqueMock.mockResolvedValue({
        id: 'a-1',
        tenantId: 't-1',
        name: 'Acme',
        revenue: 1_000_000,
        website: null,
        industry: null,
        employees: null,
        description: null,
      });
      const { processAccountScoringJob } = await import('../account-scoring.job.js');
      const out = await processAccountScoringJob({
        data: { accountId: 'a-1', tenantId: 't-1' },
      } as any);
      expect(out.skipped).toBeUndefined();
      expect(out.score).toBeTypeOf('number');
      expect(prismaAccountUpdateMock).toHaveBeenCalledTimes(1);
    });

    it('skips when account row is missing', async () => {
      prismaAccountSettingMock.findUnique.mockResolvedValue({ aiAccountScoring: true });
      prismaAccountFindUniqueMock.mockResolvedValue(null);
      const { processAccountScoringJob } = await import('../account-scoring.job.js');
      const out = await processAccountScoringJob({
        data: { accountId: 'a-missing', tenantId: 't-1' },
      } as any);
      expect(out.skipped).toBe(true);
    });

    it('handles null revenue (treats as 0)', async () => {
      prismaAccountSettingMock.findUnique.mockResolvedValue({ aiAccountScoring: true });
      prismaAccountFindUniqueMock.mockResolvedValue({
        id: 'a-1',
        tenantId: 't-1',
        name: 'Acme',
        revenue: null, // no revenue → treated as 0
        website: null,
        industry: null,
        employees: null,
        description: null,
      });
      const { processAccountScoringJob } = await import('../account-scoring.job.js');
      const out = await processAccountScoringJob({
        data: { accountId: 'a-1', tenantId: 't-1' },
      } as any);
      expect(out.skipped).toBeUndefined();
    });
  });

  describe('tag-suggestion.job — enabled paths', () => {
    it('returns non-empty suggestions on contact path', async () => {
      prismaContactSettingMock.findUnique.mockResolvedValue({ aiTagSuggestions: true });
      const { processTagSuggestionJob } = await import('../tag-suggestion.job.js');
      const out = await processTagSuggestionJob({
        data: {
          entityType: 'contact',
          entityId: 'c-1',
          tenantId: 't-1',
          profileSnapshot: { bio: 'engineer' },
        },
      } as any);
      expect(out.suggestions.length).toBeGreaterThan(0);
      expect(out.modelVersion).not.toBe('disabled');
    });

    it('returns non-empty suggestions on account path', async () => {
      prismaAccountSettingMock.findUnique.mockResolvedValue({ aiTagSuggestions: true });
      const { processTagSuggestionJob } = await import('../tag-suggestion.job.js');
      const out = await processTagSuggestionJob({
        data: {
          entityType: 'account',
          entityId: 'a-1',
          tenantId: 't-1',
          profileSnapshot: { description: 'SaaS' },
        },
      } as any);
      expect(out.suggestions.length).toBeGreaterThan(0);
    });

    it('returns {suggestions: [], modelVersion: "error"} when chain unexpectedly throws', async () => {
      prismaContactSettingMock.findUnique.mockRejectedValueOnce(new Error('boom'));
      const { processTagSuggestionJob } = await import('../tag-suggestion.job.js');
      const out = await processTagSuggestionJob({
        data: {
          entityType: 'contact',
          entityId: 'c-1',
          tenantId: 't-1',
          profileSnapshot: {},
        },
      } as any);
      expect(out.suggestions).toEqual([]);
      expect(out.modelVersion).toBe('error');
    });
  });
});
