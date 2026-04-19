/**
 * Tenant Isolation Tests for Prediction Job (IFC-095 P1 Security Fix)
 *
 * Verifies that prediction jobs enforce mandatory tenant context,
 * preventing security violations from missing or invalid tenantId/userId.
 *
 * These tests verify the security fix at the job handler level.
 *
 * @see IFC-095 P1: Tenant isolation must be enforced
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

// Mock the AI chains before importing
vi.mock('../../chains/churn-risk.chain', () => ({
  getChurnRiskChain: vi.fn(() => ({
    predictChurnRisk: vi.fn().mockResolvedValue({
      riskScore: 0.5,
      riskLevel: 'MEDIUM',
      confidence: 0.8,
      topRiskFactors: [],
      explanation: 'Test explanation',
      recommendations: ['Test recommendation'],
      primaryAction: 'Test action',
      slaHours: 168,
      executionTimeMs: 100,
      modelVersion: 'test:v1',
    }),
  })),
}));

vi.mock('../../agents/next-best-action.agent', () => ({
  createNBAAgent: vi.fn(() => ({
    execute: vi.fn().mockResolvedValue({
      success: true,
      output: {
        recommendations: [
          {
            action: 'FOLLOW_UP',
            title: 'Test Action',
            description: 'Test description',
            confidence: 0.8,
          },
        ],
        entitySummary: 'Test entity summary',
      },
      confidence: 0.8,
    }),
  })),
}));

vi.mock('../../chains/scoring.chain', () => ({
  getLeadScoringChain: vi.fn(() => ({
    scoreLead: vi.fn().mockResolvedValue({
      score: 75,
      confidence: 0.85,
      factors: [],
      recommendations: ['Test'],
    }),
  })),
}));

import { processPredictionJob, type PredictionJobData } from '../prediction.job';

// Helper to create a mock BullMQ job
function createMockJob(data: Partial<PredictionJobData>): Job<PredictionJobData> {
  return {
    id: 'test-job-id',
    data: {
      entityType: 'lead',
      entityId: '550e8400-e29b-41d4-a716-446655440000',
      predictionType: 'NEXT_BEST_ACTION',
      tenantId: '550e8400-e29b-41d4-a716-446655440001',
      priority: 5,
      ...data,
    } as PredictionJobData,
    name: 'prediction',
    attemptsMade: 0,
    progress: vi.fn(),
    updateProgress: vi.fn(),
    log: vi.fn(),
    // prediction.job.ts extends the BullMQ lock during long LLM calls.
    token: 'test-lock-token',
    extendLock: vi.fn().mockResolvedValue(undefined),
  } as any; // partial mock of BullMQ Job<PredictionJobData>
}

describe('Prediction Job Tenant Isolation (IFC-095 P1 — H5/M8 top-level tenantId)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('NEXT_BEST_ACTION predictions', () => {
    it('rejects at schema level when top-level tenantId is missing', async () => {
      const job = createMockJob({
        predictionType: 'NEXT_BEST_ACTION',
        tenantId: undefined as unknown as string, // force-omit the default
        context: {
          userId: '550e8400-e29b-41d4-a716-446655440001',
        },
      });

      await expect(processPredictionJob(job)).rejects.toThrow('tenantId is required');
    });

    it('rejects at schema level when top-level tenantId is empty string', async () => {
      const job = createMockJob({
        predictionType: 'NEXT_BEST_ACTION',
        tenantId: '',
        context: {
          userId: '550e8400-e29b-41d4-a716-446655440001',
        },
      });

      await expect(processPredictionJob(job)).rejects.toThrow('tenantId is required');
    });

    it('throws at runtime when userId is missing from context', async () => {
      const job = createMockJob({
        predictionType: 'NEXT_BEST_ACTION',
        context: {
          // No userId!
        },
      });

      await expect(processPredictionJob(job)).rejects.toThrow('userId is required');
    });

    it('throws at runtime when context is completely missing (userId still required)', async () => {
      const job = createMockJob({
        predictionType: 'NEXT_BEST_ACTION',
        // top-level tenantId is supplied by helper; context is not
      });

      await expect(processPredictionJob(job)).rejects.toThrow('userId is required');
    });

    it('processes successfully when tenantId is top-level and userId is in context', async () => {
      const job = createMockJob({
        predictionType: 'NEXT_BEST_ACTION',
        context: {
          userId: '550e8400-e29b-41d4-a716-446655440002',
        },
      });

      const result = await processPredictionJob(job);

      expect(result).toBeDefined();
      expect(result.prediction).toBeDefined();
      expect(result.prediction.value).toBeDefined();
    });
  });

  describe('CHURN_RISK predictions (now also tenant-scoped)', () => {
    it('rejects CHURN_RISK when top-level tenantId is missing', async () => {
      const job = createMockJob({
        predictionType: 'CHURN_RISK',
        tenantId: undefined as unknown as string,
      });

      await expect(processPredictionJob(job)).rejects.toThrow('tenantId is required');
    });

    it('processes CHURN_RISK when top-level tenantId is provided', async () => {
      const job = createMockJob({
        predictionType: 'CHURN_RISK',
      });

      const result = await processPredictionJob(job);

      expect(result).toBeDefined();
      expect(result.predictionType).toBe('CHURN_RISK');
    });
  });
});
