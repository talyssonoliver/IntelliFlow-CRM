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
      priority: 5,
      ...data,
    } as PredictionJobData,
    name: 'prediction',
    attemptsMade: 0,
    progress: vi.fn(),
    updateProgress: vi.fn(),
    log: vi.fn(),
  } as unknown as Job<PredictionJobData>;
}

describe('Prediction Job Tenant Isolation (IFC-095 P1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('NEXT_BEST_ACTION predictions', () => {
    it('should throw error when tenantId is missing from context', async () => {
      const job = createMockJob({
        predictionType: 'NEXT_BEST_ACTION',
        context: {
          // No tenantId!
          userId: '550e8400-e29b-41d4-a716-446655440001',
        },
      });

      await expect(processPredictionJob(job)).rejects.toThrow('tenantId is required');
    });

    it('should throw error when userId is missing from context', async () => {
      const job = createMockJob({
        predictionType: 'NEXT_BEST_ACTION',
        context: {
          tenantId: '550e8400-e29b-41d4-a716-446655440001',
          // No userId!
        },
      });

      await expect(processPredictionJob(job)).rejects.toThrow('userId is required');
    });

    it('should throw error when context is completely missing', async () => {
      const job = createMockJob({
        predictionType: 'NEXT_BEST_ACTION',
        // No context at all!
      });

      await expect(processPredictionJob(job)).rejects.toThrow('tenantId is required');
    });

    it('should throw error when tenantId is empty string', async () => {
      const job = createMockJob({
        predictionType: 'NEXT_BEST_ACTION',
        context: {
          tenantId: '',
          userId: '550e8400-e29b-41d4-a716-446655440001',
        },
      });

      await expect(processPredictionJob(job)).rejects.toThrow('tenantId is required');
    });

    it('should process successfully when both tenantId and userId are provided', async () => {
      const job = createMockJob({
        predictionType: 'NEXT_BEST_ACTION',
        context: {
          tenantId: '550e8400-e29b-41d4-a716-446655440001',
          userId: '550e8400-e29b-41d4-a716-446655440002',
        },
      });

      const result = await processPredictionJob(job);

      expect(result).toBeDefined();
      expect(result.prediction).toBeDefined();
      expect(result.prediction.value).toBeDefined();
    });
  });

  describe('CHURN_RISK predictions (no tenant validation required)', () => {
    // Note: CHURN_RISK doesn't require tenantId - it passes context as metadata
    it('should process CHURN_RISK without tenant context', async () => {
      const job = createMockJob({
        predictionType: 'CHURN_RISK',
        // No context
      });

      const result = await processPredictionJob(job);

      expect(result).toBeDefined();
      expect(result.predictionType).toBe('CHURN_RISK');
    });
  });
});
