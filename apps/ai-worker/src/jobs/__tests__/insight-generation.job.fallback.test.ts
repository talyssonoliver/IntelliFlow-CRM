/**
 * Insight Generation — job-level provider fallback (#324)
 *
 * Covers the SECONDARY-provider recovery path added in #324
 * (tryInsightFallbackProvider + the two call sites in
 * generateInsightsWithFallback). The existing insight-generation.job.test.ts
 * runs with the REAL resolveFallbackProvider (returns null when
 * AI_FALLBACK_PROVIDER is unset), so it only exercises the heuristic path; this
 * file forces a configured fallback provider to drive the recovery branches.
 *
 * Matrix:
 *  1. primary degrades to its own heuristic (source:'fallback') → fallback
 *     provider returns a real LLM result → recovered (no heuristic).
 *  2. primary throws → fallback provider returns a real LLM result → recovered.
 *  3. primary throws → fallback provider ALSO degrades (source:'fallback') →
 *     heuristic stands.
 *  4. primary throws → fallback provider throws → heuristic stands.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Primary chain (no provider override) vs. secondary/fallback chain
// (constructed WITH a provider by tryInsightFallbackProvider, #324).
const mockPrimaryMeta = vi.hoisted(() => vi.fn());
const mockFallbackMeta = vi.hoisted(() => vi.fn());
const mockGenerateFallbackInsights = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockNotificationCreate = vi.hoisted(() => vi.fn());
const mockTaskCreate = vi.hoisted(() => vi.fn());
const mockLeadAIInsightUpsert = vi.hoisted(() => vi.fn());
const mockContactAIInsightUpsert = vi.hoisted(() => vi.fn());

// resolveFallbackProvider → a configured secondary provider, so the recovery
// branches execute. The chain is fully mocked below, so the factory's other
// exports are never exercised; stub them to keep the module surface intact.
vi.mock('../../lib/llm-factory', () => ({
  resolveFallbackProvider: () => 'litellm',
  getLLMBreaker: vi.fn(),
  __resetBreakers: vi.fn(),
  createLLM: vi.fn(),
  createEmbeddings: vi.fn(),
}));

vi.mock('../../chains/insight-generation.chain', () => {
  class InsightGenerationChain {
    generateInsightsWithMeta: ReturnType<typeof vi.fn>;
    generateFallbackInsights = mockGenerateFallbackInsights;
    constructor(options?: { tenantId?: string; provider?: string }) {
      // The job constructs `new InsightGenerationChain({ tenantId, provider })`
      // ONLY for the secondary-provider fallback (#324). The primary chain comes
      // from getInsightGenerationChain() with no provider override.
      this.generateInsightsWithMeta = options?.provider ? mockFallbackMeta : mockPrimaryMeta;
    }
  }
  return {
    getInsightGenerationChain: () => new InsightGenerationChain(),
    InsightGenerationChain,
  };
});

vi.mock('bullmq', () => {
  function MockQueue(this: any) {
    this.add = vi.fn();
    this.close = vi.fn();
  }
  return { Queue: MockQueue };
});

vi.mock('@intelliflow/db', () => ({
  prisma: {
    aIInsight: {
      create: (...args: any[]) => mockCreate(...args),
      findFirst: () => Promise.resolve(null),
    },
    notification: {
      create: (...args: any[]) => mockNotificationCreate(...args),
      findFirst: () => Promise.resolve(null),
    },
    task: {
      create: (...args: any[]) => mockTaskCreate(...args),
      count: () => Promise.resolve(0),
    },
    leadAIInsight: { upsert: (...args: any[]) => mockLeadAIInsightUpsert(...args) },
    contactAIInsight: { upsert: (...args: any[]) => mockContactAIInsightUpsert(...args) },
    user: { findMany: () => Promise.resolve([]) },
    lead: { groupBy: () => Promise.resolve([]), findMany: () => Promise.resolve([]) },
    opportunity: { findMany: () => Promise.resolve([]) },
    contact: { findMany: () => Promise.resolve([]) },
  },
}));

import { processInsightJob, type InsightJobData } from '../insight-generation.job';
import type { GeneratedInsight } from '../../chains/insight-generation.chain';

function createInsight(overrides: Partial<GeneratedInsight> = {}): GeneratedInsight {
  return {
    entityId: 'deal-1',
    entityType: 'opportunity',
    type: 'warning',
    title: 'Deal at Risk',
    description: 'Follow up with the buyer.',
    suggestedActions: ['Schedule a call'],
    confidence: 0.85,
    priority: 'medium',
    reasoning: 'Recent inactivity detected.',
    ...overrides,
  };
}

function createMockJob(data: Partial<InsightJobData> = {}) {
  const fullData: InsightJobData = {
    tenantId: '00000000-0000-4000-a000-000000000001',
    userId: 'user-001',
    dealsAtRisk: [{ id: 'deal-1', name: 'Enterprise Deal', daysSinceUpdate: 20 }],
    hotLeads: [],
    overdueTasksCount: 0,
    staleContacts: [],
    ...data,
  };
  return {
    id: 'job-fallback-1',
    data: fullData,
    updateProgress: vi.fn(),
    extendLock: vi.fn().mockResolvedValue(undefined),
    token: 'mock-lock-token',
    queueName: 'ai-insights',
  } as any;
}

/** A heuristic insight (confidence 0.4 → 40 in DB) for generateFallbackInsights. */
function heuristicInsight(input: InsightJobData): GeneratedInsight[] {
  return [
    createInsight({
      entityId: input.dealsAtRisk[0]?.id ?? null,
      title: 'Deal at Risk (heuristic)',
      confidence: 0.4,
      priority: 'high',
    }),
  ];
}

describe('insight generation — provider fallback (#324)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['ENABLE_AI_INSIGHTS_JOB'];
    mockGenerateFallbackInsights.mockImplementation((input: InsightJobData) =>
      heuristicInsight(input)
    );
    mockCreate.mockResolvedValue({ id: 'insight-1' });
    mockNotificationCreate.mockResolvedValue({ id: 'notification-1' });
    mockTaskCreate.mockResolvedValue({ id: 'task-1' });
    mockLeadAIInsightUpsert.mockResolvedValue({ id: 'lead-insight-1' });
    mockContactAIInsightUpsert.mockResolvedValue({ id: 'contact-insight-1' });
  });

  it('recovers via the fallback provider when the primary degrades to its heuristic', async () => {
    // Primary chain returned a heuristic (source:'fallback') ...
    mockPrimaryMeta.mockResolvedValue({
      insights: [createInsight({ confidence: 0.4 })],
      source: 'fallback',
      executionTimeMs: 5,
    });
    // ... but the SECONDARY provider yields a real LLM result.
    mockFallbackMeta.mockResolvedValue({
      insights: [createInsight({ confidence: 0.85 })],
      source: 'llm',
      executionTimeMs: 8,
    });

    await processInsightJob(createMockJob());

    expect(mockFallbackMeta).toHaveBeenCalledOnce();
    // Did NOT drop to the per-chain heuristic — the fallback provider recovered.
    expect(mockGenerateFallbackInsights).not.toHaveBeenCalled();
    // Persisted insight is the recovered real LLM one (confidence 0.85 → 85).
    const confidences = mockCreate.mock.calls.map((c: any[]) => c[0].data.confidence);
    expect(confidences).toContain(85);
  });

  it('recovers via the fallback provider when the primary throws', async () => {
    mockPrimaryMeta.mockRejectedValue(new Error('primary provider unavailable'));
    mockFallbackMeta.mockResolvedValue({
      insights: [createInsight({ confidence: 0.85 })],
      source: 'llm',
      executionTimeMs: 9,
    });

    await processInsightJob(createMockJob());

    expect(mockFallbackMeta).toHaveBeenCalledOnce();
    expect(mockGenerateFallbackInsights).not.toHaveBeenCalled();
    const confidences = mockCreate.mock.calls.map((c: any[]) => c[0].data.confidence);
    expect(confidences).toContain(85);
  });

  it('keeps the heuristic when the fallback provider also degrades to a heuristic', async () => {
    mockPrimaryMeta.mockRejectedValue(new Error('primary provider unavailable'));
    // Fallback provider ALSO degraded → not a real recovery (source:'fallback').
    mockFallbackMeta.mockResolvedValue({
      insights: [createInsight({ confidence: 0.4 })],
      source: 'fallback',
      executionTimeMs: 7,
    });

    await processInsightJob(createMockJob());

    expect(mockFallbackMeta).toHaveBeenCalledOnce();
    // tryInsightFallbackProvider returned null → per-chain heuristic stands.
    expect(mockGenerateFallbackInsights).toHaveBeenCalled();
    const confidences = mockCreate.mock.calls.map((c: any[]) => c[0].data.confidence);
    confidences.forEach((c: number) => expect(c).toBe(40));
  });

  it('keeps the heuristic when the fallback provider also throws', async () => {
    mockPrimaryMeta.mockRejectedValue(new Error('primary provider unavailable'));
    mockFallbackMeta.mockRejectedValue(new Error('fallback provider unavailable'));

    await processInsightJob(createMockJob());

    expect(mockFallbackMeta).toHaveBeenCalledOnce();
    expect(mockGenerateFallbackInsights).toHaveBeenCalled();
    const confidences = mockCreate.mock.calls.map((c: any[]) => c[0].data.confidence);
    confidences.forEach((c: number) => expect(c).toBe(40));
  });

  it('keeps the primary heuristic when it degrades and the fallback also degrades', async () => {
    // Primary degraded (source:'fallback'); the secondary provider is tried but
    // ALSO degrades → tryInsightFallbackProvider returns null → the primary's
    // own heuristic result stands (it is NOT re-derived via generateFallbackInsights).
    mockPrimaryMeta.mockResolvedValue({
      insights: [createInsight({ confidence: 0.4 })],
      source: 'fallback',
      executionTimeMs: 5,
    });
    mockFallbackMeta.mockResolvedValue({
      insights: [createInsight({ confidence: 0.4 })],
      source: 'fallback',
      executionTimeMs: 6,
    });

    await processInsightJob(createMockJob());

    expect(mockFallbackMeta).toHaveBeenCalledOnce();
    // The primary's degraded result is used directly — no second heuristic pass.
    expect(mockGenerateFallbackInsights).not.toHaveBeenCalled();
    const confidences = mockCreate.mock.calls.map((c: any[]) => c[0].data.confidence);
    confidences.forEach((c: number) => expect(c).toBe(40));
  });

  it('recovers when the primary rejects with a non-Error value', async () => {
    // Non-Error rejection exercises the String(error) branch of the recovery log.
    mockPrimaryMeta.mockRejectedValue('primary provider string failure');
    mockFallbackMeta.mockResolvedValue({
      insights: [createInsight({ confidence: 0.85 })],
      source: 'llm',
      executionTimeMs: 8,
    });

    await processInsightJob(createMockJob());

    expect(mockFallbackMeta).toHaveBeenCalledOnce();
    const confidences = mockCreate.mock.calls.map((c: any[]) => c[0].data.confidence);
    expect(confidences).toContain(85);
  });

  it('falls back to the heuristic when the primary rejects with a non-Error and no recovery', async () => {
    // Non-Error rejection + failed fallback exercises the String(error) branch of
    // the final heuristic log.
    mockPrimaryMeta.mockRejectedValue('primary provider string failure');
    mockFallbackMeta.mockRejectedValue('fallback provider string failure');

    await processInsightJob(createMockJob());

    expect(mockFallbackMeta).toHaveBeenCalledOnce();
    expect(mockGenerateFallbackInsights).toHaveBeenCalled();
    const confidences = mockCreate.mock.calls.map((c: any[]) => c[0].data.confidence);
    confidences.forEach((c: number) => expect(c).toBe(40));
  });
});
