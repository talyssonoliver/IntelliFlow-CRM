/**
 * Prediction Job Additional Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

const mockChurn = vi.fn();
vi.mock('../chains/churn-risk.chain', () => ({
  getChurnRiskChain: vi.fn(() => ({ predictChurnRisk: mockChurn })),
}));
const mockNBA = vi.fn();
vi.mock('../agents/next-best-action.agent', () => ({
  createNBAAgent: vi.fn(() => ({ execute: mockNBA })),
}));
const mockScore = vi.fn();
vi.mock('../chains/scoring.chain', () => ({
  getLeadScoringChain: vi.fn(() => ({ scoreLead: mockScore })),
}));
// M15: QUALIFICATION prediction type routes to LeadQualificationAgent.
// Use vi.hoisted() to avoid TDZ — the existing mocks here work because they
// share module-eval timing, but `mockQualify` referenced inside the factory
// was not guaranteed to be initialised when the factory first resolved.
const { mockQualify } = vi.hoisted(() => ({ mockQualify: vi.fn() }));
vi.mock('../agents/qualification.agent', () => ({
  qualificationAgent: { execute: mockQualify },
  createQualificationTask: vi.fn((input: unknown) => ({
    id: 'task',
    input,
    type: 'QUALIFICATION',
  })),
  LeadQualificationAgent: vi.fn(),
  getQualificationAgent: vi.fn(() => ({ execute: mockQualify })),
}));
vi.mock('pino', () => {
  const stdTimeFunctions = { isoTime: () => '' };
  const pino = vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }));
  (pino as any).stdTimeFunctions = stdTimeFunctions;
  return { default: pino };
});

// H9: stub the circuit breaker pool — always CLOSED, passes through to real chain mocks
vi.mock('../lib/llm-factory', () => {
  const stub = {
    execute: (fn: () => unknown) => fn(),
    getState: () => ({ state: 'CLOSED', failureCount: 0, lastFailureTime: 0 }),
    reset: () => {},
  };
  return {
    getLLMBreaker: vi.fn(() => stub),
    __resetBreakers: vi.fn(),
    createLLM: vi.fn(),
    createEmbeddings: vi.fn(),
  };
});

import { processPredictionJob, type PredictionJobData } from './prediction.job';

function j(ov: Partial<PredictionJobData> = {}): Job<PredictionJobData> {
  return {
    id: 'j1',
    data: {
      entityType: 'lead',
      entityId: '123e4567-e89b-12d3-a456-426614174000',
      predictionType: 'CHURN_RISK',
      tenantId: '00000000-0000-0000-0000-000000000001',
      context: {},
      priority: 5,
      ...ov,
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
    // prediction.job.ts extends the BullMQ lock during long LLM calls —
    // mirrors the mock shape in prediction.job.test.ts.
    token: 'test-lock-token',
    extendLock: vi.fn().mockResolvedValue(undefined),
    queueName: 'p',
  } as any;
}

describe('churn error propagation', () => {
  beforeEach(() => vi.clearAllMocks());
  // H10: churn errors now return a heuristic fallback instead of propagating.
  it('returns fallback (not throw) when chain rejects with Error', async () => {
    mockChurn.mockRejectedValue(new Error('t'));
    const result = await processPredictionJob(j());
    expect(result.prediction.confidence).toBe(0.3);
    expect(result.prediction.value).toBe(0.5);
  });
  it('returns fallback (not throw) when chain rejects with non-Error', async () => {
    mockChurn.mockRejectedValue('s');
    const result = await processPredictionJob(j());
    expect(result.prediction.confidence).toBe(0.3);
  });
});

describe('NBA fallback', () => {
  beforeEach(() => vi.clearAllMocks());
  it('missing top-level tenantId', async () => {
    // H5/M8 — tenantId now validated at the schema boundary.
    await expect(
      processPredictionJob(
        j({
          predictionType: 'NEXT_BEST_ACTION',
          tenantId: undefined as unknown as string,
          context: { userId: 'u' },
        })
      )
    ).rejects.toThrow('tenantId');
  });
  it('missing userId in context', async () => {
    await expect(
      processPredictionJob(j({ predictionType: 'NEXT_BEST_ACTION', context: {} }))
    ).rejects.toThrow('userId');
  });
  // H10: NBA errors now return a heuristic fallback instead of propagating.
  it('returns fallback (not throw) when agent rejects with Error', async () => {
    mockNBA.mockRejectedValue(new Error('f'));
    const result = await processPredictionJob(
      j({ predictionType: 'NEXT_BEST_ACTION', context: { tenantId: 't', userId: 'u' } })
    );
    expect(result.prediction.confidence).toBe(0.3);
    expect(result.prediction.value).toBe('FOLLOW_UP');
  });
  it('returns fallback when agent returns success=false', async () => {
    mockNBA.mockResolvedValue({ success: false, output: null, error: 'x' });
    const result = await processPredictionJob(
      j({ predictionType: 'NEXT_BEST_ACTION', context: { tenantId: 't', userId: 'u' } })
    );
    expect(result.prediction.confidence).toBe(0.3);
    expect(result.prediction.value).toBe('FOLLOW_UP');
  });
  it('returns fallback when agent returns null output', async () => {
    mockNBA.mockResolvedValue({ success: true, output: null });
    const result = await processPredictionJob(
      j({ predictionType: 'NEXT_BEST_ACTION', context: { tenantId: 't', userId: 'u' } })
    );
    expect(result.prediction.confidence).toBe(0.3);
    expect(result.prediction.value).toBe('FOLLOW_UP');
  });
  it('extract top rec', async () => {
    mockNBA.mockResolvedValue({
      success: true,
      output: {
        entitySummary: 'S',
        recommendations: [{ action: 'CALL', title: 'C', description: 'D', confidence: 0.9 }],
      },
      confidence: 0.8,
    });
    const r = await processPredictionJob(
      j({ predictionType: 'NEXT_BEST_ACTION', context: { tenantId: 't', userId: 'u' } })
    );
    expect(r.prediction.value).toBe('CALL');
  });
});

describe('qualification tiers (M15 — via LeadQualificationAgent)', () => {
  beforeEach(() => vi.clearAllMocks());

  function agentOutput(
    level: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNQUALIFIED',
    extra: Record<string, unknown> = {}
  ) {
    return {
      success: true,
      output: {
        qualificationLevel: level,
        qualified: level !== 'UNQUALIFIED',
        reasoning: 'mocked',
        nextSteps: [],
        recommendedActions: [],
        ...extra,
      },
      confidence: 0.8,
      agentName: 'LeadQualificationAgent',
      taskId: 'task',
      timestamp: new Date(),
      metadata: {},
      duration: 10,
    };
  }

  it('HIGH → HIGHLY_QUALIFIED', async () => {
    mockQualify.mockResolvedValue(agentOutput('HIGH'));
    expect(
      (await processPredictionJob(j({ predictionType: 'QUALIFICATION' }))).prediction.value
    ).toBe('HIGHLY_QUALIFIED');
  });
  it('MEDIUM → QUALIFIED', async () => {
    mockQualify.mockResolvedValue(agentOutput('MEDIUM'));
    expect(
      (await processPredictionJob(j({ predictionType: 'QUALIFICATION' }))).prediction.value
    ).toBe('QUALIFIED');
  });
  it('LOW → NURTURE', async () => {
    mockQualify.mockResolvedValue(agentOutput('LOW'));
    expect(
      (await processPredictionJob(j({ predictionType: 'QUALIFICATION' }))).prediction.value
    ).toBe('NURTURE');
  });
  it('UNQUALIFIED → NOT_QUALIFIED', async () => {
    mockQualify.mockResolvedValue(agentOutput('UNQUALIFIED'));
    expect(
      (await processPredictionJob(j({ predictionType: 'QUALIFICATION' }))).prediction.value
    ).toBe('NOT_QUALIFIED');
  });
  it('recommendedActions flow into prediction.recommendations', async () => {
    mockQualify.mockResolvedValue(
      agentOutput('MEDIUM', {
        recommendedActions: [{ priority: 'HIGH', action: 'Address budget concerns with tenant' }],
        nextSteps: ['Follow up in 7 days'],
      })
    );
    const r = await processPredictionJob(j({ predictionType: 'QUALIFICATION' }));
    expect(r.recommendations.some((s: string) => s.includes('budget'))).toBe(true);
  });
});

describe('qualification error propagation', () => {
  beforeEach(() => vi.clearAllMocks());
  // H10: qualification errors now return a heuristic fallback instead of propagating.
  // M15: the rejection now comes from the qualificationAgent (agent path), not LeadScoringChain.
  it('returns fallback (not throw) when agent rejects with Error', async () => {
    mockQualify.mockRejectedValue(new Error('m'));
    const result = await processPredictionJob(j({ predictionType: 'QUALIFICATION' }));
    expect(result.prediction.confidence).toBe(0.3);
    expect(result.prediction.value).toBe('NOT_QUALIFIED');
  });
  it('returns fallback (not throw) when agent rejects with non-Error', async () => {
    mockQualify.mockRejectedValue('f');
    const result = await processPredictionJob(j({ predictionType: 'QUALIFICATION' }));
    expect(result.prediction.confidence).toBe(0.3);
  });
});

describe('unknown type', () => {
  it('rejects invalid predictionType at input schema validation', async () => {
    // PredictionJobDataSchema.safeParse now catches invalid enum values before
    // the processing switch reaches its default branch — so "X" surfaces as a
    // Zod invalid_value error, not the internal "Unknown prediction type"
    // message the older default-branch throw used to emit.
    await expect(processPredictionJob(j({ predictionType: 'X' as any }))).rejects.toThrow(
      /invalid_value|Unknown prediction type/
    );
  });
});
