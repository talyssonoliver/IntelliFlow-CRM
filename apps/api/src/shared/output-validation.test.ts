/**
 * AI Output Validation Tests
 *
 * Comprehensive test suite for validating AI output schemas.
 * Ensures 100% of AI outputs conform to predefined Zod schemas
 * with proper confidence scoring.
 *
 * @module @intelliflow/api/shared/output-validation
 * @task IFC-022
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { leadScoreSchema, qualificationOutputSchema } from '@intelliflow/validators';
import {
  scoringResponseSchema,
  batchScoringResponseSchema,
  scoreOverrideSchema,
} from './scoring-output-schema.zod';
import { TEST_UUIDS } from '../test/setup';

// ============================================================================
// Test Data Factories
// ============================================================================

/**
 * Create valid lead score output
 */
function createValidLeadScore(overrides?: Partial<z.infer<typeof leadScoreSchema>>) {
  return {
    score: 75,
    confidence: 0.85,
    factors: [
      {
        name: 'email_quality',
        impact: 20,
        reasoning: 'Corporate email domain indicates professional context',
      },
      {
        name: 'profile_completeness',
        impact: 15,
        reasoning: 'Contact has title and company information',
      },
      {
        name: 'engagement_signals',
        impact: 25,
        reasoning: 'Multiple website visits and content downloads',
      },
    ],
    modelVersion: 'openai:gpt-4-turbo:v1',
    ...overrides,
  };
}

/**
 * Create valid qualification output
 */
function createValidQualificationOutput(
  overrides?: Partial<z.infer<typeof qualificationOutputSchema>>
) {
  return {
    qualified: true,
    qualificationLevel: 'HIGH' as const,
    confidence: 0.9,
    reasoning: 'Lead shows strong buying signals with budget authority and clear timeline',
    strengths: ['Decision maker role', 'Clear budget', 'Urgent timeline'],
    concerns: ['Small company size'],
    recommendedActions: [
      {
        action: 'Schedule discovery call',
        priority: 'HIGH' as const,
        reasoning: 'High engagement indicates readiness for sales conversation',
      },
    ],
    nextSteps: ['Send personalized email', 'Prepare demo materials'],
    estimatedConversionProbability: 0.75,
    ...overrides,
  };
}

/**
 * Create valid scoring response
 */
function createValidScoringResponse(
  overrides?: Partial<z.infer<typeof scoringResponseSchema>>
) {
  return {
    leadId: TEST_UUIDS.lead1,
    scoring: createValidLeadScore(),
    tier: 'WARM' as const,
    scoredAt: new Date().toISOString(),
    latencyMs: 150,
    ...overrides,
  };
}

// ============================================================================
// Schema Validation Tests
// ============================================================================

describe('AI Output Validation', () => {
  describe('Lead Score Schema', () => {
    describe('valid outputs', () => {
      it('should accept valid lead score with all fields', () => {
        const validScore = createValidLeadScore();
        const result = leadScoreSchema.safeParse(validScore);
        expect(result.success).toBe(true);
      });

      it('should accept minimum valid score (0)', () => {
        const validScore = createValidLeadScore({ score: 0 });
        const result = leadScoreSchema.safeParse(validScore);
        expect(result.success).toBe(true);
      });

      it('should accept maximum valid score (100)', () => {
        const validScore = createValidLeadScore({ score: 100 });
        const result = leadScoreSchema.safeParse(validScore);
        expect(result.success).toBe(true);
      });

      it('should accept minimum confidence (0)', () => {
        const validScore = createValidLeadScore({ confidence: 0 });
        const result = leadScoreSchema.safeParse(validScore);
        expect(result.success).toBe(true);
      });

      it('should accept maximum confidence (1)', () => {
        const validScore = createValidLeadScore({ confidence: 1 });
        const result = leadScoreSchema.safeParse(validScore);
        expect(result.success).toBe(true);
      });

      it('should accept empty factors array', () => {
        const validScore = createValidLeadScore({ factors: [] });
        const result = leadScoreSchema.safeParse(validScore);
        expect(result.success).toBe(true);
      });
    });

    describe('invalid outputs', () => {
      it('should reject score below 0', () => {
        const invalidScore = createValidLeadScore({ score: -1 });
        const result = leadScoreSchema.safeParse(invalidScore);
        expect(result.success).toBe(false);
      });

      it('should reject score above 100', () => {
        const invalidScore = createValidLeadScore({ score: 150 });
        const result = leadScoreSchema.safeParse(invalidScore);
        expect(result.success).toBe(false);
      });

      it('should reject non-integer score', () => {
        const invalidScore = createValidLeadScore({ score: 75.5 });
        const result = leadScoreSchema.safeParse(invalidScore);
        expect(result.success).toBe(false);
      });

      it('should reject confidence below 0', () => {
        const invalidScore = createValidLeadScore({ confidence: -0.1 });
        const result = leadScoreSchema.safeParse(invalidScore);
        expect(result.success).toBe(false);
      });

      it('should reject confidence above 1', () => {
        const invalidScore = createValidLeadScore({ confidence: 1.5 });
        const result = leadScoreSchema.safeParse(invalidScore);
        expect(result.success).toBe(false);
      });

      it('should reject missing modelVersion', () => {
        const { modelVersion: _, ...invalidScore } = createValidLeadScore();
        const result = leadScoreSchema.safeParse(invalidScore);
        expect(result.success).toBe(false);
      });

      it('should reject factor without name', () => {
        const invalidScore = createValidLeadScore({
          factors: [{ impact: 10, reasoning: 'Test' } as any],
        });
        const result = leadScoreSchema.safeParse(invalidScore);
        expect(result.success).toBe(false);
      });

      it('should reject factor without reasoning', () => {
        const invalidScore = createValidLeadScore({
          factors: [{ name: 'test', impact: 10 } as any],
        });
        const result = leadScoreSchema.safeParse(invalidScore);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Qualification Output Schema', () => {
    describe('valid outputs', () => {
      it('should accept valid qualification output', () => {
        const validOutput = createValidQualificationOutput();
        const result = qualificationOutputSchema.safeParse(validOutput);
        expect(result.success).toBe(true);
      });

      it('should accept all qualification levels', () => {
        const levels = ['HIGH', 'MEDIUM', 'LOW', 'UNQUALIFIED'] as const;
        for (const level of levels) {
          const output = createValidQualificationOutput({ qualificationLevel: level });
          const result = qualificationOutputSchema.safeParse(output);
          expect(result.success).toBe(true);
        }
      });

      it('should accept all action priorities', () => {
        const priorities = ['HIGH', 'MEDIUM', 'LOW'] as const;
        for (const priority of priorities) {
          const output = createValidQualificationOutput({
            recommendedActions: [
              {
                action: 'Test action',
                priority,
                reasoning: 'Test reasoning',
              },
            ],
          });
          const result = qualificationOutputSchema.safeParse(output);
          expect(result.success).toBe(true);
        }
      });

      it('should accept empty arrays for optional lists', () => {
        const output = createValidQualificationOutput({
          strengths: [],
          concerns: [],
          recommendedActions: [],
          nextSteps: [],
        });
        const result = qualificationOutputSchema.safeParse(output);
        expect(result.success).toBe(true);
      });
    });

    describe('invalid outputs', () => {
      it('should reject invalid qualification level', () => {
        const invalidOutput = createValidQualificationOutput({
          qualificationLevel: 'SUPER_HIGH' as any,
        });
        const result = qualificationOutputSchema.safeParse(invalidOutput);
        expect(result.success).toBe(false);
      });

      it('should reject invalid action priority', () => {
        const invalidOutput = createValidQualificationOutput({
          recommendedActions: [
            {
              action: 'Test',
              priority: 'CRITICAL' as any,
              reasoning: 'Test',
            },
          ],
        });
        const result = qualificationOutputSchema.safeParse(invalidOutput);
        expect(result.success).toBe(false);
      });

      it('should reject confidence above 1', () => {
        const invalidOutput = createValidQualificationOutput({ confidence: 1.5 });
        const result = qualificationOutputSchema.safeParse(invalidOutput);
        expect(result.success).toBe(false);
      });

      it('should reject missing reasoning', () => {
        const { reasoning: _, ...invalidOutput } = createValidQualificationOutput();
        const result = qualificationOutputSchema.safeParse(invalidOutput);
        expect(result.success).toBe(false);
      });

      it('should reject estimatedConversionProbability above 1', () => {
        const invalidOutput = createValidQualificationOutput({
          estimatedConversionProbability: 1.2,
        });
        const result = qualificationOutputSchema.safeParse(invalidOutput);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Scoring Response Schema', () => {
    describe('valid outputs', () => {
      it('should accept valid scoring response', () => {
        const validResponse = createValidScoringResponse();
        const result = scoringResponseSchema.safeParse(validResponse);
        expect(result.success).toBe(true);
      });

      it('should accept all tier values', () => {
        const tiers = ['HOT', 'WARM', 'COLD'] as const;
        for (const tier of tiers) {
          const response = createValidScoringResponse({ tier });
          const result = scoringResponseSchema.safeParse(response);
          expect(result.success).toBe(true);
        }
      });

      it('should accept zero latency', () => {
        const response = createValidScoringResponse({ latencyMs: 0 });
        const result = scoringResponseSchema.safeParse(response);
        expect(result.success).toBe(true);
      });
    });

    describe('invalid outputs', () => {
      it('should reject invalid UUID for leadId', () => {
        const invalidResponse = createValidScoringResponse({
          leadId: 'not-a-uuid',
        });
        const result = scoringResponseSchema.safeParse(invalidResponse);
        expect(result.success).toBe(false);
      });

      it('should reject invalid tier', () => {
        const invalidResponse = createValidScoringResponse({
          tier: 'BURNING' as any,
        });
        const result = scoringResponseSchema.safeParse(invalidResponse);
        expect(result.success).toBe(false);
      });

      it('should reject negative latency', () => {
        const invalidResponse = createValidScoringResponse({ latencyMs: -1 });
        const result = scoringResponseSchema.safeParse(invalidResponse);
        expect(result.success).toBe(false);
      });

      it('should reject invalid datetime format', () => {
        const invalidResponse = createValidScoringResponse({
          scoredAt: 'not-a-date',
        });
        const result = scoringResponseSchema.safeParse(invalidResponse);
        expect(result.success).toBe(false);
      });
    });
  });
});

// ============================================================================
// Confidence Score Validation Tests
// ============================================================================

describe('Confidence Score Validation', () => {
  describe('range validation', () => {
    it('should accept confidence at exactly 0.0', () => {
      const score = createValidLeadScore({ confidence: 0 });
      const result = leadScoreSchema.safeParse(score);
      expect(result.success).toBe(true);
    });

    it('should accept confidence at exactly 1.0', () => {
      const score = createValidLeadScore({ confidence: 1 });
      const result = leadScoreSchema.safeParse(score);
      expect(result.success).toBe(true);
    });

    it('should accept confidence at 0.5 (threshold boundary)', () => {
      const score = createValidLeadScore({ confidence: 0.5 });
      const result = leadScoreSchema.safeParse(score);
      expect(result.success).toBe(true);
    });

    it('should reject NaN confidence', () => {
      const score = createValidLeadScore({ confidence: NaN });
      const result = leadScoreSchema.safeParse(score);
      expect(result.success).toBe(false);
    });

    it('should reject Infinity confidence', () => {
      const score = createValidLeadScore({ confidence: Infinity });
      const result = leadScoreSchema.safeParse(score);
      expect(result.success).toBe(false);
    });
  });

  describe('human review threshold detection', () => {
    const HUMAN_REVIEW_THRESHOLD = 0.5;

    it('should identify outputs requiring human review (confidence < 0.5)', () => {
      const lowConfidenceScores = [0.0, 0.1, 0.2, 0.3, 0.4, 0.49];

      for (const confidence of lowConfidenceScores) {
        const score = createValidLeadScore({ confidence });
        const result = leadScoreSchema.safeParse(score);
        expect(result.success).toBe(true);

        if (result.success) {
          const requiresHumanReview = result.data.confidence < HUMAN_REVIEW_THRESHOLD;
          expect(requiresHumanReview).toBe(true);
        }
      }
    });

    it('should identify outputs NOT requiring human review (confidence >= 0.5)', () => {
      const highConfidenceScores = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

      for (const confidence of highConfidenceScores) {
        const score = createValidLeadScore({ confidence });
        const result = leadScoreSchema.safeParse(score);
        expect(result.success).toBe(true);

        if (result.success) {
          const requiresHumanReview = result.data.confidence < HUMAN_REVIEW_THRESHOLD;
          expect(requiresHumanReview).toBe(false);
        }
      }
    });
  });

  describe('error fallback confidence', () => {
    it('should accept fallback confidence of 0 on error', () => {
      // Error fallback pattern from scoring chain
      const errorFallback = {
        score: 0,
        confidence: 0,
        factors: [
          {
            name: 'error',
            impact: 0,
            reasoning: 'Scoring failed: API timeout',
          },
        ],
        modelVersion: 'error:v1',
      };

      const result = leadScoreSchema.safeParse(errorFallback);
      expect(result.success).toBe(true);
    });

    it('should accept fallback confidence of 0.1 on parsing error', () => {
      // Fallback from qualification agent when parsing fails
      const parsingErrorFallback = createValidQualificationOutput({
        qualified: false,
        qualificationLevel: 'UNQUALIFIED',
        confidence: 0.1,
        reasoning: 'Unable to complete qualification analysis due to parsing error',
        strengths: [],
        concerns: ['Analysis incomplete - requires manual review'],
      });

      const result = qualificationOutputSchema.safeParse(parsingErrorFallback);
      expect(result.success).toBe(true);
      expect(result.data?.confidence).toBe(0.1);
    });
  });
});

// ============================================================================
// Edge Cases and Error Handling Tests
// ============================================================================

describe('Edge Cases and Error Handling', () => {
  describe('malformed output handling', () => {
    it('should reject null input', () => {
      const result = leadScoreSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it('should reject undefined input', () => {
      const result = leadScoreSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    it('should reject empty object', () => {
      const result = leadScoreSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject array instead of object', () => {
      const result = leadScoreSchema.safeParse([1, 2, 3]);
      expect(result.success).toBe(false);
    });

    it('should reject string instead of object', () => {
      const result = leadScoreSchema.safeParse('invalid');
      expect(result.success).toBe(false);
    });

    it('should reject number instead of object', () => {
      const result = leadScoreSchema.safeParse(42);
      expect(result.success).toBe(false);
    });
  });

  describe('partial output handling', () => {
    it('should reject output with only score', () => {
      const partial = { score: 75 };
      const result = leadScoreSchema.safeParse(partial);
      expect(result.success).toBe(false);
    });

    it('should reject output without confidence', () => {
      const { confidence: _, ...noConfidence } = createValidLeadScore();
      const result = leadScoreSchema.safeParse(noConfidence);
      expect(result.success).toBe(false);
    });

    it('should reject output without factors', () => {
      const { factors: _, ...noFactors } = createValidLeadScore();
      const result = leadScoreSchema.safeParse(noFactors);
      expect(result.success).toBe(false);
    });
  });

  describe('type coercion handling', () => {
    it('should reject string score even if numeric', () => {
      const stringScore = createValidLeadScore({ score: '75' as any });
      const result = leadScoreSchema.safeParse(stringScore);
      expect(result.success).toBe(false);
    });

    it('should reject string confidence even if numeric', () => {
      const stringConfidence = createValidLeadScore({ confidence: '0.85' as any });
      const result = leadScoreSchema.safeParse(stringConfidence);
      expect(result.success).toBe(false);
    });

    it('should reject boolean instead of number', () => {
      const booleanScore = createValidLeadScore({ score: true as any });
      const result = leadScoreSchema.safeParse(booleanScore);
      expect(result.success).toBe(false);
    });
  });

  describe('special character handling in strings', () => {
    it('should accept reasoning with special characters', () => {
      const score = createValidLeadScore({
        factors: [
          {
            name: 'test',
            impact: 10,
            reasoning: "User's email contains special chars: test+tag@example.com",
          },
        ],
      });
      const result = leadScoreSchema.safeParse(score);
      expect(result.success).toBe(true);
    });

    it('should accept reasoning with unicode characters', () => {
      const score = createValidLeadScore({
        factors: [
          {
            name: 'international',
            impact: 15,
            reasoning: 'Company name: Société Générale (フランス)',
          },
        ],
      });
      const result = leadScoreSchema.safeParse(score);
      expect(result.success).toBe(true);
    });

    it('should accept empty string reasoning', () => {
      const score = createValidLeadScore({
        factors: [
          {
            name: 'minimal',
            impact: 5,
            reasoning: '',
          },
        ],
      });
      const result = leadScoreSchema.safeParse(score);
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// Batch Response Validation Tests
// ============================================================================

describe('Batch Scoring Response Validation', () => {
  it('should accept valid batch response', () => {
    const batchResponse = {
      results: [createValidScoringResponse(), createValidScoringResponse()],
      summary: {
        totalProcessed: 2,
        averageScore: 75,
        averageConfidence: 0.85,
        averageLatencyMs: 150,
        tierDistribution: {
          hot: 0,
          warm: 2,
          cold: 0,
        },
      },
    };

    const result = batchScoringResponseSchema.safeParse(batchResponse);
    expect(result.success).toBe(true);
  });

  it('should accept empty results array', () => {
    const emptyBatch = {
      results: [],
      summary: {
        totalProcessed: 0,
        averageScore: 0,
        averageConfidence: 0,
        averageLatencyMs: 0,
        tierDistribution: {
          hot: 0,
          warm: 0,
          cold: 0,
        },
      },
    };

    const result = batchScoringResponseSchema.safeParse(emptyBatch);
    expect(result.success).toBe(true);
  });

  it('should reject negative tier counts', () => {
    const invalidBatch = {
      results: [],
      summary: {
        totalProcessed: 0,
        averageScore: 0,
        averageConfidence: 0,
        averageLatencyMs: 0,
        tierDistribution: {
          hot: -1,
          warm: 0,
          cold: 0,
        },
      },
    };

    const result = batchScoringResponseSchema.safeParse(invalidBatch);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Score Override Validation Tests
// ============================================================================

describe('Score Override Validation', () => {
  it('should accept valid score override', () => {
    const override = {
      leadId: TEST_UUIDS.lead1,
      overrideScore: 90,
      reason: 'Manual review determined higher qualification based on phone conversation',
      overriddenBy: TEST_UUIDS.user1,
    };

    const result = scoreOverrideSchema.safeParse(override);
    expect(result.success).toBe(true);
  });

  it('should reject reason shorter than 10 characters', () => {
    const override = {
      leadId: TEST_UUIDS.lead1,
      overrideScore: 90,
      reason: 'Too short',
      overriddenBy: TEST_UUIDS.user1,
    };

    const result = scoreOverrideSchema.safeParse(override);
    expect(result.success).toBe(false);
  });

  it('should reject reason longer than 500 characters', () => {
    const override = {
      leadId: TEST_UUIDS.lead1,
      overrideScore: 90,
      reason: 'x'.repeat(501),
      overriddenBy: TEST_UUIDS.user1,
    };

    const result = scoreOverrideSchema.safeParse(override);
    expect(result.success).toBe(false);
  });

  it('should reject invalid UUID for overriddenBy', () => {
    const override = {
      leadId: TEST_UUIDS.lead1,
      overrideScore: 90,
      reason: 'Valid reason with enough characters',
      overriddenBy: 'not-a-uuid',
    };

    const result = scoreOverrideSchema.safeParse(override);
    expect(result.success).toBe(false);
  });
});
