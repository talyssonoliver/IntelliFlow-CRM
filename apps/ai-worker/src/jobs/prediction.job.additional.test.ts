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
vi.mock('pino', () => ({
  default: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() })),
}));

import { processPredictionJob, type PredictionJobData } from './prediction.job';

function j(ov: Partial<PredictionJobData> = {}): Job<PredictionJobData> {
  return {
    id: 'j1',
    data: {
      entityType: 'lead',
      entityId: '123e4567-e89b-12d3-a456-426614174000',
      predictionType: 'CHURN_RISK',
      context: {},
      priority: 5,
      ...ov,
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
    queueName: 'p',
  } as any;
}

describe('churn error propagation', () => {
  beforeEach(() => vi.clearAllMocks());
  it('propagates Error for retry', async () => {
    mockChurn.mockRejectedValue(new Error('t'));
    await expect(processPredictionJob(j())).rejects.toThrow('t');
  });
  it('propagates non-Error for retry', async () => {
    mockChurn.mockRejectedValue('s');
    await expect(processPredictionJob(j())).rejects.toBe('s');
  });
});

describe('NBA fallback', () => {
  beforeEach(() => vi.clearAllMocks());
  it('missing tenantId', async () => {
    await expect(
      processPredictionJob(j({ predictionType: 'NEXT_BEST_ACTION', context: { userId: 'u' } }))
    ).rejects.toThrow('tenantId');
  });
  it('missing userId', async () => {
    await expect(
      processPredictionJob(j({ predictionType: 'NEXT_BEST_ACTION', context: { tenantId: 't' } }))
    ).rejects.toThrow('userId');
  });
  it('propagates Error for retry', async () => {
    mockNBA.mockRejectedValue(new Error('f'));
    await expect(
      processPredictionJob(
        j({ predictionType: 'NEXT_BEST_ACTION', context: { tenantId: 't', userId: 'u' } })
      )
    ).rejects.toThrow('f');
  });
  it('throws on success=false', async () => {
    mockNBA.mockResolvedValue({ success: false, output: null, error: 'x' });
    await expect(
      processPredictionJob(
        j({ predictionType: 'NEXT_BEST_ACTION', context: { tenantId: 't', userId: 'u' } })
      )
    ).rejects.toThrow('x');
  });
  it('throws on null output', async () => {
    mockNBA.mockResolvedValue({ success: true, output: null });
    await expect(
      processPredictionJob(
        j({ predictionType: 'NEXT_BEST_ACTION', context: { tenantId: 't', userId: 'u' } })
      )
    ).rejects.toThrow('NBA agent returned no output');
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

describe('qualification tiers', () => {
  beforeEach(() => vi.clearAllMocks());
  const f = [{ name: 'x', impact: 0.5, reasoning: 'ok' }];
  it('HIGHLY_QUALIFIED >=80', async () => {
    mockScore.mockResolvedValue({ score: 85, confidence: 0.9, factors: f });
    expect(
      (await processPredictionJob(j({ predictionType: 'QUALIFICATION' }))).prediction.value
    ).toBe('HIGHLY_QUALIFIED');
  });
  it('QUALIFIED >=60', async () => {
    mockScore.mockResolvedValue({ score: 65, confidence: 0.8, factors: f });
    expect(
      (await processPredictionJob(j({ predictionType: 'QUALIFICATION' }))).prediction.value
    ).toBe('QUALIFIED');
  });
  it('NURTURE >=40', async () => {
    mockScore.mockResolvedValue({ score: 45, confidence: 0.7, factors: f });
    expect(
      (await processPredictionJob(j({ predictionType: 'QUALIFICATION' }))).prediction.value
    ).toBe('NURTURE');
  });
  it('DEVELOPING >=20', async () => {
    mockScore.mockResolvedValue({ score: 25, confidence: 0.6, factors: f });
    expect(
      (await processPredictionJob(j({ predictionType: 'QUALIFICATION' }))).prediction.value
    ).toBe('DEVELOPING');
  });
  it('NOT_QUALIFIED <20', async () => {
    mockScore.mockResolvedValue({ score: 10, confidence: 0.5, factors: f });
    expect(
      (await processPredictionJob(j({ predictionType: 'QUALIFICATION' }))).prediction.value
    ).toBe('NOT_QUALIFIED');
  });
  it('negative factor recs', async () => {
    mockScore.mockResolvedValue({
      score: 70,
      confidence: 0.8,
      factors: [
        { name: 'e', impact: 0.9, reasoning: 'y' },
        { name: 'budget', impact: -0.5, reasoning: 'low' },
      ],
    });
    const r = await processPredictionJob(j({ predictionType: 'QUALIFICATION' }));
    expect(r.recommendations.some((s: string) => s.includes('budget'))).toBe(true);
  });
});

describe('qualification error propagation', () => {
  beforeEach(() => vi.clearAllMocks());
  it('propagates Error for retry', async () => {
    mockScore.mockRejectedValue(new Error('m'));
    await expect(
      processPredictionJob(j({ predictionType: 'QUALIFICATION' }))
    ).rejects.toThrow('m');
  });
  it('propagates non-Error for retry', async () => {
    mockScore.mockRejectedValue('f');
    await expect(
      processPredictionJob(j({ predictionType: 'QUALIFICATION' }))
    ).rejects.toBe('f');
  });
});

describe('unknown type', () => {
  it('should throw', async () => {
    await expect(processPredictionJob(j({ predictionType: 'X' as any }))).rejects.toThrow(
      'Unknown prediction type'
    );
  });
});
