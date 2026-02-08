/**
 * Prediction Job Additional Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

const mockChurn = vi.fn();
vi.mock('../chains/churn-risk.chain', () => ({ getChurnRiskChain: vi.fn(() => ({ predictChurnRisk: mockChurn })) }));
const mockNBA = vi.fn();
vi.mock('../agents/next-best-action.agent', () => ({ createNBAAgent: vi.fn(() => ({ execute: mockNBA })) }));
const mockScore = vi.fn();
vi.mock('../chains/scoring.chain', () => ({ getLeadScoringChain: vi.fn(() => ({ scoreLead: mockScore })) }));
vi.mock('pino', () => ({ default: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() })) }));

import { processPredictionJob, type PredictionJobData } from './prediction.job';

function j(ov: Partial<PredictionJobData> = {}): Job<PredictionJobData> {
  return { id: 'j1', data: { entityType: 'lead', entityId: '123e4567-e89b-12d3-a456-426614174000', predictionType: 'CHURN_RISK', context: {}, priority: 5, ...ov }, updateProgress: vi.fn().mockResolvedValue(undefined), queueName: 'p' } as any;
}

describe('churn fallback', () => {
  beforeEach(() => vi.clearAllMocks());
  it('Error fallback', async () => {
    mockChurn.mockRejectedValue(new Error('t'));
    const r = await processPredictionJob(j());
    expect(r.prediction.value).toBe(0.5);
    expect(r.prediction.confidence).toBe(0.3);
  });
  it('non-Error fallback', async () => {
    mockChurn.mockRejectedValue('s');
    const r = await processPredictionJob(j());
    expect(r.prediction.explanation).toContain('Unknown error');
  });
});

describe('NBA fallback', () => {
  beforeEach(() => vi.clearAllMocks());
  it('missing tenantId', async () => {
    await expect(processPredictionJob(j({ predictionType: 'NEXT_BEST_ACTION', context: { userId: 'u' } }))).rejects.toThrow('tenantId');
  });
  it('missing userId', async () => {
    await expect(processPredictionJob(j({ predictionType: 'NEXT_BEST_ACTION', context: { tenantId: 't' } }))).rejects.toThrow('userId');
  });
  it('Error fallback', async () => {
    mockNBA.mockRejectedValue(new Error('f'));
    const r = await processPredictionJob(j({ predictionType: 'NEXT_BEST_ACTION', context: { tenantId: 't', userId: 'u' } }));
    expect(r.prediction.value).toBe('FOLLOW_UP');
  });
  it('success=false fallback', async () => {
    mockNBA.mockResolvedValue({ success: false, output: null, error: 'x' });
    const r = await processPredictionJob(j({ predictionType: 'NEXT_BEST_ACTION', context: { tenantId: 't', userId: 'u' } }));
    expect(r.prediction.value).toBe('FOLLOW_UP');
  });
  it('null output fallback', async () => {
    mockNBA.mockResolvedValue({ success: true, output: null });
    const r = await processPredictionJob(j({ predictionType: 'NEXT_BEST_ACTION', context: { tenantId: 't', userId: 'u' } }));
    expect(r.prediction.value).toBe('FOLLOW_UP');
  });
  it('extract top rec', async () => {
    mockNBA.mockResolvedValue({ success: true, output: { entitySummary: 'S', recommendations: [{ action: 'CALL', title: 'C', description: 'D', confidence: 0.9 }] }, confidence: 0.8 });
    const r = await processPredictionJob(j({ predictionType: 'NEXT_BEST_ACTION', context: { tenantId: 't', userId: 'u' } }));
    expect(r.prediction.value).toBe('CALL');
  });
});

describe('qualification tiers', () => {
  beforeEach(() => vi.clearAllMocks());
  const f = [{ name: 'x', impact: 0.5, reasoning: 'ok' }];
  it('HIGHLY_QUALIFIED >=80', async () => { mockScore.mockResolvedValue({ score: 85, confidence: 0.9, factors: f }); expect((await processPredictionJob(j({ predictionType: 'QUALIFICATION' }))).prediction.value).toBe('HIGHLY_QUALIFIED'); });
  it('QUALIFIED >=60', async () => { mockScore.mockResolvedValue({ score: 65, confidence: 0.8, factors: f }); expect((await processPredictionJob(j({ predictionType: 'QUALIFICATION' }))).prediction.value).toBe('QUALIFIED'); });
  it('NURTURE >=40', async () => { mockScore.mockResolvedValue({ score: 45, confidence: 0.7, factors: f }); expect((await processPredictionJob(j({ predictionType: 'QUALIFICATION' }))).prediction.value).toBe('NURTURE'); });
  it('DEVELOPING >=20', async () => { mockScore.mockResolvedValue({ score: 25, confidence: 0.6, factors: f }); expect((await processPredictionJob(j({ predictionType: 'QUALIFICATION' }))).prediction.value).toBe('DEVELOPING'); });
  it('NOT_QUALIFIED <20', async () => { mockScore.mockResolvedValue({ score: 10, confidence: 0.5, factors: f }); expect((await processPredictionJob(j({ predictionType: 'QUALIFICATION' }))).prediction.value).toBe('NOT_QUALIFIED'); });
  it('negative factor recs', async () => {
    mockScore.mockResolvedValue({ score: 70, confidence: 0.8, factors: [{ name: 'e', impact: 0.9, reasoning: 'y' }, { name: 'budget', impact: -0.5, reasoning: 'low' }] });
    const r = await processPredictionJob(j({ predictionType: 'QUALIFICATION' }));
    expect(r.recommendations.some((s: string) => s.includes('budget'))).toBe(true);
  });
});

describe('qualification error', () => {
  beforeEach(() => vi.clearAllMocks());
  it('NEEDS_REVIEW on Error', async () => { mockScore.mockRejectedValue(new Error('m')); expect((await processPredictionJob(j({ predictionType: 'QUALIFICATION' }))).prediction.value).toBe('NEEDS_REVIEW'); });
  it('NEEDS_REVIEW on non-Error', async () => { mockScore.mockRejectedValue('f'); expect((await processPredictionJob(j({ predictionType: 'QUALIFICATION' }))).prediction.explanation).toContain('Unknown error'); });
});

describe('unknown type', () => {
  it('should throw', async () => { await expect(processPredictionJob(j({ predictionType: 'X' as any }))).rejects.toThrow('Unknown prediction type'); });
});
