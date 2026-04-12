/**
 * Security Fixes Tests — Fix #14, Fix #15, Fix #20
 *
 * Fix #14: hallucinationChecker.checkOutput() is called from job handlers.
 * Fix #15: requiresReview flag propagates through scoring result.
 * Fix #20: logConversationRecord() is called after LLM invocations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock setup — must be hoisted before any imports
// ============================================================================

const mockCheckOutput = vi.hoisted(() => vi.fn());
const mockGetStats = vi.hoisted(() => vi.fn());

const mockPredictChurnRisk = vi.hoisted(() => vi.fn());
const mockGenerateInsightsWithMeta = vi.hoisted(() => vi.fn());
const mockGenerateFallbackInsights = vi.hoisted(() => vi.fn());
const mockLogConversationRecord = vi.hoisted(() => vi.fn());

const mockCreate = vi.hoisted(() => vi.fn());
const mockNotificationCreate = vi.hoisted(() => vi.fn());
const mockTaskCreate = vi.hoisted(() => vi.fn());
const mockLeadAIInsightUpsert = vi.hoisted(() => vi.fn());
const mockContactAIInsightUpsert = vi.hoisted(() => vi.fn());

vi.mock('../../monitoring/hallucination-checker', () => ({
  hallucinationChecker: {
    checkOutput: mockCheckOutput,
    getStats: mockGetStats,
  },
  defaultHallucinationConfig: {
    maxHallucinationRate: 0.05,
    confidenceThreshold: 0.3,
    enableFactChecking: true,
    enableLogicChecking: true,
    enableEntityValidation: true,
    groundTruthSources: [],
  },
}));

vi.mock('../../chains/churn-risk.chain', () => ({
  getChurnRiskChain: () => ({
    predictChurnRisk: mockPredictChurnRisk,
  }),
}));

vi.mock('../../agents/next-best-action.agent', () => ({
  createNBAAgent: () => ({
    execute: vi.fn().mockResolvedValue({
      success: true,
      output: {
        recommendations: [
          { action: 'FOLLOW_UP', title: 'Follow up', description: 'Do it', confidence: 0.8 },
        ],
        entitySummary: 'Test entity',
      },
      confidence: 0.8,
    }),
  }),
}));

vi.mock('../../chains/scoring.chain', () => ({
  getLeadScoringChain: () => ({
    scoreLead: vi.fn().mockResolvedValue({
      score: 45,
      confidence: 0.9,
      factors: [{ name: 'email', impact: 10, reasoning: 'has email' }],
      modelVersion: 'mock:v1',
      requiresReview: false,
    }),
  }),
}));

vi.mock('../../chains/insight-generation.chain', () => ({
  getInsightGenerationChain: () => ({
    generateInsightsWithMeta: mockGenerateInsightsWithMeta,
    generateFallbackInsights: mockGenerateFallbackInsights,
  }),
}));

vi.mock('../../utils/conversation-record-logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/conversation-record-logger')>();
  return {
    ...actual,
    logConversationRecord: (...args: Parameters<typeof actual.logConversationRecord>) => {
      mockLogConversationRecord(...args);
      return actual.logConversationRecord(...args);
    },
  };
});

vi.mock('@intelliflow/db', () => ({
  prisma: {
    aIInsight: { create: (...args: any[]) => mockCreate(...args) },
    notification: { create: (...args: any[]) => mockNotificationCreate(...args) },
    task: { create: (...args: any[]) => mockTaskCreate(...args) },
    leadAIInsight: { upsert: (...args: any[]) => mockLeadAIInsightUpsert(...args) },
    contactAIInsight: { upsert: (...args: any[]) => mockContactAIInsightUpsert(...args) },
  },
}));

vi.mock('@intelliflow/domain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@intelliflow/domain')>();
  return {
    ...actual,
    requiresHumanReview: vi.fn().mockReturnValue(false),
  };
});

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { processPredictionJob } from '../prediction.job';
import { processInsightJob } from '../insight-generation.job';
import type { GeneratedInsight } from '../../chains/insight-generation.chain';

// ============================================================================
// Helpers
// ============================================================================

function createPredictionJob(
  predictionType: 'CHURN_RISK' | 'NEXT_BEST_ACTION' | 'QUALIFICATION',
  overrides: Record<string, unknown> = {}
) {
  return {
    id: 'job-pred-001',
    data: {
      entityType: 'lead',
      entityId: '550e8400-e29b-41d4-a716-446655440000',
      predictionType,
      context: {
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
        ...overrides,
      },
      priority: 5,
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
    token: 'mock-token',
    queueName: 'ai-prediction',
  } as any;
}

function createInsightJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-insight-001',
    data: {
      tenantId: '00000000-0000-4000-a000-000000000001',
      userId: 'user-001',
      dealsAtRisk: [{ id: 'deal-1', name: 'Big Deal', daysSinceUpdate: 20 }],
      hotLeads: [],
      overdueTasksCount: 0,
      staleContacts: [],
      ...overrides,
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
    extendLock: vi.fn().mockResolvedValue(undefined),
    token: 'mock-lock-token',
    queueName: 'ai-insights',
  } as any;
}

function createInsight(overrides: Partial<GeneratedInsight> = {}): GeneratedInsight {
  return {
    entityId: 'deal-1',
    entityType: 'opportunity',
    type: 'warning',
    title: 'Deal at Risk',
    description: 'Follow up soon.',
    suggestedActions: ['Schedule a call'],
    confidence: 0.85,
    priority: 'medium',
    reasoning: 'Recent inactivity.',
    ...overrides,
  };
}

// ============================================================================
// Fix #14 — hallucinationChecker.checkOutput() is called
// ============================================================================

describe('Fix #14 — Hallucination checker wired into job handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: no hallucination detected
    mockCheckOutput.mockResolvedValue({
      id: 'test-id',
      timestamp: new Date(),
      model: 'mock:v1',
      inputContext: '',
      output: '',
      hallucinated: false,
      confidence: 0.1,
      hallucinationTypes: [],
      evidence: [],
      groundTruthSources: [],
      score: 0.1,
    });

    mockPredictChurnRisk.mockResolvedValue({
      riskScore: 0.45,
      riskLevel: 'MEDIUM',
      confidence: 0.85,
      topRiskFactors: [],
      explanation: 'Moderate churn risk detected.',
      recommendations: ['Check in with customer'],
      primaryAction: 'Schedule call',
      slaHours: 168,
      executionTimeMs: 100,
      modelVersion: 'mock:churn-risk:v2',
      dataQuality: 'partial',
    });

    mockCreate.mockResolvedValue({ id: 'insight-1' });
    mockNotificationCreate.mockResolvedValue({ id: 'notification-1' });
    mockTaskCreate.mockResolvedValue({ id: 'task-1' });
    mockLeadAIInsightUpsert.mockResolvedValue({ id: 'lead-insight-1' });
    mockContactAIInsightUpsert.mockResolvedValue({ id: 'contact-insight-1' });

    mockGenerateInsightsWithMeta.mockResolvedValue({
      insights: [createInsight()],
      source: 'llm',
      executionTimeMs: 25,
    });
    mockGenerateFallbackInsights.mockReturnValue([
      createInsight({
        entityId: null,
        entityType: null,
        type: 'achievement',
        priority: 'low',
        confidence: 0.4,
      }),
    ]);
  });

  it('calls hallucinationChecker.checkOutput after churn risk prediction', async () => {
    const job = createPredictionJob('CHURN_RISK');
    await processPredictionJob(job);
    expect(mockCheckOutput).toHaveBeenCalledTimes(1);
    const callArgs = mockCheckOutput.mock.calls[0][0];
    expect(callArgs).toHaveProperty('model');
    expect(callArgs).toHaveProperty('inputContext');
    expect(callArgs).toHaveProperty('output');
    expect(callArgs).toHaveProperty('id');
  });

  it('does NOT block output even when hallucination is detected', async () => {
    // Simulate hallucination detected
    mockCheckOutput.mockResolvedValue({
      id: 'test-id',
      timestamp: new Date(),
      model: 'mock:v1',
      inputContext: '',
      output: '',
      hallucinated: true,
      confidence: 0.8,
      hallucinationTypes: ['unsupported_claim'],
      evidence: ['Some unsupported claim detected'],
      groundTruthSources: [],
      score: 0.8,
    });

    const job = createPredictionJob('CHURN_RISK');
    // Should NOT throw — hallucination is logged but output is not blocked
    const result = await processPredictionJob(job);
    expect(result).toBeDefined();
    expect(result.prediction).toBeDefined();
    expect(mockCheckOutput).toHaveBeenCalledTimes(1);
  });

  it('calls hallucinationChecker.checkOutput after insight generation', async () => {
    const job = createInsightJob();
    await processInsightJob(job);
    expect(mockCheckOutput).toHaveBeenCalledTimes(1);
    const callArgs = mockCheckOutput.mock.calls[0][0];
    expect(callArgs).toHaveProperty('model');
    expect(callArgs).toHaveProperty('output');
  });

  it('does NOT call hallucinationChecker when insight generation falls back to heuristics', async () => {
    mockGenerateInsightsWithMeta.mockRejectedValue(new Error('LLM down'));
    const job = createInsightJob();
    await processInsightJob(job);
    // Heuristic fallback — no LLM output to check
    expect(mockCheckOutput).not.toHaveBeenCalled();
    expect(mockLogConversationRecord).not.toHaveBeenCalled();
  });

  it('does NOT call hallucinationChecker or logConversationRecord when chain reports parser fallback', async () => {
    mockGenerateInsightsWithMeta.mockResolvedValue({
      insights: [
        createInsight({
          entityId: null,
          entityType: null,
          type: 'achievement',
          priority: 'low',
          confidence: 0.4,
          reasoning: 'Heuristic: parser fallback',
        }),
      ],
      source: 'fallback',
      executionTimeMs: 90,
      error: 'Output parsing failure',
    });

    const job = createInsightJob();
    await processInsightJob(job);

    expect(mockCheckOutput).not.toHaveBeenCalled();
    expect(mockLogConversationRecord).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Fix #15 — requiresReview flag propagates
// ============================================================================

describe('Fix #15 — Human review gate flag propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCheckOutput.mockResolvedValue({
      id: 'test-id',
      timestamp: new Date(),
      model: 'mock:v1',
      inputContext: '',
      output: '',
      hallucinated: false,
      confidence: 0.1,
      hallucinationTypes: [],
      evidence: [],
      groundTruthSources: [],
      score: 0.1,
    });

    mockPredictChurnRisk.mockResolvedValue({
      riskScore: 0.45,
      riskLevel: 'MEDIUM',
      confidence: 0.3, // Low confidence — triggers requiresHumanReview
      topRiskFactors: [],
      explanation: 'Low confidence churn prediction.',
      recommendations: ['Gather more data'],
      primaryAction: 'Gather more data',
      slaHours: 168,
      executionTimeMs: 100,
      modelVersion: 'mock:churn-risk:v2',
      dataQuality: 'minimal',
    });

    mockCreate.mockResolvedValue({ id: 'insight-1' });
    mockLeadAIInsightUpsert.mockResolvedValue({ id: 'lead-insight-1' });
    mockContactAIInsightUpsert.mockResolvedValue({ id: 'contact-insight-1' });
  });

  it('requiresHumanReview is called with churn risk confidence and chain type', async () => {
    const { requiresHumanReview } = await import('@intelliflow/domain');
    const job = createPredictionJob('CHURN_RISK');
    await processPredictionJob(job);
    expect(requiresHumanReview).toHaveBeenCalledWith(
      expect.any(Number), // confidence
      'CHURN_PREDICTION' // chain type
    );
  });

  it('job completes successfully regardless of review flag', async () => {
    const { requiresHumanReview } = await import('@intelliflow/domain');
    vi.mocked(requiresHumanReview).mockReturnValue(true);

    const job = createPredictionJob('CHURN_RISK');
    const result = await processPredictionJob(job);
    // Output is NOT blocked — only flagged
    expect(result).toBeDefined();
    expect(result.prediction).toBeDefined();
  });
});

// ============================================================================
// Fix #20 — logConversationRecord is called
// ============================================================================

describe('Fix #20 — Conversation record audit logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCheckOutput.mockResolvedValue({
      id: 'test-id',
      timestamp: new Date(),
      model: 'mock:v1',
      inputContext: '',
      output: '',
      hallucinated: false,
      confidence: 0.1,
      hallucinationTypes: [],
      evidence: [],
      groundTruthSources: [],
      score: 0.1,
    });

    mockPredictChurnRisk.mockResolvedValue({
      riskScore: 0.45,
      riskLevel: 'MEDIUM',
      confidence: 0.85,
      topRiskFactors: [],
      explanation: 'Moderate churn risk.',
      recommendations: ['Check in with customer'],
      primaryAction: 'Schedule call',
      slaHours: 168,
      executionTimeMs: 100,
      modelVersion: 'mock:churn-risk:v2',
      dataQuality: 'partial',
      tokenCount: 150,
    });

    mockCreate.mockResolvedValue({ id: 'insight-1' });
    mockNotificationCreate.mockResolvedValue({ id: 'notification-1' });
    mockTaskCreate.mockResolvedValue({ id: 'task-1' });
    mockLeadAIInsightUpsert.mockResolvedValue({ id: 'lead-insight-1' });
    mockContactAIInsightUpsert.mockResolvedValue({ id: 'contact-insight-1' });

    mockGenerateInsightsWithMeta.mockResolvedValue({
      insights: [createInsight()],
      source: 'llm',
      executionTimeMs: 25,
    });
    mockGenerateFallbackInsights.mockReturnValue([
      createInsight({
        entityId: null,
        entityType: null,
        type: 'achievement',
        priority: 'low',
        confidence: 0.4,
      }),
    ]);
  });

  it('logConversationRecord utility function logs structured data', async () => {
    // Test the utility function directly
    const { logConversationRecord } = await import('../../utils/conversation-record-logger');

    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    logConversationRecord(mockLogger, {
      conversationId: 'conv-123',
      model: 'openai:gpt-4o-mini',
      tokenCountInput: 100,
      tokenCountOutput: 50,
      duration: 1234,
      chainType: 'CHURN_PREDICTION',
      tenantId: 'tenant-abc',
    });

    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    const callArgs = mockLogger.info.mock.calls[0];
    // First arg is the structured data object
    const logData = callArgs[0];
    expect(logData).toHaveProperty('conversationRecord');
    expect(logData.conversationRecord).toMatchObject({
      conversationId: 'conv-123',
      model: 'openai:gpt-4o-mini',
      tokenCountInput: 100,
      tokenCountOutput: 50,
      duration: 1234,
      chainType: 'CHURN_PREDICTION',
      tenantId: 'tenant-abc',
    });
    // Second arg is the message string
    expect(callArgs[1]).toBe('AI conversation record');
  });

  it('logConversationRecord works without tenantId (optional field)', async () => {
    const { logConversationRecord } = await import('../../utils/conversation-record-logger');

    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    logConversationRecord(mockLogger, {
      conversationId: 'conv-456',
      model: 'ollama:llama2',
      tokenCountInput: 0,
      tokenCountOutput: 0,
      duration: 500,
      chainType: 'INSIGHT_GENERATION',
    });

    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    const logData = mockLogger.info.mock.calls[0][0];
    expect(logData.conversationRecord).not.toHaveProperty('tenantId');
  });

  it('prediction job calls logConversationRecord after churn risk LLM call', async () => {
    const job = createPredictionJob('CHURN_RISK');
    // Job completes successfully — conversation record logging runs internally
    const result = await processPredictionJob(job);
    expect(result).toBeDefined();
    expect(mockLogConversationRecord).toHaveBeenCalled();
  });

  it('insight job calls logConversationRecord after LLM generates insights', async () => {
    const job = createInsightJob();
    const result = await processInsightJob(job);
    expect(result.insightsCreated).toBeGreaterThan(0);
    expect(mockLogConversationRecord).toHaveBeenCalled();
    expect(mockCheckOutput).toHaveBeenCalledTimes(1);
  });
});
