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

// Mock LLM factory — prediction.job.ts instantiates ChurnRiskChain,
// LeadQualificationAgent, NextBestActionAgent, etc. whose constructors call
// createLLM() and open a real LiteLLM/OpenAI connection. Without this mock
// the tests hit their 10s timeout waiting on "Connection error." retries.
//
// M15 note: QUALIFICATION now routes to LeadQualificationAgent instead of
// LeadScoringChain. The agent calls invokeLLM() → model.invoke() (returns
// '{}'), then structuredModel = model.withStructuredOutput(qualificationOutputSchema).
// The stub object below does NOT satisfy qualificationOutputSchema (missing
// qualified/qualificationLevel/etc.), so the agent's internal try/catch fires
// and returns its conservative fallback: { qualificationLevel: 'UNQUALIFIED', ... }.
// processQualification maps 'UNQUALIFIED' → 'NOT_QUALIFIED', preserving the
// contract tests that assert prediction.value === 'NOT_QUALIFIED'.
vi.mock('../lib/llm-factory.js', () => ({
  createLLM: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({ content: '{}' }),
    withStructuredOutput: vi.fn(() => ({
      invoke: vi.fn().mockResolvedValue({
        // Union shape across chains prediction.job.ts touches: churn-risk
        // (riskScore/topRiskFactors), NBA recommendations, and sentiment preflight.
        // The qualification agent's structuredModel.invoke() receives this stub;
        // it fails qualificationOutputSchema validation → agent returns its own
        // UNQUALIFIED fallback.
        score: 0,
        factors: [{ name: 'stub', impact: -0.1, reasoning: 'Stubbed by test mock' }],
        modelVersion: 'mock:v1',
        riskScore: 0.35,
        topRiskFactors: [
          { factor: 'engagement-trend', value: 'low', impact: 'medium', reasoning: 'stub' },
        ],
        explanation: 'Mock provider fallback',
        recommendations: ['Monitor engagement metrics weekly'],
        primaryAction: 'MONITOR',
        sentiment: 'NEUTRAL',
        sentimentScore: 0,
        emotions: [{ emotion: 'TRUST', intensity: 0.5 }],
        primaryEmotion: 'TRUST',
        urgency: 'LOW',
        urgencyScore: 0.4,
        keyPhrases: [{ phrase: 'stub', sentiment: 'neutral' }],
        confidence: 0,
        reasoning: 'Stubbed by test mock',
      }),
    })),
  })),
  createEmbeddings: vi.fn(() => ({
    embedQuery: vi.fn().mockResolvedValue([]),
    embedDocuments: vi.fn().mockResolvedValue([]),
  })),
}));

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
  tenantId: '56789012-0000-4000-8000-000056789012',
  userId: '67890123-0000-4000-8000-000067890123',
};

// Standard tenant context for NBA tests (IFC-095 P1 security requirement)
const TENANT_CONTEXT = {
  tenantId: TEST_UUIDS.tenantId,
  userId: TEST_UUIDS.userId,
};

// Create mock job
function createMockJob(data: PredictionJobData): Job<PredictionJobData> {
  return {
    data,
    id: 'test-job-id',
    name: 'prediction',
    updateProgress: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
    // prediction.job.ts calls job.extendLock during the LLM call to prevent
    // BullMQ stall detection — mirrors scoring.job.ts:310 / insight-
    // generation.job.test.ts:86.
    token: 'test-lock-token',
    extendLock: vi.fn().mockResolvedValue(undefined),
    progress: 0,
    attemptsMade: 0,
  } as any; // partial mock of BullMQ Job<PredictionJobData>
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
      tenantId: TEST_UUIDS.tenantId,
      priority: 5,
    };

    it('should reject when top-level tenantId is missing (H5/M8)', () => {
      const { tenantId: _omit, ...withoutTenant } = validJobData;
      void _omit;
      const result = PredictionJobDataSchema.safeParse(withoutTenant);
      expect(result.success).toBe(false);
    });

    it('should reject when top-level tenantId is empty string (H5/M8)', () => {
      const result = PredictionJobDataSchema.safeParse({ ...validJobData, tenantId: '' });
      expect(result.success).toBe(false);
    });

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
        tenantId: TEST_UUIDS.tenantId,
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
        tenantId: TEST_UUIDS.tenantId,
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processPredictionJob(job);

      expect(result.entityType).toBe('contact');
      expect(result.entityId).toBe(TEST_UUIDS.contact1);
      expect(result.predictionType).toBe('CHURN_RISK');
      // Real AI chain returns dynamic values - check valid ranges
      expect(typeof result.prediction.value).toBe('number');
      expect(result.prediction.value).toBeGreaterThanOrEqual(0);
      expect(result.prediction.value).toBeLessThanOrEqual(1);
      expect(result.prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(result.prediction.confidence).toBeLessThanOrEqual(1);
      expect(typeof result.prediction.explanation).toBe('string');
      expect(result.prediction.explanation.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should include context in churn risk processing', async () => {
      const jobData: PredictionJobData = {
        entityType: 'account',
        entityId: TEST_UUIDS.account1,
        predictionType: 'CHURN_RISK',
        tenantId: TEST_UUIDS.tenantId,
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
        tenantId: TEST_UUIDS.tenantId,
        context: TENANT_CONTEXT, // IFC-095 P1: userId lives in context
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processPredictionJob(job);

      expect(result.entityType).toBe('opportunity');
      expect(result.entityId).toBe(TEST_UUIDS.opportunity1);
      expect(result.predictionType).toBe('NEXT_BEST_ACTION');
      // Real AI agent returns dynamic values - check valid structure
      expect(typeof result.prediction.value).toBe('string');
      expect(result.prediction.value.length).toBeGreaterThan(0);
      expect(result.prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(result.prediction.confidence).toBeLessThanOrEqual(1);
      expect(typeof result.prediction.explanation).toBe('string');
      expect(result.prediction.explanation.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should return actionable recommendations for NBA', async () => {
      const jobData: PredictionJobData = {
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
        predictionType: 'NEXT_BEST_ACTION',
        tenantId: TEST_UUIDS.tenantId,
        context: TENANT_CONTEXT, // IFC-095 P1: userId lives in context
        priority: 5,
      };

      const job = createMockJob(jobData);
      const result = await processPredictionJob(job);

      // Real AI agent returns dynamic recommendations - verify they are actionable strings
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
      result.recommendations.forEach((rec: string) => {
        expect(typeof rec).toBe('string');
        expect(rec.length).toBeGreaterThan(0);
      });
    });
  });

  // ============================================
  // Job Processing Tests - Qualification
  // ============================================

  describe('processPredictionJob - QUALIFICATION', () => {
    it('returns NOT_QUALIFIED when agent structuredOutput stub does not match schema', async () => {
      const jobData: PredictionJobData = {
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
        predictionType: 'QUALIFICATION',
        tenantId: TEST_UUIDS.tenantId,
        priority: 5,
      };

      const job = createMockJob(jobData);
      // M15: QUALIFICATION now routes to LeadQualificationAgent.
      // The LLM mock's withStructuredOutput().invoke() returns a stub that does NOT
      // satisfy qualificationOutputSchema (missing qualified/qualificationLevel/etc.),
      // so LeadQualificationAgent.executeTask's try/catch fires and returns its own
      // conservative fallback: { qualificationLevel: 'UNQUALIFIED', confidence: 0.1, ... }.
      // processQualification maps 'UNQUALIFIED' → 'NOT_QUALIFIED', preserving the contract.
      const result = await processPredictionJob(job);
      expect(result.entityType).toBe('lead');
      expect(result.prediction.value).toBe('NOT_QUALIFIED');
      // confidence comes from agent's calculateConfidence() applied to the fallback output
      expect(result.prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(result.prediction.confidence).toBeLessThanOrEqual(1);
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
        tenantId: TEST_UUIDS.tenantId,
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
        tenantId: TEST_UUIDS.tenantId,
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
        tenantId: TEST_UUIDS.tenantId,
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
        tenantId: TEST_UUIDS.tenantId,
        context: TENANT_CONTEXT, // IFC-095 P1: userId lives in context
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
        entityType: 'contact',
        entityId: TEST_UUIDS.contact1,
        predictionType: 'CHURN_RISK',
        tenantId: TEST_UUIDS.tenantId,
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
        tenantId: TEST_UUIDS.tenantId,
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
          tenantId: TEST_UUIDS.tenantId,
          priority: 5,
        };

        const job = createMockJob(jobData);
        const result = await processPredictionJob(job);

        expect(result.entityType).toBe(entityType);
        expect(result.predictionType).toBe('CHURN_RISK');
      }
    });

    it('should handle all prediction types (QUALIFICATION returns NOT_QUALIFIED via agent UNQUALIFIED fallback)', async () => {
      for (const predictionType of PredictionTypes) {
        const jobData: PredictionJobData = {
          entityType: 'lead',
          entityId: TEST_UUIDS.lead1,
          predictionType,
          tenantId: TEST_UUIDS.tenantId,
          // IFC-095 P1: NEXT_BEST_ACTION requires tenant context for userId
          context: predictionType === 'NEXT_BEST_ACTION' ? TENANT_CONTEXT : undefined,
          priority: 5,
        };

        const job = createMockJob(jobData);
        const result = await processPredictionJob(job);
        expect(result.predictionType).toBe(predictionType);
        expect(result.prediction).toBeDefined();
        if (predictionType === 'QUALIFICATION') {
          // M15: LeadQualificationAgent's structuredOutput stub fails validation,
          // returns UNQUALIFIED conservative fallback, mapped to NOT_QUALIFIED.
          expect(result.prediction.value).toBe('NOT_QUALIFIED');
          expect(result.prediction.confidence).toBeGreaterThanOrEqual(0);
          expect(result.prediction.confidence).toBeLessThanOrEqual(1);
        } else {
          expect(result.recommendations).toBeDefined();
        }
      }
    });
  });
});

// ============================================================================
// Feature Flag Tests — ai.prediction.enabled
// ============================================================================

describe('processPredictionJob — feature flag ai.prediction.enabled', () => {
  const flagJobData: PredictionJobData = {
    entityType: 'lead',
    entityId: TEST_UUIDS.lead1,
    predictionType: 'CHURN_RISK',
    tenantId: TEST_UUIDS.tenantId,
    context: TENANT_CONTEXT,
    priority: 5,
  };

  it('should return early with skipped result when flag is disabled', async () => {
    vi.stubEnv('ENABLE_AI_PREDICTION_JOB', 'false');
    const job = createMockJob(flagJobData);
    const result = (await processPredictionJob(job)) as any;
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('feature-flag-disabled');
  });

  it('should NOT update job progress when flag is disabled', async () => {
    vi.stubEnv('ENABLE_AI_PREDICTION_JOB', 'false');
    const job = createMockJob(flagJobData);
    await processPredictionJob(job);
    expect(job.updateProgress).not.toHaveBeenCalled();
  });

  it('should process normally when flag is enabled', async () => {
    vi.stubEnv('ENABLE_AI_PREDICTION_JOB', 'true');
    const job = createMockJob(flagJobData);
    const result = (await processPredictionJob(job)) as any;
    expect(result.skipped).toBeUndefined();
    expect(result.predictionType).toBe('CHURN_RISK');
  });

  it('should process normally when env var is absent (default-on)', async () => {
    delete process.env['ENABLE_AI_PREDICTION_JOB'];
    const job = createMockJob(flagJobData);
    const result = (await processPredictionJob(job)) as any;
    expect(result.skipped).toBeUndefined();
  });
});
