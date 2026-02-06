/**
 * FeedbackService Tests
 *
 * Tests the FeedbackService application service which orchestrates
 * feedback collection, analytics aggregation, and model improvement
 * recommendations for AI-generated scores.
 *
 * Coverage target: >90% for application layer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FeedbackService,
  FeedbackRepositoryPort,
  LeadDataPort,
} from '../FeedbackService';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockFeedbackRepo(): Record<string, any> {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByLeadId: vi.fn(),
    findByModelVersion: vi.fn(),
    findByTenantId: vi.fn(),
    findAll: vi.fn(),
    countByType: vi.fn(),
  };
}

function createMockLeadDataPort(): Record<string, any> {
  return {
    getLeadData: vi.fn(),
  };
}

function createMockEventBus(): Record<string, any> {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    publishAll: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FeedbackRecord {
  id: string;
  feedbackType: string;
  originalScore: number;
  originalConfidence: number;
  modelVersion: string;
  correctedScore: number | null;
  correctionMagnitude: number | null;
  reason: string | null;
  correctionCategory: string | null;
  leadId: string;
  aiScoreId: string | null;
  userId: string;
  tenantId: string;
  createdAt: Date;
}

function makeFeedback(overrides: Partial<FeedbackRecord> = {}): FeedbackRecord {
  return {
    id: 'fb-1',
    feedbackType: 'THUMBS_UP',
    originalScore: 75,
    originalConfidence: 0.85,
    modelVersion: 'v1.0',
    correctedScore: null,
    correctionMagnitude: null,
    reason: null,
    correctionCategory: null,
    leadId: 'lead-1',
    aiScoreId: 'ai-score-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    createdAt: new Date('2025-01-15'),
    ...overrides,
  };
}

function makeCorrection(overrides: Partial<FeedbackRecord> = {}): FeedbackRecord {
  return makeFeedback({
    id: 'fb-correction',
    feedbackType: 'SCORE_CORRECTION',
    correctedScore: 60,
    correctionMagnitude: 15,
    reason: 'Score too high',
    correctionCategory: 'SCORE_TOO_HIGH',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FeedbackService', () => {
  let service: FeedbackService;
  let feedbackRepo: Record<string, any>;
  let leadDataPort: Record<string, any>;
  let eventBus: Record<string, any>;

  beforeEach(() => {
    feedbackRepo = createMockFeedbackRepo();
    leadDataPort = createMockLeadDataPort();
    eventBus = createMockEventBus();

    service = new FeedbackService(
      feedbackRepo as FeedbackRepositoryPort,
      leadDataPort as LeadDataPort,
      eventBus as any,
    );
  });

  // =========================================================================
  // submitSimpleFeedback
  // =========================================================================

  describe('submitSimpleFeedback', () => {
    it('should create thumbs up feedback', async () => {
      const created = makeFeedback({ feedbackType: 'THUMBS_UP' });
      feedbackRepo.create.mockResolvedValue(created);

      const result = await service.submitSimpleFeedback(
        {
          feedbackType: 'THUMBS_UP',
          originalScore: 75,
          originalConfidence: 0.85,
          modelVersion: 'v1.0',
          leadId: 'lead-1',
          aiScoreId: 'ai-score-1',
        },
        'user-1',
        'tenant-1',
      );

      expect(result).toEqual(created);
      expect(feedbackRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          feedbackType: 'THUMBS_UP',
          originalScore: 75,
          correctedScore: null,
          correctionMagnitude: null,
          reason: null,
          correctionCategory: null,
          userId: 'user-1',
          tenantId: 'tenant-1',
        }),
      );
    });

    it('should create thumbs down feedback', async () => {
      const created = makeFeedback({ feedbackType: 'THUMBS_DOWN' });
      feedbackRepo.create.mockResolvedValue(created);

      const result = await service.submitSimpleFeedback(
        {
          feedbackType: 'THUMBS_DOWN',
          originalScore: 75,
          originalConfidence: 0.85,
          modelVersion: 'v1.0',
          leadId: 'lead-1',
        },
        'user-1',
        'tenant-1',
      );

      expect(result.feedbackType).toBe('THUMBS_DOWN');
    });

    it('should publish ScoreFeedbackSubmittedEvent', async () => {
      feedbackRepo.create.mockResolvedValue(makeFeedback());

      await service.submitSimpleFeedback(
        {
          feedbackType: 'THUMBS_UP',
          originalScore: 75,
          originalConfidence: 0.85,
          modelVersion: 'v1.0',
          leadId: 'lead-1',
        },
        'user-1',
        'tenant-1',
      );

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      const event = eventBus.publish.mock.calls[0][0];
      expect(event.eventType).toBe('ai.score_feedback.submitted');
      expect(event.feedbackId).toBe('fb-1');
      expect(event.feedbackType).toBe('THUMBS_UP');
      expect(event.correctedScore).toBeNull();
    });

    it('should handle missing aiScoreId', async () => {
      feedbackRepo.create.mockResolvedValue(makeFeedback({ aiScoreId: null }));

      await service.submitSimpleFeedback(
        {
          feedbackType: 'THUMBS_UP',
          originalScore: 75,
          originalConfidence: 0.85,
          modelVersion: 'v1.0',
          leadId: 'lead-1',
        },
        'user-1',
        'tenant-1',
      );

      const createCall = feedbackRepo.create.mock.calls[0][0];
      expect(createCall.aiScoreId).toBeNull();
    });
  });

  // =========================================================================
  // submitScoreCorrection
  // =========================================================================

  describe('submitScoreCorrection', () => {
    it('should create score correction feedback with magnitude', async () => {
      const created = makeCorrection();
      feedbackRepo.create.mockResolvedValue(created);
      // Mock checkRetrainingNeeded dependencies
      feedbackRepo.findByModelVersion.mockResolvedValue([]);

      const result = await service.submitScoreCorrection(
        {
          originalScore: 75,
          originalConfidence: 0.85,
          correctedScore: 60,
          modelVersion: 'v1.0',
          leadId: 'lead-1',
          correctionCategory: 'SCORE_TOO_HIGH',
          reason: 'Score too high',
        },
        'user-1',
        'tenant-1',
      );

      expect(result).toEqual(created);
      expect(feedbackRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          feedbackType: 'SCORE_CORRECTION',
          correctedScore: 60,
          correctionMagnitude: 15, // |75 - 60|
          correctionCategory: 'SCORE_TOO_HIGH',
        }),
      );
    });

    it('should publish ScoreFeedbackSubmittedEvent for correction', async () => {
      feedbackRepo.create.mockResolvedValue(makeCorrection());
      feedbackRepo.findByModelVersion.mockResolvedValue([]);

      await service.submitScoreCorrection(
        {
          originalScore: 75,
          originalConfidence: 0.85,
          correctedScore: 60,
          modelVersion: 'v1.0',
          leadId: 'lead-1',
          correctionCategory: 'SCORE_TOO_HIGH',
        },
        'user-1',
        'tenant-1',
      );

      const event = eventBus.publish.mock.calls[0][0];
      expect(event.eventType).toBe('ai.score_feedback.submitted');
      expect(event.feedbackType).toBe('SCORE_CORRECTION');
      expect(event.correctedScore).toBe(60);
      expect(event.correctionMagnitude).toBe(15);
    });

    it('should check retraining after correction', async () => {
      feedbackRepo.create.mockResolvedValue(makeCorrection());
      feedbackRepo.findByModelVersion.mockResolvedValue([]);

      await service.submitScoreCorrection(
        {
          originalScore: 75,
          originalConfidence: 0.85,
          correctedScore: 60,
          modelVersion: 'v1.0',
          leadId: 'lead-1',
          correctionCategory: 'SCORE_TOO_HIGH',
        },
        'user-1',
        'tenant-1',
      );

      expect(feedbackRepo.findByModelVersion).toHaveBeenCalledWith('v1.0', expect.any(Date));
    });

    it('should publish RetrainingRecommendedEvent when retraining is needed', async () => {
      feedbackRepo.create.mockResolvedValue(makeCorrection());

      // Create enough negative feedback to trigger retraining
      const feedback = Array.from({ length: 150 }, (_, i) =>
        makeFeedback({
          id: `fb-${i}`,
          feedbackType: 'THUMBS_DOWN',
          createdAt: new Date(),
        }),
      );
      feedbackRepo.findByModelVersion.mockResolvedValue(feedback);

      await service.submitScoreCorrection(
        {
          originalScore: 75,
          originalConfidence: 0.85,
          correctedScore: 60,
          modelVersion: 'v1.0',
          leadId: 'lead-1',
          correctionCategory: 'SCORE_TOO_HIGH',
        },
        'user-1',
        'tenant-1',
      );

      // Should have published 2 events: feedback submitted + retraining recommended
      expect(eventBus.publish).toHaveBeenCalledTimes(2);
      const retrainingEvent = eventBus.publish.mock.calls[1][0];
      expect(retrainingEvent.eventType).toBe('ai.model.retraining_recommended');
    });

    it('should handle null reason in correction', async () => {
      feedbackRepo.create.mockResolvedValue(makeCorrection({ reason: null }));
      feedbackRepo.findByModelVersion.mockResolvedValue([]);

      await service.submitScoreCorrection(
        {
          originalScore: 75,
          originalConfidence: 0.85,
          correctedScore: 60,
          modelVersion: 'v1.0',
          leadId: 'lead-1',
          correctionCategory: 'SCORE_TOO_HIGH',
        },
        'user-1',
        'tenant-1',
      );

      const createCall = feedbackRepo.create.mock.calls[0][0];
      expect(createCall.reason).toBeNull();
    });
  });

  // =========================================================================
  // getFeedbackForLead
  // =========================================================================

  describe('getFeedbackForLead', () => {
    it('should return feedback for a lead', async () => {
      const feedback = [makeFeedback(), makeCorrection()];
      feedbackRepo.findByLeadId.mockResolvedValue(feedback);

      const result = await service.getFeedbackForLead('lead-1');

      expect(result).toEqual(feedback);
      expect(feedbackRepo.findByLeadId).toHaveBeenCalledWith('lead-1');
    });

    it('should return empty array if no feedback', async () => {
      feedbackRepo.findByLeadId.mockResolvedValue([]);

      const result = await service.getFeedbackForLead('lead-no-feedback');

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // getAnalytics
  // =========================================================================

  describe('getAnalytics', () => {
    it('should return comprehensive analytics with zero feedback', async () => {
      feedbackRepo.findAll.mockResolvedValue([]);

      const analytics = await service.getAnalytics({});

      expect(analytics.totalFeedback).toBe(0);
      expect(analytics.positiveCount).toBe(0);
      expect(analytics.negativeCount).toBe(0);
      expect(analytics.correctionCount).toBe(0);
      expect(analytics.positiveRatio).toBe(0);
      expect(analytics.negativeRatio).toBe(0);
      expect(analytics.averageCorrectionMagnitude).toBe(0);
      expect(analytics.retrainingRecommended).toBe(false);
    });

    it('should calculate ratios correctly', async () => {
      const feedback = [
        makeFeedback({ id: 'fb-1', feedbackType: 'THUMBS_UP' }),
        makeFeedback({ id: 'fb-2', feedbackType: 'THUMBS_UP' }),
        makeFeedback({ id: 'fb-3', feedbackType: 'THUMBS_DOWN' }),
        makeCorrection({ id: 'fb-4' }),
      ];
      feedbackRepo.findAll.mockResolvedValue(feedback);

      const analytics = await service.getAnalytics({});

      expect(analytics.totalFeedback).toBe(4);
      expect(analytics.positiveCount).toBe(2);
      expect(analytics.negativeCount).toBe(1);
      expect(analytics.correctionCount).toBe(1);
      expect(analytics.positiveRatio).toBe(0.5);
      expect(analytics.negativeRatio).toBe(0.25);
    });

    it('should calculate correction distribution', async () => {
      const feedback = [
        makeCorrection({ id: 'fb-1', correctionMagnitude: 5 }),   // minor
        makeCorrection({ id: 'fb-2', correctionMagnitude: 15 }),  // moderate
        makeCorrection({ id: 'fb-3', correctionMagnitude: 35 }),  // major
        makeCorrection({ id: 'fb-4', correctionMagnitude: 60 }),  // severe
      ];
      feedbackRepo.findAll.mockResolvedValue(feedback);

      const analytics = await service.getAnalytics({});

      expect(analytics.correctionDistribution.minor).toBe(1);
      expect(analytics.correctionDistribution.moderate).toBe(1);
      expect(analytics.correctionDistribution.major).toBe(1);
      expect(analytics.correctionDistribution.severe).toBe(1);
    });

    it('should calculate category breakdown', async () => {
      const feedback = [
        makeCorrection({ id: 'fb-1', correctionCategory: 'SCORE_TOO_HIGH' }),
        makeCorrection({ id: 'fb-2', correctionCategory: 'SCORE_TOO_HIGH' }),
        makeCorrection({ id: 'fb-3', correctionCategory: 'SCORE_TOO_LOW' }),
        makeCorrection({ id: 'fb-4', correctionCategory: null }),
      ];
      feedbackRepo.findAll.mockResolvedValue(feedback);

      const analytics = await service.getAnalytics({});

      expect(analytics.categoryBreakdown['SCORE_TOO_HIGH']).toBe(2);
      expect(analytics.categoryBreakdown['SCORE_TOO_LOW']).toBe(1);
      expect(analytics.categoryBreakdown['null']).toBeUndefined();
    });

    it('should calculate model version stats', async () => {
      const feedback = [
        makeFeedback({ id: 'fb-1', modelVersion: 'v1.0', feedbackType: 'THUMBS_UP' }),
        makeFeedback({ id: 'fb-2', modelVersion: 'v1.0', feedbackType: 'THUMBS_DOWN' }),
        makeFeedback({ id: 'fb-3', modelVersion: 'v2.0', feedbackType: 'THUMBS_UP' }),
      ];
      feedbackRepo.findAll.mockResolvedValue(feedback);

      const analytics = await service.getAnalytics({});

      expect(analytics.modelVersionStats).toHaveLength(2);

      const v1Stats = analytics.modelVersionStats.find((s: any) => s.modelVersion === 'v1.0');
      expect(v1Stats).toBeDefined();
      expect(v1Stats!.feedbackCount).toBe(2);
      expect(v1Stats!.positiveRatio).toBe(0.5);
    });

    it('should calculate trend data (7 days)', async () => {
      feedbackRepo.findAll.mockResolvedValue([]);

      const analytics = await service.getAnalytics({});

      expect(analytics.trendData).toHaveLength(7);
      expect(analytics.trendData[0]).toHaveProperty('date');
      expect(analytics.trendData[0]).toHaveProperty('positive');
      expect(analytics.trendData[0]).toHaveProperty('negative');
      expect(analytics.trendData[0]).toHaveProperty('corrections');
      expect(analytics.trendData[0]).toHaveProperty('avgMagnitude');
    });

    it('should generate recommendation for high correction magnitude', async () => {
      const feedback = [
        makeCorrection({ id: 'fb-1', correctionMagnitude: 40 }),
        makeCorrection({ id: 'fb-2', correctionMagnitude: 50 }),
      ];
      feedbackRepo.findAll.mockResolvedValue(feedback);

      const analytics = await service.getAnalytics({});

      expect(analytics.improvementRecommendations.length).toBeGreaterThan(0);
      expect(analytics.improvementRecommendations[0]).toContain('correction magnitude');
    });

    it('should generate recommendation for high negative ratio', async () => {
      // RETRAINING_THRESHOLDS.MAX_NEGATIVE_RATIO = 0.3
      // Need >100 feedbacks (MIN_FEEDBACK_COUNT) for retraining check
      const feedback = Array.from({ length: 120 }, (_, i) =>
        makeFeedback({
          id: `fb-${i}`,
          feedbackType: i < 50 ? 'THUMBS_DOWN' : 'THUMBS_UP',
          createdAt: new Date(),
        }),
      );
      feedbackRepo.findAll.mockResolvedValue(feedback);

      const analytics = await service.getAnalytics({});

      const negRec = analytics.improvementRecommendations.find((r: string) =>
        r.includes('Negative feedback ratio'),
      );
      expect(negRec).toBeDefined();
    });

    it('should generate recommendation for systematic overestimation', async () => {
      // SCORE_TOO_HIGH > SCORE_TOO_LOW * 2
      const feedback = [
        makeCorrection({ id: 'fb-1', correctionCategory: 'SCORE_TOO_HIGH' }),
        makeCorrection({ id: 'fb-2', correctionCategory: 'SCORE_TOO_HIGH' }),
        makeCorrection({ id: 'fb-3', correctionCategory: 'SCORE_TOO_HIGH' }),
      ];
      feedbackRepo.findAll.mockResolvedValue(feedback);

      const analytics = await service.getAnalytics({});

      const overRec = analytics.improvementRecommendations.find((r: string) =>
        r.includes('overestimates'),
      );
      expect(overRec).toBeDefined();
    });

    it('should generate recommendation for systematic underestimation', async () => {
      const feedback = [
        makeCorrection({ id: 'fb-1', correctionCategory: 'SCORE_TOO_LOW' }),
        makeCorrection({ id: 'fb-2', correctionCategory: 'SCORE_TOO_LOW' }),
        makeCorrection({ id: 'fb-3', correctionCategory: 'SCORE_TOO_LOW' }),
      ];
      feedbackRepo.findAll.mockResolvedValue(feedback);

      const analytics = await service.getAnalytics({});

      const underRec = analytics.improvementRecommendations.find((r: string) =>
        r.includes('underestimates'),
      );
      expect(underRec).toBeDefined();
    });

    it('should generate recommendation for missing context issues', async () => {
      // missing context > 20% of total feedback
      const feedback = [
        makeCorrection({ id: 'fb-1', correctionCategory: 'MISSING_CONTEXT' }),
        makeCorrection({ id: 'fb-2', correctionCategory: 'MISSING_CONTEXT' }),
        makeFeedback({ id: 'fb-3', feedbackType: 'THUMBS_UP' }),
      ];
      feedbackRepo.findAll.mockResolvedValue(feedback);

      const analytics = await service.getAnalytics({});

      const contextRec = analytics.improvementRecommendations.find((r: string) =>
        r.includes('missing context'),
      );
      expect(contextRec).toBeDefined();
    });

    it('should generate recommendation for wrong factors issues', async () => {
      // wrong factors > 15% of total feedback
      const feedback = [
        makeCorrection({ id: 'fb-1', correctionCategory: 'WRONG_FACTORS' }),
        makeCorrection({ id: 'fb-2', correctionCategory: 'WRONG_FACTORS' }),
        makeFeedback({ id: 'fb-3', feedbackType: 'THUMBS_UP' }),
      ];
      feedbackRepo.findAll.mockResolvedValue(feedback);

      const analytics = await service.getAnalytics({});

      const factorsRec = analytics.improvementRecommendations.find((r: string) =>
        r.includes('factor weighting'),
      );
      expect(factorsRec).toBeDefined();
    });

    it('should pass query parameters to repository', async () => {
      feedbackRepo.findAll.mockResolvedValue([]);

      await service.getAnalytics({
        modelVersion: 'v1.0',
        dateFrom: new Date('2025-01-01'),
        dateTo: new Date('2025-02-01'),
        tenantId: 'tenant-1',
      });

      expect(feedbackRepo.findAll).toHaveBeenCalledWith({
        modelVersion: 'v1.0',
        dateFrom: new Date('2025-01-01'),
        dateTo: new Date('2025-02-01'),
        tenantId: 'tenant-1',
      });
    });

    it('should recommend retraining when negative ratio exceeds threshold', async () => {
      // Need 100+ feedback with >30% negative
      const feedback = Array.from({ length: 120 }, (_, i) =>
        makeFeedback({
          id: `fb-${i}`,
          feedbackType: i < 50 ? 'THUMBS_DOWN' : 'THUMBS_UP',
          createdAt: new Date(),
        }),
      );
      feedbackRepo.findAll.mockResolvedValue(feedback);

      const analytics = await service.getAnalytics({});

      expect(analytics.retrainingRecommended).toBe(true);
      expect(analytics.retrainingReason).toBeDefined();
    });
  });

  // =========================================================================
  // checkRetrainingNeeded
  // =========================================================================

  describe('checkRetrainingNeeded', () => {
    it('should return not needed with insufficient data', async () => {
      feedbackRepo.findByModelVersion.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => makeFeedback({ id: `fb-${i}` })),
      );

      const check = await service.checkRetrainingNeeded('v1.0');

      expect(check.needed).toBe(false);
      expect(check.feedbackCount).toBe(10);
    });

    it('should return needed when negative ratio exceeds threshold', async () => {
      // RETRAINING_THRESHOLDS.MAX_NEGATIVE_RATIO = 0.3
      const feedback = Array.from({ length: 110 }, (_, i) =>
        makeFeedback({
          id: `fb-${i}`,
          feedbackType: i < 40 ? 'THUMBS_DOWN' : 'THUMBS_UP',
        }),
      );
      feedbackRepo.findByModelVersion.mockResolvedValue(feedback);

      const check = await service.checkRetrainingNeeded('v1.0');

      expect(check.needed).toBe(true);
      expect(check.reason).toContain('Negative feedback ratio');
    });

    it('should return needed when avg correction magnitude exceeds threshold', async () => {
      // RETRAINING_THRESHOLDS.MAX_AVG_CORRECTION = 20
      const feedback = Array.from({ length: 110 }, (_, i) =>
        makeCorrection({
          id: `fb-${i}`,
          correctionMagnitude: 30,
          feedbackType: 'SCORE_CORRECTION',
        }),
      );
      feedbackRepo.findByModelVersion.mockResolvedValue(feedback);

      const check = await service.checkRetrainingNeeded('v1.0');

      expect(check.needed).toBe(true);
      expect(check.reason).toContain('correction magnitude');
    });

    it('should return not needed when all metrics are below thresholds', async () => {
      const feedback = Array.from({ length: 110 }, (_, i) =>
        makeFeedback({
          id: `fb-${i}`,
          feedbackType: i < 10 ? 'THUMBS_DOWN' : 'THUMBS_UP',
        }),
      );
      feedbackRepo.findByModelVersion.mockResolvedValue(feedback);

      const check = await service.checkRetrainingNeeded('v1.0');

      expect(check.needed).toBe(false);
    });

    it('should use rolling window for finding feedback', async () => {
      feedbackRepo.findByModelVersion.mockResolvedValue([]);

      await service.checkRetrainingNeeded('v1.0');

      const call = feedbackRepo.findByModelVersion.mock.calls[0];
      expect(call[0]).toBe('v1.0');
      // Second argument should be a Date within the last 7 days
      expect(call[1]).toBeInstanceOf(Date);
      const daysDiff = (Date.now() - call[1].getTime()) / (24 * 60 * 60 * 1000);
      expect(daysDiff).toBeCloseTo(7, 0);
    });
  });

  // =========================================================================
  // exportTrainingData
  // =========================================================================

  describe('exportTrainingData', () => {
    it('should export corrections with lead data', async () => {
      const corrections = [
        makeCorrection({ id: 'fb-1', leadId: 'lead-1', correctedScore: 60 }),
        makeCorrection({ id: 'fb-2', leadId: 'lead-2', correctedScore: 40 }),
      ];
      feedbackRepo.findByModelVersion.mockResolvedValue(corrections);
      leadDataPort.getLeadData.mockImplementation((leadId: string) => ({
        email: `${leadId}@test.com`,
        company: 'Test Corp',
        title: 'Manager',
        source: 'WEBSITE',
      }));

      const result = await service.exportTrainingData(
        'v1.0',
        new Date('2025-01-01'),
        new Date('2025-02-01'),
        'exporter-1',
      );

      expect(result.corrections).toHaveLength(2);
      expect(result.modelVersion).toBe('v1.0');
      expect(result.recordCount).toBe(2);
      expect(result.exportedAt).toBeInstanceOf(Date);
      expect(result.corrections[0].leadData).toHaveProperty('email');
    });

    it('should filter out non-correction feedback', async () => {
      const mixed = [
        makeFeedback({ id: 'fb-1', feedbackType: 'THUMBS_UP' }),
        makeCorrection({ id: 'fb-2', correctedScore: 60 }),
        makeFeedback({ id: 'fb-3', feedbackType: 'THUMBS_DOWN' }),
      ];
      feedbackRepo.findByModelVersion.mockResolvedValue(mixed);
      leadDataPort.getLeadData.mockResolvedValue({ email: 'test@test.com', company: null, title: null, source: 'WEB' });

      const result = await service.exportTrainingData(
        'v1.0',
        new Date('2025-01-01'),
        new Date('2025-02-01'),
        'exporter-1',
      );

      expect(result.corrections).toHaveLength(1);
    });

    it('should handle null lead data gracefully', async () => {
      feedbackRepo.findByModelVersion.mockResolvedValue([
        makeCorrection({ id: 'fb-1', correctedScore: 60 }),
      ]);
      leadDataPort.getLeadData.mockResolvedValue(null);

      const result = await service.exportTrainingData(
        'v1.0',
        new Date('2025-01-01'),
        new Date('2025-02-01'),
        'exporter-1',
      );

      expect(result.corrections[0].leadData).toEqual({});
    });

    it('should publish TrainingDataExportedEvent', async () => {
      feedbackRepo.findByModelVersion.mockResolvedValue([
        makeCorrection({ correctedScore: 60 }),
      ]);
      leadDataPort.getLeadData.mockResolvedValue({ email: 'test@test.com', company: null, title: null, source: 'WEB' });

      await service.exportTrainingData(
        'v1.0',
        new Date('2025-01-01'),
        new Date('2025-02-01'),
        'exporter-1',
      );

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      const event = eventBus.publish.mock.calls[0][0];
      expect(event.eventType).toBe('ai.training_data.exported');
      expect(event.modelVersion).toBe('v1.0');
      expect(event.recordCount).toBe(1);
      expect(event.exportedBy).toBe('exporter-1');
    });

    it('should use UNKNOWN category when correctionCategory is null', async () => {
      feedbackRepo.findByModelVersion.mockResolvedValue([
        makeCorrection({ correctedScore: 60, correctionCategory: null }),
      ]);
      leadDataPort.getLeadData.mockResolvedValue({ email: 'test@test.com', company: null, title: null, source: 'WEB' });

      const result = await service.exportTrainingData(
        'v1.0',
        new Date('2025-01-01'),
        new Date('2025-02-01'),
        'exporter-1',
      );

      expect(result.corrections[0].category).toBe('UNKNOWN');
    });

    it('should return empty corrections when no corrections exist', async () => {
      feedbackRepo.findByModelVersion.mockResolvedValue([]);

      const result = await service.exportTrainingData(
        'v1.0',
        new Date('2025-01-01'),
        new Date('2025-02-01'),
        'exporter-1',
      );

      expect(result.corrections).toEqual([]);
      expect(result.recordCount).toBe(0);
    });
  });
});
