/**
 * Prediction Job Tests
 *
 * @implements IFC-168: Prediction Job Handler
 *
 * Tests for BullMQ job handler for processing AI prediction requests:
 * - Schema validation
 * - Prediction type routing
 * - Churn risk processing
 * - Next best action processing
 * - Qualification processing
 * - Job processing flow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import {
  PREDICTION_QUEUE,
  PredictionTypes,
  PredictionJobDataSchema,
  PredictionJobResultSchema,
  processPredictionJob,
  DEFAULT_PREDICTION_JOB_OPTIONS,
  type PredictionJobData,
  type PredictionJobResult,
  type PredictionType,
} from './prediction.job';

// Test UUID constants
const TEST_UUIDS = {
  lead1: '12345678-0000-4000-8000-000012345678',
  contact1: '23456789-0000-4000-8000-000023456789',
  opportunity1: '34567890-0000-4000-8000-000034567890',
  account1: '45678901-0000-4000-8000-000045678901',
};

// Create mock job
function createMockJob(data: PredictionJobData): Job<PredictionJobData> {
  return {
    data,
    id: 'test-job-id',
    name: 'prediction',
    updateProgress: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
    progress: 0,
    attemptsMade: 0,
  } as unknown as Job<PredictionJobData>;
}

describe('PredictionJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // Queue Name Tests
  // ============================================

  describe('PREDICTION_QUEUE', () => {
    it('should have the correct queue name', () => {
      expect(PREDICTION_QUEUE).toBe('ai-prediction');
    });
  });

  // ============================================
  // Prediction Types Tests
  // ============================================

  describe('PredictionTypes', () => {
    it('should include CHURN_RISK', () => {
      expect(PredictionTypes).toContain('CHURN_RISK');
    });

    it('should include NEXT_BEST_ACTION', () => {
      expect(PredictionTypes).toContain('NEXT_BEST_ACTION');
    });

    it('should include QUALIFICATION', () => {
      expect(PredictionTypes).toContain('QUALIFICATION');
    });

    it('should have exactly 3 prediction types', () => {
      expect(PredictionTypes).toHaveLength(3);
    });
  });

  // ============================================
  // Schema Validation Tests
  // ============================================

  describe('PredictionJobDataSchema', () => {
    const validJobData: PredictionJobData = {
      entityType: 'lead',
      entityId: TEST_UUIDS.lead1,
      predictionType: 'CHURN_RISK',
      priority: 5,
    };

    it('should validate a complete job data object', () => {
      const result = PredictionJobDataSchema.safeParse(validJobData);
      expect(result.success).toBe(true);
    });

    it('should validate with optional context', () => {
      const dataWithContext = {
        ...validJobData,
        context: {
          lastActivity: '2025-01-20',
          supportTickets: 3,
          engagementScore: 0.75,
        },
      };

      const result = PredictionJobDataSchema.safeParse(dataWithContext);
      expect(result.success).toBe(true);
    });

    it('should validate with optional correlationId', () => {
      const dataWithCorrelation = {
        ...validJobData,
        correlationId: 'corr-12345',
      };

      const result = PredictionJobDataSchema.safeParse(dataWithCorrelation);
      expect(result.success).toBe(true);
    });

    it('should reject invalid entity type', () => {
      const invalidData = {
        ...validJobData,
        entityType: 'invalid_entity',
      };

      const result = PredictionJobDataSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should accept all valid entity types', () => {
      const entityTypes = ['lead', 'contact', 'opportunity', 'account'] as const;

      entityTypes.forEach((entityType) => {
        const testData = { ...validJobData, entityType };
        const result = PredictionJobDataSchema.safeParse(testData);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid UUID', () => {
      const invalidData = {
        ...validJobData,
        entityId: 'not-a-uuid',
      };

      const result = PredictionJobDataSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid prediction type', () => {
      const invalidData = {
        ...validJobData,
        predictionType: 'INVALID_TYPE',
      };

      const result = PredictionJobDataSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should accept all valid prediction types', () => {
      PredictionTypes.forEach((predictionType) => {
        const testData = { ...validJobData, predictionType };
        const result = PredictionJobDataSchema.safeParse(testData);
        expect(result.success).toBe(true);
      });
    });

    it('should reject priority out of range', () => {
      const invalidData = {
        ...validJobData,
        priority: 15,
      };

      const result = PredictionJobDataSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should default priority to 5', () => {
      const dataWithoutPriority = {
        entityType: 'lead' as const,
        entityId: TEST_UUIDS.lead1,
        predictionType: 'CHURN_RISK' as const,
      };

      const result = PredictionJobDataSchema.parse(dataWithoutPriority);
      expect(result.priority).toBe(5);
    });
  });

  describe('PredictionJobResultSchema', () => {
    const validResult: PredictionJobResult = {
      entityType: 'lead',
      entityId: TEST_UUIDS.lead1,
      predictionType: 'CHURN_RISK',
      prediction: {
        value: 0.35,
        confidence: 0.85,
        explanation: 'Based on engagement patterns',
      },
      recommendations: ['Schedule a check-in call'],
      processedAt: new Date().toISOString(),
      processingTimeMs: 150,
    };

    it('should validate a complete result object', () => {
      const result = PredictionJobResultSchema.safeParse(validResult);
      expect(result.success).toBe(true);
    });

    it('should accept string prediction value', () => {
      const stringValueResult = {
        ...validResult,
        prediction: {
          value: 'FOLLOW_UP_CALL',
          confidence: 0.78,
          explanation: 'High engagement detected',
        },
      };

      const result = PredictionJobResultSchema.safeParse(stringValueResult);
      expect(result.success).toBe(true);
    });

    it('should accept boolean prediction value', () => {
      const booleanValueResult = {
        ...validResult,
        prediction: {
          value: true,
          confidence: 0.82,
          explanation: 'Meets criteria',
        },
      };

      const result = PredictionJobResultSchema.safeParse(booleanValueResult);
      expect(result.success).toBe(true);
    });

    it('should accept number prediction value', () => {
      const numberValueResult = {
        ...validResult,
        prediction: {
          value: 0.75,
          confidence: 0.9,
          explanation: 'Risk score calculated',
        },
      };

      const result = PredictionJobResultSchema.safeParse(numberValueResult);
      expect(result.success).toBe(true);
    });

    it('should reject confidence out of range', () => {
      const invalidResult = {
        ...validResult,
        prediction: {
          ...validResult.prediction,
          confidence: 1.5,
        },
      };

      const result = PredictionJobResultSchema.safeParse(invalidResult);
      expect(result.success).toBe(false);
    });

    it('should reject invalid UUID in entityId', () => {
      const invalidResult = {
        ...validResult,
        entityId: 'not-a-uuid',
      };

      const result = PredictionJobResultSchema.safeParse(invalidResult);
      expect(result.success).toBe(false);
    });

    it('should accept empty recommendations array', () => {
      const emptyRecommendations = {
        ...validResult,
        recommendations: [],
      };

      const result = PredictionJobResultSchema.safeParse(emptyRecommendations);
      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // Job Processing Tests - Churn Risk
  // ============================================

  describe('processPredictionJob - CHURN_RISK', () => {
    it('should process churn risk prediction', async () => {
      const jobData: PredictionJobData = {
        entityType: 'contact',
        entityId: TEST_UUIDS.contact1,
        predictionType: 'CHURN_RISK',
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processPredictionJob(job);

      expect(result.entityType).toBe('contact');
      expect(result.entityId).toBe(TEST_UUIDS.contact1);
      expect(result.predictionType).toBe('CHURN_RISK');
      expect(result.prediction.value).toBe(0.35);
      expect(result.prediction.confidence).toBe(0.85);
      expect(result.prediction.explanation).toContain('engagement patterns');
      expect(result.recommendations).toHaveLength(3);
      expect(result.recommendations).toContain('Schedule a check-in call');
    });

    it('should include context in churn risk processing', async () => {
      const jobData: PredictionJobData = {
        entityType: 'account',
        entityId: TEST_UUIDS.account1,
        predictionType: 'CHURN_RISK',
        context: {
          lastActivityDate: '2025-01-15',
          supportTicketCount: 5,
          contractEndDate: '2025-06-01',
        },
        priority: 8,
      };

      const job = createMockJob(jobData);
      const result = await processPredictionJob(job);

      expect(result.entityType).toBe('account');
      expect(result.predictionType).toBe('CHURN_RISK');
    });
  });

  // ============================================
  // Job Processing Tests - Next Best Action
  // ============================================

  describe('processPredictionJob - NEXT_BEST_ACTION', () => {
    it('should process next best action prediction', async () => {
      const jobData: PredictionJobData = {
        entityType: 'opportunity',
        entityId: TEST_UUIDS.opportunity1,
        predictionType: 'NEXT_BEST_ACTION',
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processPredictionJob(job);

      expect(result.entityType).toBe('opportunity');
      expect(result.entityId).toBe(TEST_UUIDS.opportunity1);
      expect(result.predictionType).toBe('NEXT_BEST_ACTION');
      expect(result.prediction.value).toBe('FOLLOW_UP_CALL');
      expect(result.prediction.confidence).toBe(0.78);
      expect(result.prediction.explanation).toContain('High engagement');
      expect(result.recommendations).toHaveLength(3);
      expect(result.recommendations).toContain('Call within 48 hours');
    });

    it('should return actionable recommendations for NBA', async () => {
      const jobData: PredictionJobData = {
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
        predictionType: 'NEXT_BEST_ACTION',
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processPredictionJob(job);

      expect(result.recommendations).toContain('Prepare ROI case study');
      expect(result.recommendations).toContain('Discuss expansion options');
    });
  });

  // ============================================
  // Job Processing Tests - Qualification
  // ============================================

  describe('processPredictionJob - QUALIFICATION', () => {
    it('should process qualification prediction', async () => {
      const jobData: PredictionJobData = {
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
        predictionType: 'QUALIFICATION',
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processPredictionJob(job);

      expect(result.entityType).toBe('lead');
      expect(result.entityId).toBe(TEST_UUIDS.lead1);
      expect(result.predictionType).toBe('QUALIFICATION');
      expect(result.prediction.value).toBe('QUALIFIED');
      expect(result.prediction.confidence).toBe(0.82);
      expect(result.prediction.explanation).toContain('BANT criteria');
      expect(result.recommendations).toHaveLength(3);
    });

    it('should return qualification-specific recommendations', async () => {
      const jobData: PredictionJobData = {
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
        predictionType: 'QUALIFICATION',
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processPredictionJob(job);

      expect(result.recommendations).toContain('Schedule discovery call');
      expect(result.recommendations).toContain('Send pricing information');
      expect(result.recommendations).toContain('Assign to sales rep');
    });
  });

  // ============================================
  // Job Processing Flow Tests
  // ============================================

  describe('processPredictionJob - flow', () => {
    it('should update job progress throughout processing', async () => {
      const jobData: PredictionJobData = {
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
        predictionType: 'CHURN_RISK',
        priority: 5,
      };

      const job = createMockJob(jobData);
      await processPredictionJob(job);

      // Should call updateProgress multiple times: 10, 90, 100
      expect(job.updateProgress).toHaveBeenCalledTimes(3);
      expect(job.updateProgress).toHaveBeenCalledWith(10);
      expect(job.updateProgress).toHaveBeenCalledWith(90);
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should include processing time in result', async () => {
      const jobData: PredictionJobData = {
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
        predictionType: 'CHURN_RISK',
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processPredictionJob(job);

      expect(typeof result.processingTimeMs).toBe('number');
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include ISO timestamp in processedAt', async () => {
      const jobData: PredictionJobData = {
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
        predictionType: 'CHURN_RISK',
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processPredictionJob(job);

      // Verify it's a valid ISO date string
      const parsedDate = new Date(result.processedAt);
      expect(parsedDate.toISOString()).toBe(result.processedAt);
    });

    it('should return result matching PredictionJobResultSchema', async () => {
      const jobData: PredictionJobData = {
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
        predictionType: 'NEXT_BEST_ACTION',
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processPredictionJob(job);

      // Validate the result matches the schema
      const validation = PredictionJobResultSchema.safeParse(result);
      expect(validation.success).toBe(true);
    });

    it('should preserve entityType and entityId from input', async () => {
      const jobData: PredictionJobData = {
        entityType: 'opportunity',
        entityId: TEST_UUIDS.opportunity1,
        predictionType: 'QUALIFICATION',
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processPredictionJob(job);

      expect(result.entityType).toBe(jobData.entityType);
      expect(result.entityId).toBe(jobData.entityId);
      expect(result.predictionType).toBe(jobData.predictionType);
    });
  });

  // ============================================
  // Job Options Tests
  // ============================================

  describe('DEFAULT_PREDICTION_JOB_OPTIONS', () => {
    it('should have correct retry attempts', () => {
      expect(DEFAULT_PREDICTION_JOB_OPTIONS.attempts).toBe(3);
    });

    it('should have exponential backoff', () => {
      expect(DEFAULT_PREDICTION_JOB_OPTIONS.backoff.type).toBe('exponential');
      expect(DEFAULT_PREDICTION_JOB_OPTIONS.backoff.delay).toBe(1000);
    });

    it('should remove completed jobs after 24 hours', () => {
      expect(DEFAULT_PREDICTION_JOB_OPTIONS.removeOnComplete.age).toBe(24 * 60 * 60);
    });

    it('should remove failed jobs after 7 days', () => {
      expect(DEFAULT_PREDICTION_JOB_OPTIONS.removeOnFail.age).toBe(7 * 24 * 60 * 60);
    });

    it('should keep max 1000 completed jobs', () => {
      expect(DEFAULT_PREDICTION_JOB_OPTIONS.removeOnComplete.count).toBe(1000);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('edge cases', () => {
    it('should handle empty context', async () => {
      const jobData: PredictionJobData = {
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
        predictionType: 'CHURN_RISK',
        context: {},
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processPredictionJob(job);

      expect(result).toBeDefined();
      expect(result.prediction).toBeDefined();
    });

    it('should handle all entity types with CHURN_RISK', async () => {
      const entityTypes = ['lead', 'contact', 'opportunity', 'account'] as const;

      for (const entityType of entityTypes) {
        const jobData: PredictionJobData = {
          entityType,
          entityId: TEST_UUIDS.lead1,
          predictionType: 'CHURN_RISK',
          priority: 5,
        };

        const job = createMockJob(jobData);
        const result = await processPredictionJob(job);

        expect(result.entityType).toBe(entityType);
        expect(result.predictionType).toBe('CHURN_RISK');
      }
    });

    it('should handle all prediction types', async () => {
      for (const predictionType of PredictionTypes) {
        const jobData: PredictionJobData = {
          entityType: 'lead',
          entityId: TEST_UUIDS.lead1,
          predictionType,
          priority: 5,
        };

        const job = createMockJob(jobData);
        const result = await processPredictionJob(job);

        expect(result.predictionType).toBe(predictionType);
        expect(result.prediction).toBeDefined();
        expect(result.recommendations).toBeDefined();
      }
    });
  });
});
