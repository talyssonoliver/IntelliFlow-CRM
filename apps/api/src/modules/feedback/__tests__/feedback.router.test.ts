/**
 * Feedback Router Tests
 *
 * @implements IFC-024: Human-in-the-Loop Feedback
 *
 * Tests for AI score feedback endpoints including:
 * - Simple feedback (thumbs up/down)
 * - Score corrections
 * - Feedback analytics
 * - Retraining recommendations
 * - Training data export
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { feedbackRouter } from '../feedback.router';
import type { BaseContext } from '../../../context';

// Test UUID constants
const TEST_UUIDS = {
  user1: '12345678-0000-4000-8000-000012345678',
  tenant: 'test-tenant-id',
  lead1: '23456789-0000-4000-8000-000023456789',
  score1: '34567890-0000-4000-8000-000034567890',
};

// Mock feedback data
const mockFeedback = {
  id: TEST_UUIDS.score1,
  leadId: TEST_UUIDS.lead1,
  userId: TEST_UUIDS.user1,
  tenantId: TEST_UUIDS.tenant,
  feedbackType: 'THUMBS_UP',
  originalScore: 75,
  originalConfidence: 0.85,
  modelVersion: '1.0.0',
  createdAt: new Date(),
};

const mockScoreCorrection = {
  id: TEST_UUIDS.score1,
  leadId: TEST_UUIDS.lead1,
  userId: TEST_UUIDS.user1,
  tenantId: TEST_UUIDS.tenant,
  originalScore: 65,
  correctedScore: 85,
  reason: 'Underestimated lead potential',
  modelVersion: '1.0.0',
  createdAt: new Date(),
};

const mockAnalytics = {
  totalFeedback: 100,
  positiveFeedback: 70,
  negativeFeedback: 30,
  positiveRate: 0.7,
  corrections: 25,
  avgCorrection: 12.5,
  feedbackByDay: [
    { date: '2025-01-20', positive: 10, negative: 3 },
    { date: '2025-01-21', positive: 12, negative: 5 },
  ],
  topCorrectionReasons: [
    { reason: 'Underestimated', count: 15 },
    { reason: 'Overestimated', count: 10 },
  ],
};

const mockRetrainingRecommendation = {
  recommended: true,
  reason: 'High correction rate detected',
  metrics: {
    correctionRate: 0.25,
    avgCorrectionMagnitude: 15,
    samplesCollected: 500,
  },
  minSamplesNeeded: 100,
  currentSamples: 500,
};

const mockTrainingData = {
  exportId: 'export_123',
  records: 100,
  dateRange: {
    from: new Date('2025-01-01'),
    to: new Date('2025-01-31'),
  },
  downloadUrl: 'https://storage.example.com/exports/export_123.json',
};

// Create mock feedback service
function createMockFeedbackService() {
  return {
    submitSimpleFeedback: vi.fn().mockResolvedValue(mockFeedback),
    submitScoreCorrection: vi.fn().mockResolvedValue(mockScoreCorrection),
    getFeedbackForLead: vi.fn().mockResolvedValue([mockFeedback]),
    getAnalytics: vi.fn().mockResolvedValue(mockAnalytics),
    checkRetrainingNeeded: vi.fn().mockResolvedValue(mockRetrainingRecommendation),
    exportTrainingData: vi.fn().mockResolvedValue(mockTrainingData),
  };
}

// Create test context helper (standalone)
function createFeedbackTestContext(options: { authenticated?: boolean; noFeedbackService?: boolean } = {}): BaseContext {
  const { authenticated = true, noFeedbackService = false } = options;

  const services = noFeedbackService ? {} : { feedback: createMockFeedbackService() };

  return {
    prisma: {} as any,
    container: {} as any,
    services: services as any,
    security: {} as any,
    adapters: {} as any,
    user: authenticated ? {
      userId: TEST_UUIDS.user1,
      email: 'test@example.com',
      role: 'USER',
      tenantId: TEST_UUIDS.tenant,
    } : undefined,
    tenant: {
      tenantId: TEST_UUIDS.tenant,
      tenantType: 'user' as const,
      userId: TEST_UUIDS.user1,
      role: 'USER',
      canAccessAllTenantData: false,
    },
    prismaWithTenant: {} as any,
    req: undefined,
    res: undefined,
  };
}

describe('feedbackRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // Submit Simple Feedback Tests
  // ============================================

  describe('submitSimple', () => {
    const validSimpleFeedback = {
      leadId: TEST_UUIDS.lead1,
      feedbackType: 'THUMBS_UP' as const,
      originalScore: 75,
      originalConfidence: 0.85,
      modelVersion: '1.0.0',
    };

    it('should submit thumbs up feedback', async () => {
      const ctx = createFeedbackTestContext();
      const caller = feedbackRouter.createCaller(ctx);

      const result = await caller.submitSimple(validSimpleFeedback);

      expect(result).toEqual(mockFeedback);
      expect(ctx.services!.feedback.submitSimpleFeedback).toHaveBeenCalledWith(
        validSimpleFeedback,
        TEST_UUIDS.user1,
        TEST_UUIDS.tenant
      );
    });

    it('should submit thumbs down feedback', async () => {
      const ctx = createFeedbackTestContext();
      const caller = feedbackRouter.createCaller(ctx);

      const thumbsDownFeedback = { ...mockFeedback, feedbackType: 'THUMBS_DOWN' };
      ctx.services!.feedback.submitSimpleFeedback.mockResolvedValueOnce(thumbsDownFeedback);

      const result = await caller.submitSimple({
        ...validSimpleFeedback,
        feedbackType: 'THUMBS_DOWN',
      });

      expect(result.feedbackType).toBe('THUMBS_DOWN');
    });

    it('should throw error when service unavailable', async () => {
      const ctx = createFeedbackTestContext({ noFeedbackService: true });
      const caller = feedbackRouter.createCaller(ctx);

      await expect(caller.submitSimple(validSimpleFeedback)).rejects.toThrow(
        /Feedback service not available/
      );
    });
  });

  // ============================================
  // Submit Score Correction Tests
  // ============================================

  describe('submitCorrection', () => {
    const validCorrectionInput = {
      leadId: TEST_UUIDS.lead1,
      originalScore: 65,
      originalConfidence: 0.75,
      correctedScore: 85,
      reason: 'Underestimated lead potential due to missing context',
      correctionCategory: 'SCORE_TOO_LOW' as const,
      modelVersion: '1.0.0',
    };

    it('should submit score correction', async () => {
      const ctx = createFeedbackTestContext();
      const caller = feedbackRouter.createCaller(ctx);

      const result = await caller.submitCorrection(validCorrectionInput);

      expect(result).toEqual(mockScoreCorrection);
      expect(ctx.services!.feedback.submitScoreCorrection).toHaveBeenCalledWith(
        validCorrectionInput,
        TEST_UUIDS.user1,
        TEST_UUIDS.tenant
      );
    });

    it('should accept correction without reason', async () => {
      const ctx = createFeedbackTestContext();
      const caller = feedbackRouter.createCaller(ctx);

      const inputWithoutReason = {
        leadId: TEST_UUIDS.lead1,
        originalScore: 65,
        originalConfidence: 0.75,
        correctedScore: 85,
        correctionCategory: 'SCORE_TOO_LOW' as const,
        modelVersion: '1.0.0',
      };

      await caller.submitCorrection(inputWithoutReason);

      expect(ctx.services!.feedback.submitScoreCorrection).toHaveBeenCalledWith(
        inputWithoutReason,
        TEST_UUIDS.user1,
        TEST_UUIDS.tenant
      );
    });
  });

  // ============================================
  // Get Feedback for Lead Tests
  // ============================================

  describe('getForLead', () => {
    it('should return feedback for a specific lead', async () => {
      const ctx = createFeedbackTestContext();
      const caller = feedbackRouter.createCaller(ctx);

      const result = await caller.getForLead({ leadId: TEST_UUIDS.lead1 });

      expect(result).toEqual([mockFeedback]);
      expect(ctx.services!.feedback.getFeedbackForLead).toHaveBeenCalledWith(TEST_UUIDS.lead1);
    });

    it('should return empty array when no feedback exists', async () => {
      const ctx = createFeedbackTestContext();
      ctx.services!.feedback.getFeedbackForLead.mockResolvedValueOnce([]);
      const caller = feedbackRouter.createCaller(ctx);

      const result = await caller.getForLead({ leadId: 'lead_without_feedback' });

      expect(result).toEqual([]);
    });
  });

  // ============================================
  // Get Analytics Tests
  // ============================================

  describe('getAnalytics', () => {
    it('should return feedback analytics', async () => {
      const ctx = createFeedbackTestContext();
      const caller = feedbackRouter.createCaller(ctx);

      const result = await caller.getAnalytics({
        dateFrom: new Date('2025-01-01'),
        dateTo: new Date('2025-01-31'),
      });

      expect(result.totalFeedback).toBe(100);
      expect(result.positiveRate).toBe(0.7);
      expect(result.corrections).toBe(25);
      expect(result.feedbackByDay).toHaveLength(2);
      expect(result.topCorrectionReasons).toHaveLength(2);
    });

    it('should filter analytics by model version', async () => {
      const ctx = createFeedbackTestContext();
      const caller = feedbackRouter.createCaller(ctx);

      await caller.getAnalytics({
        dateFrom: new Date('2025-01-01'),
        dateTo: new Date('2025-01-31'),
        modelVersion: '1.0.0',
      });

      expect(ctx.services!.feedback.getAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          modelVersion: '1.0.0',
        })
      );
    });

    it('should filter analytics by tenant', async () => {
      const ctx = createFeedbackTestContext();
      const caller = feedbackRouter.createCaller(ctx);

      await caller.getAnalytics({
        dateFrom: new Date('2025-01-01'),
        dateTo: new Date('2025-01-31'),
        tenantId: 'tenant_456',
      });

      expect(ctx.services!.feedback.getAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant_456',
        })
      );
    });
  });

  // ============================================
  // Check Retraining Tests
  // ============================================

  describe('checkRetraining', () => {
    it('should return retraining recommendation when needed', async () => {
      const ctx = createFeedbackTestContext();
      const caller = feedbackRouter.createCaller(ctx);

      const result = await caller.checkRetraining({ modelVersion: '1.0.0' });

      expect(result.recommended).toBe(true);
      expect(result.reason).toContain('correction rate');
      expect(result.metrics).toBeDefined();
      expect(result.currentSamples).toBe(500);
    });

    it('should indicate when retraining is not needed', async () => {
      const ctx = createFeedbackTestContext();
      ctx.services!.feedback.checkRetrainingNeeded.mockResolvedValueOnce({
        recommended: false,
        reason: 'Model performing well',
        metrics: {
          correctionRate: 0.05,
          avgCorrectionMagnitude: 3,
          samplesCollected: 100,
        },
        minSamplesNeeded: 100,
        currentSamples: 100,
      });
      const caller = feedbackRouter.createCaller(ctx);

      const result = await caller.checkRetraining({ modelVersion: '2.0.0' });

      expect(result.recommended).toBe(false);
      expect(result.reason).toContain('performing well');
    });

    it('should indicate when more samples needed', async () => {
      const ctx = createFeedbackTestContext();
      ctx.services!.feedback.checkRetrainingNeeded.mockResolvedValueOnce({
        recommended: false,
        reason: 'Insufficient samples for assessment',
        metrics: {
          correctionRate: 0.2,
          avgCorrectionMagnitude: 10,
          samplesCollected: 25,
        },
        minSamplesNeeded: 100,
        currentSamples: 25,
      });
      const caller = feedbackRouter.createCaller(ctx);

      const result = await caller.checkRetraining({ modelVersion: '3.0.0' });

      expect(result.recommended).toBe(false);
      expect(result.currentSamples).toBeLessThan(result.minSamplesNeeded);
    });
  });

  // ============================================
  // Export Training Data Tests
  // ============================================

  describe('exportTrainingData', () => {
    it('should export training data for date range', async () => {
      const ctx = createFeedbackTestContext();
      const caller = feedbackRouter.createCaller(ctx);

      const result = await caller.exportTrainingData({
        modelVersion: '1.0.0',
        dateFrom: new Date('2025-01-01'),
        dateTo: new Date('2025-01-31'),
      });

      expect(result.exportId).toBeDefined();
      expect(result.records).toBe(100);
      expect(result.downloadUrl).toContain('exports');
      expect(ctx.services!.feedback.exportTrainingData).toHaveBeenCalledWith(
        '1.0.0',
        expect.any(Date),
        expect.any(Date),
        TEST_UUIDS.user1
      );
    });

    // Note: exportTrainingData uses protectedProcedure, so authentication is required.
    // The 'system' fallback in ctx.user?.userId ?? 'system' is for edge cases
    // within the service layer, not for unauthenticated API access.
  });

  // ============================================
  // Error Handling Tests
  // ============================================

  describe('error handling', () => {
    const validInput = {
      leadId: TEST_UUIDS.lead1,
      feedbackType: 'THUMBS_UP' as const,
      originalScore: 75,
      originalConfidence: 0.85,
      modelVersion: '1.0.0',
    };

    it('should throw when feedback service is not available', async () => {
      const ctx = createFeedbackTestContext();
      ctx.services = undefined as any;
      const caller = feedbackRouter.createCaller(ctx);

      await expect(caller.submitSimple(validInput)).rejects.toThrow(TRPCError);
    });

    it('should propagate service errors', async () => {
      const ctx = createFeedbackTestContext();
      ctx.services!.feedback.submitSimpleFeedback.mockRejectedValueOnce(new Error('Database connection failed'));
      const caller = feedbackRouter.createCaller(ctx);

      await expect(caller.submitSimple(validInput)).rejects.toThrow('Database connection failed');
    });
  });

  // ============================================
  // Integration with Tenant Context Tests
  // ============================================

  describe('tenant isolation', () => {
    it('should use tenant context for simple feedback', async () => {
      const ctx = createFeedbackTestContext();
      const caller = feedbackRouter.createCaller(ctx);

      await caller.submitSimple({
        leadId: TEST_UUIDS.lead1,
        feedbackType: 'THUMBS_UP',
        originalScore: 75,
        originalConfidence: 0.85,
        modelVersion: '1.0.0',
      });

      expect(ctx.services!.feedback.submitSimpleFeedback).toHaveBeenCalledWith(
        expect.any(Object),
        TEST_UUIDS.user1,
        TEST_UUIDS.tenant
      );
    });

    it('should use tenant context for score corrections', async () => {
      const ctx = createFeedbackTestContext();
      const caller = feedbackRouter.createCaller(ctx);

      await caller.submitCorrection({
        leadId: TEST_UUIDS.lead1,
        originalScore: 65,
        originalConfidence: 0.75,
        correctedScore: 85,
        correctionCategory: 'SCORE_TOO_LOW',
        modelVersion: '1.0.0',
      });

      expect(ctx.services!.feedback.submitScoreCorrection).toHaveBeenCalledWith(
        expect.any(Object),
        TEST_UUIDS.user1,
        TEST_UUIDS.tenant
      );
    });
  });
});
