/**
 * H10 Fallback Resilience Tests
 *
 * Verifies that scoring.job.ts and prediction.job.ts return heuristic fallbacks
 * (not throws) when the LLM is unavailable, times out, or the circuit breaker
 * is open.
 *
 * All fallbacks must:
 * - Be independent of any LLM call
 * - Have confidence = 0.3
 * - Have modelVersion = 'fallback' (scoring) or static explanation text (prediction)
 * - NOT throw — they return a valid result that persists to the DB
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

// ============================================================================
// Hoisted mocks
// ============================================================================

const mockScoreLead = vi.hoisted(() => vi.fn());
const mockPredictChurnRisk = vi.hoisted(() => vi.fn());
const mockNBAExecute = vi.hoisted(() => vi.fn());
const mockQualScoreLead = vi.hoisted(() => vi.fn());
const mockLeadAIInsightUpsert = vi.hoisted(() => vi.fn());
const mockContactAIInsightUpsert = vi.hoisted(() => vi.fn());
const mockNotificationCreate = vi.hoisted(() => vi.fn());
const mockLogAIAgentAction = vi.hoisted(() => vi.fn());
const mockLogConversationRecord = vi.hoisted(() => vi.fn());
const mockCheckOutput = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ hallucinated: false, score: 0, hallucinationTypes: [] })
);
const mockRequiresHumanReview = vi.hoisted(() => vi.fn().mockReturnValue(false));

// The circuit breaker stub — OPEN (always throws) so we can test fallback without timeout
class _OpenCircuitBreaker {
  async execute<T>(_fn: () => Promise<T>): Promise<T> {
    throw new Error('Circuit breaker is OPEN - too many failures');
  }
  getState() {
    return { state: 'OPEN' as const, failureCount: 5, lastFailureTime: Date.now() };
  }
  reset() {}
}
const openBreaker = new _OpenCircuitBreaker();
const mockGetLLMBreaker = vi.hoisted(() => vi.fn(() => openBreaker));

// ============================================================================
// vi.mock calls
// ============================================================================

vi.mock('../../lib/llm-factory', () => ({
  getLLMBreaker: mockGetLLMBreaker,
  __resetBreakers: vi.fn(),
  // No provider fallback configured — these tests exercise the HEURISTIC path
  // (breaker OPEN → heuristic), so resolveFallbackProvider must return null (#324).
  resolveFallbackProvider: () => null,
  createLLM: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({ content: '{}' }),
    withStructuredOutput: vi.fn(() => ({ invoke: vi.fn().mockResolvedValue({}) })),
  })),
  createEmbeddings: vi.fn(() => ({
    embedQuery: vi.fn().mockResolvedValue([]),
    embedDocuments: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../../chains/scoring.chain', () => {
  class LeadScoringChain {
    scoreLead = mockScoreLead;
  }
  return {
    leadScoringChain: { scoreLead: mockScoreLead },
    LeadScoringChain,
    getLeadScoringChain: () => ({ scoreLead: mockQualScoreLead }),
  };
});

vi.mock('../../chains/churn-risk.chain', () => {
  class ChurnRiskChain {
    predictChurnRisk = mockPredictChurnRisk;
  }
  return {
    getChurnRiskChain: () => ({ predictChurnRisk: mockPredictChurnRisk }),
    ChurnRiskChain,
  };
});

vi.mock('../../agents/next-best-action.agent', () => ({
  createNBAAgent: () => ({ execute: mockNBAExecute }),
}));

vi.mock('@intelliflow/db', () => ({
  prisma: {
    leadAIInsight: { upsert: mockLeadAIInsightUpsert },
    contactAIInsight: { upsert: mockContactAIInsightUpsert },
    notification: { create: mockNotificationCreate },
    lead: {
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('../../utils/audit-log', () => ({
  logAIAgentAction: mockLogAIAgentAction,
}));

vi.mock('../../utils/conversation-record-logger', () => ({
  logConversationRecord: mockLogConversationRecord,
}));

vi.mock('../../monitoring/hallucination-checker', () => ({
  hallucinationChecker: { checkOutput: mockCheckOutput },
}));

vi.mock('@intelliflow/domain', () => ({
  requiresHumanReview: mockRequiresHumanReview,
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { processScoringJob } from '../scoring.job';
import { processPredictionJob } from '../prediction.job';

// ============================================================================
// Helpers
// ============================================================================

function makeScoringJob(
  overrides: Partial<{
    leadId: string;
    tenantId: string;
    email: string;
    title: string;
    company: string;
    companySize: number;
    source: string;
  }> = {}
): Job<any> {
  return {
    id: 'test-job-1',
    name: 'score-lead',
    queueName: 'ai-scoring',
    token: 'test-token',
    attemptsMade: 2,
    data: {
      leadId: overrides.leadId ?? '00000000-0000-4000-8000-000000000001',
      tenantId: overrides.tenantId ?? '00000000-0000-4000-8000-000000000002',
      lead: {
        email: overrides.email ?? 'test@example.com',
        title: overrides.title ?? 'VP Engineering',
        company: overrides.company ?? 'Acme Corp',
        source: overrides.source ?? 'website',
        metadata:
          overrides.companySize != null ? { companySize: overrides.companySize } : undefined,
      },
      correlationId: 'test-correlation',
      priority: 5,
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
    extendLock: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<any>;
}

function makePredictionJob(
  predictionType: string,
  context: Record<string, unknown> = {}
): Job<any> {
  return {
    id: 'test-pred-1',
    name: 'predict',
    queueName: 'ai-prediction',
    token: 'test-token',
    attemptsMade: 2,
    data: {
      entityType: 'lead',
      entityId: '00000000-0000-4000-8000-000000000003',
      predictionType,
      tenantId: '00000000-0000-4000-8000-000000000002',
      context: {
        userId: '00000000-0000-4000-8000-000000000010',
        ...context,
      },
      priority: 5,
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
    extendLock: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<any>;
}

// ============================================================================
// Tests
// ============================================================================

describe('H10 — Scoring fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadAIInsightUpsert.mockResolvedValue({});
    mockLogAIAgentAction.mockResolvedValue(undefined);
    // Breaker is OPEN — scoreLead will never be called
    mockScoreLead.mockResolvedValue({
      score: 99,
      confidence: 0.9,
      factors: [],
      modelVersion: 'gpt-4',
    });
  });

  it('returns heuristic fallback with confidence=0.3 when circuit breaker is OPEN', async () => {
    const job = makeScoringJob({ title: 'VP Engineering', company: 'Acme', source: 'website' });
    const result = await processScoringJob(job);

    // Must not throw — returns a valid result
    expect(result).toBeDefined();
    expect(result.confidence).toBe(0.3);
    expect(result.modelVersion).toBe('fallback');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    // LLM chain was never called (breaker is OPEN)
    expect(mockScoreLead).not.toHaveBeenCalled();
  });

  it('heuristic score is higher for VP-title + corporate domain vs unknown lead', async () => {
    const highJob = makeScoringJob({
      email: 'jane@bigcorp.com',
      title: 'VP Engineering',
      company: 'BigCorp',
      source: 'referral',
      companySize: 600,
    });
    const lowJob = makeScoringJob({
      email: 'anon@gmail.com',
      title: '',
      company: '',
      source: 'unknown',
    });

    const [highResult, lowResult] = await Promise.all([
      processScoringJob(highJob),
      processScoringJob(lowJob),
    ]);

    expect(highResult.score).toBeGreaterThan(lowResult.score);
    // Both are fallbacks
    expect(highResult.modelVersion).toBe('fallback');
    expect(lowResult.modelVersion).toBe('fallback');
  });

  it('fallback result is persisted to DB (LeadAIInsight)', async () => {
    const job = makeScoringJob();
    await processScoringJob(job);
    expect(mockLeadAIInsightUpsert).toHaveBeenCalledOnce();
    const upsertCall = mockLeadAIInsightUpsert.mock.calls[0][0];
    // M2: compound unique — where is now { leadId_tenantId: { leadId, tenantId } }
    expect(upsertCall).toHaveProperty('where.leadId_tenantId.leadId');
    expect(upsertCall.update).toHaveProperty('engagementScore');
  });

  it('fallback tier is COLD or WARM (not HOT) for a baseline lead', async () => {
    const job = makeScoringJob({ email: 'user@company.com', title: '', source: 'unknown' });
    const result = await processScoringJob(job);
    // Baseline score ~60 (corporate domain +10 = 60) → WARM
    expect(['COLD', 'WARM', 'UNQUALIFIED']).toContain(result.tier);
  });
});

describe('H10 — Prediction fallbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadAIInsightUpsert.mockResolvedValue({});
    mockLogAIAgentAction.mockResolvedValue(undefined);
    mockLogConversationRecord.mockReturnValue(undefined);
    mockCheckOutput.mockResolvedValue({ hallucinated: false, score: 0, hallucinationTypes: [] });
    mockRequiresHumanReview.mockReturnValue(false);
    // Chains will throw because breaker is OPEN
    mockPredictChurnRisk.mockResolvedValue({
      riskScore: 0.8,
      confidence: 0.9,
      explanation: 'high risk',
      recommendations: [],
      modelVersion: 'gpt-4',
      tokenCount: 10,
    });
    mockNBAExecute.mockResolvedValue({
      success: true,
      output: {
        recommendations: [{ action: 'CALL', title: 'Call', description: 'Do it', confidence: 0.9 }],
        entitySummary: 'summary',
      },
      confidence: 0.9,
    });
    mockQualScoreLead.mockResolvedValue({
      score: 85,
      confidence: 0.9,
      factors: [],
      modelVersion: 'gpt-4',
    });
  });

  it('CHURN_RISK: returns fallback with risk_score=0.5 and confidence=0.3 when breaker is OPEN', async () => {
    const job = makePredictionJob('CHURN_RISK');
    const result = await processPredictionJob(job);

    expect(result).toBeDefined();
    expect(result.predictionType).toBe('CHURN_RISK');
    expect(result.prediction.confidence).toBe(0.3);
    expect(result.prediction.value).toBe(0.5);
    // LLM chain not called (breaker OPEN)
    expect(mockPredictChurnRisk).not.toHaveBeenCalled();
  });

  it('CHURN_RISK: fallback explanation mentions LLM unavailability', async () => {
    const job = makePredictionJob('CHURN_RISK');
    const result = await processPredictionJob(job);
    expect(result.prediction.explanation).toMatch(/LLM unavailable|heuristic fallback/i);
  });

  it('NEXT_BEST_ACTION: returns fallback with FOLLOW_UP and confidence=0.3 when breaker is OPEN', async () => {
    const job = makePredictionJob('NEXT_BEST_ACTION');
    const result = await processPredictionJob(job);

    expect(result).toBeDefined();
    expect(result.predictionType).toBe('NEXT_BEST_ACTION');
    expect(result.prediction.confidence).toBe(0.3);
    expect(result.prediction.value).toBe('FOLLOW_UP');
    expect(result.recommendations).toContain('Contact lead');
    expect(mockNBAExecute).not.toHaveBeenCalled();
  });

  it('QUALIFICATION: returns fallback with NOT_QUALIFIED and confidence=0.3 when breaker is OPEN', async () => {
    const job = makePredictionJob('QUALIFICATION');
    const result = await processPredictionJob(job);

    expect(result).toBeDefined();
    expect(result.predictionType).toBe('QUALIFICATION');
    expect(result.prediction.confidence).toBe(0.3);
    expect(result.prediction.value).toBe('NOT_QUALIFIED');
    expect(mockQualScoreLead).not.toHaveBeenCalled();
  });

  it('all three fallbacks are independent of LLM — no chain calls made', async () => {
    const churnJob = makePredictionJob('CHURN_RISK');
    const nbaJob = makePredictionJob('NEXT_BEST_ACTION');
    const qualJob = makePredictionJob('QUALIFICATION');

    await Promise.all([
      processPredictionJob(churnJob),
      processPredictionJob(nbaJob),
      processPredictionJob(qualJob),
    ]);

    expect(mockPredictChurnRisk).not.toHaveBeenCalled();
    expect(mockNBAExecute).not.toHaveBeenCalled();
    expect(mockQualScoreLead).not.toHaveBeenCalled();
  });

  it('CHURN_RISK fallback result is persisted to DB', async () => {
    const job = makePredictionJob('CHURN_RISK');
    await processPredictionJob(job);
    expect(mockLeadAIInsightUpsert).toHaveBeenCalledOnce();
  });
});
