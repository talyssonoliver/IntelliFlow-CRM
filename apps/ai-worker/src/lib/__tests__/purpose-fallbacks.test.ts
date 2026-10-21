/**
 * purpose-fallbacks.test.ts — PG-199 (owner Q2, AC-015): when a purpose reaches its monthly
 * AI ceiling, `createLLMForTenant` throws PURPOSE_CEILING_REACHED before any model is built.
 * Every chain of that purpose must then run its existing non-AI fallback instead of failing.
 * (auto-response is the documented exception — email has no template fallback, owner Q6 —
 * and is covered in auto-response.chain.test.ts.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  const ceiling = (purpose: string) =>
    Object.assign(new Error(`monthly AI ceiling reached for ${purpose}`), {
      code: 'PURPOSE_CEILING_REACHED',
      purpose,
    });
  const model = {
    invoke: async () => ({ content: '{}' }),
    withStructuredOutput: () => ({ invoke: async () => ({}) }),
  };
  return { ceiling, model, upsert: vi.fn(async () => ({})) };
});

vi.mock('../llm-factory', () => ({
  createLLM: vi.fn(() => h.model),
  createLLMForTenant: vi.fn(async (purpose: string) => {
    throw h.ceiling(purpose);
  }),
}));

vi.mock('../tenant-ai-config.js', () => ({
  resolveEffectiveTier: vi.fn(async () => ({ tier: 'free' })),
  resolveRateLimit: vi.fn(async () => 60),
}));

vi.mock('../../versioning/chain-version-loader', () => ({
  getVersionLoader: () => ({ getChainConfig: async () => null }),
  CHAIN_TYPE_MAP: {},
  configureVersionLoader: vi.fn(),
}));

vi.mock('@intelliflow/db', () => ({
  prisma: { caseAIInsight: { upsert: h.upsert } },
}));

import { createLLMForTenant } from '../llm-factory';
import { LeadScoringChain } from '../../chains/scoring.chain';
import { ChurnRiskChain } from '../../chains/churn-risk.chain';
import { InsightGenerationChain } from '../../chains/insight-generation.chain';
import { TicketRoutingChain } from '../../chains/ticket-routing.chain';
import { SentimentAnalysisChain } from '../../chains/sentiment.chain';
import { generateCaseInsight } from '../../case-insight.chain';
import { draftContactReply } from '../../contact-reply-draft.chain';

const TENANT = 'tenant-capped';

describe('purpose at its monthly ceiling → existing non-AI fallback (PG-199)', () => {
  beforeEach(() => {
    vi.mocked(createLLMForTenant).mockClear();
    h.upsert.mockClear();
  });

  it('scoring: lead scoring returns the default low-confidence score', async () => {
    const result = await new LeadScoringChain({ tenantId: TENANT }).scoreLead({
      email: 'john.doe@acme.com',
      firstName: 'John',
      lastName: 'Doe',
      company: 'Acme Corp',
      title: 'VP of Sales',
      phone: '+1-555-0123',
      source: 'WEBSITE',
    });
    expect(createLLMForTenant).toHaveBeenCalledWith('scoring', 'free', expect.anything());
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it('scoring: churn risk falls back to its heuristic', async () => {
    const result = await new ChurnRiskChain({ tenantId: TENANT }).predictChurnRisk({
      entityType: 'contact',
      entityId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(createLLMForTenant).toHaveBeenCalledWith('scoring', 'free', expect.anything());
    expect(result).toBeDefined();
    expect(result.riskLevel).toBeDefined();
  });

  it('reasoning: insight generation falls back to rule-based insights', async () => {
    const result = await new InsightGenerationChain({ tenantId: TENANT }).generateInsightsWithMeta({
      tenantId: TENANT,
      userId: 'user-001',
      dealsAtRisk: [{ id: 'deal-1', name: 'Risk Deal', daysSinceUpdate: 25 }],
      hotLeads: [],
      overdueTasksCount: 0,
      staleContacts: [],
    });
    expect(createLLMForTenant).toHaveBeenCalledWith('reasoning', 'free', expect.anything());
    expect(result.insights.length).toBeGreaterThan(0);
  });

  it('structured: ticket routing falls back to keyword routing', async () => {
    const result = await new TicketRoutingChain({ tenantId: TENANT }).routeTicket({
      ticketId: 'ticket-001',
      tenantId: TENANT,
      subject: 'Cannot log in to dashboard',
      description: 'Getting authentication error on login page.',
      priority: 'HIGH',
      agentCandidates: [
        {
          agentId: 'agent-001',
          name: 'Alice',
          skills: ['TECHNICAL'],
          currentLoad: 3,
          maxCapacity: 8,
          status: 'ONLINE',
        },
      ],
    });
    expect(createLLMForTenant).toHaveBeenCalledWith('structured', 'free', expect.anything());
    expect(result).toMatchObject({ assigneeId: 'agent-001', routingMethod: 'load_balance' });
  });

  it('structured: sentiment falls back to neutral', async () => {
    const result = await new SentimentAnalysisChain({ tenantId: TENANT }).analyze({
      text: 'Test message for tenant',
      source: 'email',
    });
    expect(createLLMForTenant).toHaveBeenCalledWith('structured', 'free', expect.anything());
    expect(result.sentiment).toBe('NEUTRAL');
  });

  it('qualification: case insight is stored with source "fallback"', async () => {
    const result = await generateCaseInsight({
      caseId: 'case-1',
      tenantId: TENANT,
      context: {} as never,
    });
    expect(createLLMForTenant).toHaveBeenCalledWith('qualification', 'standard', {
      tenantId: TENANT,
    });
    expect(result).toMatchObject({ success: true, source: 'fallback' });
  });

  it('email: reply drafts fall back to a draft that requires review', async () => {
    const result = await draftContactReply({
      contactId: 'contact-1',
      tenantId: TENANT,
      emailThread: [
        { from: 'a@example.invalid', subject: 'Hi', body: 'Can we talk?', sentAt: '2026-10-01' },
      ] as never,
    });
    expect(createLLMForTenant).toHaveBeenCalledWith('email', 'standard', { tenantId: TENANT });
    expect(result).toMatchObject({ success: true, draft: { requiresReview: true } });
  });
});
