/**
 * AI Review Validators Tests
 *
 * Tests for AI Output Review Zod schemas (IFC-176)
 * Following Single Source of Truth pattern - schemas derived from domain constants.
 *
 * IMPLEMENTS: IFC-176 (AI Output Review - Validators Layer)
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  // Domain constants (re-exported from validators)
  AI_OUTPUT_TYPES,
  REVIEW_STATUSES,
  REVIEW_DECISIONS,
  AUDIT_EVENT_TYPES,
  REVIEW_SLA_CONFIG,
  // Enum schemas
  aiOutputTypeSchema,
  reviewStatusSchema,
  reviewDecisionSchema,
  auditEventTypeSchema,
  // Confidence
  reviewConfidenceSchema,
  isValidConfidence,
  // Input schemas
  createReviewInputSchema,
  reviewDecisionInputSchema,
  // Filter schema
  reviewListFilterSchema,
  // Audit schema
  auditLogEntrySchema,
  // Batch schema
  reviewBatchSchema,
  // Response schemas
  reviewResponseSchema,
  reviewListResponseSchema,
  // Type exports
  type AIOutputType,
  type ReviewStatus,
  type ReviewDecision,
  type AuditEventType,
  type CreateReviewInput,
  type ReviewDecisionInput,
  type ReviewListFilter,
  type AuditLogEntry,
  type ReviewBatch,
  type ReviewResponse,
  type ReviewListResponse,
} from '../ai-review';

// Import domain types for consistency verification
import {
  AI_OUTPUT_TYPES as DOMAIN_AI_OUTPUT_TYPES,
  REVIEW_STATUSES as DOMAIN_REVIEW_STATUSES,
  REVIEW_DECISIONS as DOMAIN_REVIEW_DECISIONS,
  AUDIT_EVENT_TYPES as DOMAIN_AUDIT_EVENT_TYPES,
  REVIEW_SLA_CONFIG as DOMAIN_REVIEW_SLA_CONFIG,
} from '@intelliflow/domain';

// Test helper: valid UUID
const validUUID = '550e8400-e29b-41d4-a716-446655440000';
const validUUID2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('AI Review Validators', () => {
  // ============================================
  // Enum Schema Tests (54 tests)
  // ============================================

  describe('Enum Schemas', () => {
    // -----------------------------------------
    // aiOutputTypeSchema (9 tests)
    // -----------------------------------------
    describe('aiOutputTypeSchema', () => {
      it.each(AI_OUTPUT_TYPES)('should accept valid type: %s', (type) => {
        expect(aiOutputTypeSchema.safeParse(type).success).toBe(true);
      });

      it('should reject invalid output type', () => {
        expect(aiOutputTypeSchema.safeParse('INVALID').success).toBe(false);
      });

      it('should reject empty string', () => {
        expect(aiOutputTypeSchema.safeParse('').success).toBe(false);
      });

      it('should have correct type inference', () => {
        type Inferred = z.infer<typeof aiOutputTypeSchema>;
        const _check: Inferred = 'LEAD_SCORING';
        expect(typeof _check).toBe('string');
      });
    });

    // -----------------------------------------
    // reviewStatusSchema (9 tests)
    // -----------------------------------------
    describe('reviewStatusSchema', () => {
      it.each(REVIEW_STATUSES)('should accept valid status: %s', (status) => {
        expect(reviewStatusSchema.safeParse(status).success).toBe(true);
      });

      it('should reject invalid status', () => {
        expect(reviewStatusSchema.safeParse('INVALID').success).toBe(false);
      });

      it('should reject empty string', () => {
        expect(reviewStatusSchema.safeParse('').success).toBe(false);
      });

      it('should have correct type inference', () => {
        type Inferred = z.infer<typeof reviewStatusSchema>;
        const _check: Inferred = 'PENDING';
        expect(typeof _check).toBe('string');
      });
    });

    // -----------------------------------------
    // reviewDecisionSchema (9 tests)
    // -----------------------------------------
    describe('reviewDecisionSchema', () => {
      it.each(REVIEW_DECISIONS)('should accept valid decision: %s', (decision) => {
        expect(reviewDecisionSchema.safeParse(decision).success).toBe(true);
      });

      it('should reject invalid decision', () => {
        expect(reviewDecisionSchema.safeParse('INVALID').success).toBe(false);
      });

      it('should reject empty string', () => {
        expect(reviewDecisionSchema.safeParse('').success).toBe(false);
      });

      it('should have correct type inference', () => {
        type Inferred = z.infer<typeof reviewDecisionSchema>;
        const _check: Inferred = 'APPROVED';
        expect(typeof _check).toBe('string');
      });
    });

    // -----------------------------------------
    // auditEventTypeSchema (9 tests)
    // -----------------------------------------
    describe('auditEventTypeSchema', () => {
      it.each(AUDIT_EVENT_TYPES)('should accept valid event type: %s', (eventType) => {
        expect(auditEventTypeSchema.safeParse(eventType).success).toBe(true);
      });

      it('should reject invalid event type', () => {
        expect(auditEventTypeSchema.safeParse('INVALID').success).toBe(false);
      });

      it('should reject empty string', () => {
        expect(auditEventTypeSchema.safeParse('').success).toBe(false);
      });

      it('should have correct type inference', () => {
        type Inferred = z.infer<typeof auditEventTypeSchema>;
        const _check: Inferred = 'REVIEW_REQUESTED';
        expect(typeof _check).toBe('string');
      });
    });
  });

  // ============================================
  // Confidence Schema Tests (20 tests)
  // ============================================

  describe('reviewConfidenceSchema', () => {
    // Valid values (5 tests)
    it('should accept 0 (boundary)', () => {
      expect(reviewConfidenceSchema.safeParse(0).success).toBe(true);
    });

    it('should accept 0.5 (midpoint)', () => {
      expect(reviewConfidenceSchema.safeParse(0.5).success).toBe(true);
    });

    it('should accept 1 (boundary)', () => {
      expect(reviewConfidenceSchema.safeParse(1).success).toBe(true);
    });

    it('should accept 0.001 (near zero)', () => {
      expect(reviewConfidenceSchema.safeParse(0.001).success).toBe(true);
    });

    it('should accept 0.999 (near one)', () => {
      expect(reviewConfidenceSchema.safeParse(0.999).success).toBe(true);
    });

    // Invalid values (10 tests)
    it('should reject -0.1 (below zero)', () => {
      expect(reviewConfidenceSchema.safeParse(-0.1).success).toBe(false);
    });

    it('should reject 1.1 (above one)', () => {
      expect(reviewConfidenceSchema.safeParse(1.1).success).toBe(false);
    });

    it('should reject NaN', () => {
      expect(reviewConfidenceSchema.safeParse(NaN).success).toBe(false);
    });

    it('should reject Infinity', () => {
      expect(reviewConfidenceSchema.safeParse(Infinity).success).toBe(false);
    });

    it('should reject -Infinity', () => {
      expect(reviewConfidenceSchema.safeParse(-Infinity).success).toBe(false);
    });

    it('should reject null', () => {
      expect(reviewConfidenceSchema.safeParse(null).success).toBe(false);
    });

    it('should reject undefined', () => {
      expect(reviewConfidenceSchema.safeParse(undefined).success).toBe(false);
    });

    it('should reject string "0.5"', () => {
      expect(reviewConfidenceSchema.safeParse('0.5').success).toBe(false);
    });

    it('should reject object', () => {
      expect(reviewConfidenceSchema.safeParse({ value: 0.5 }).success).toBe(false);
    });

    it('should reject array', () => {
      expect(reviewConfidenceSchema.safeParse([0.5]).success).toBe(false);
    });

    // Edge cases (5 tests)
    it('should accept Number.MIN_VALUE (near zero positive)', () => {
      expect(reviewConfidenceSchema.safeParse(Number.MIN_VALUE).success).toBe(true);
    });

    it('should reject Number.MAX_VALUE (too large)', () => {
      expect(reviewConfidenceSchema.safeParse(Number.MAX_VALUE).success).toBe(false);
    });

    it('should have correct error message for below zero', () => {
      const result = reviewConfidenceSchema.safeParse(-0.5);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('>=');
      }
    });

    it('should have correct error message for above one', () => {
      const result = reviewConfidenceSchema.safeParse(1.5);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('<=');
      }
    });

    it('should have correct error message for NaN', () => {
      const result = reviewConfidenceSchema.safeParse(NaN);
      expect(result.success).toBe(false);
      if (!result.success) {
        // Zod returns "Expected number, received nan" for NaN values
        expect(result.error.issues[0].message.toLowerCase()).toContain('nan');
      }
    });
  });

  // ============================================
  // isValidConfidence Type Guard Tests (8 tests)
  // ============================================

  describe('isValidConfidence', () => {
    it('should return true for valid confidence', () => {
      expect(isValidConfidence(0.5)).toBe(true);
    });

    it('should return true for 0', () => {
      expect(isValidConfidence(0)).toBe(true);
    });

    it('should return true for 1', () => {
      expect(isValidConfidence(1)).toBe(true);
    });

    it('should return false for NaN', () => {
      expect(isValidConfidence(NaN)).toBe(false);
    });

    it('should return false for Infinity', () => {
      expect(isValidConfidence(Infinity)).toBe(false);
    });

    it('should return false for string', () => {
      expect(isValidConfidence('0.5')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isValidConfidence(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidConfidence(undefined)).toBe(false);
    });

    it('should return false for out of range (negative)', () => {
      expect(isValidConfidence(-0.1)).toBe(false);
    });

    it('should return false for out of range (above 1)', () => {
      expect(isValidConfidence(1.1)).toBe(false);
    });

    it('should narrow type correctly', () => {
      const value: unknown = 0.5;
      if (isValidConfidence(value)) {
        // Type should be narrowed to number
        const result: number = value;
        expect(result).toBe(0.5);
      }
    });
  });

  // ============================================
  // createReviewInputSchema Tests (40 tests)
  // ============================================

  describe('createReviewInputSchema', () => {
    const validInput = {
      tenantId: validUUID,
      outputType: 'LEAD_SCORING' as const,
      outputPayload: { score: 85 },
      confidence: 0.85,
    };

    // Valid inputs (15 tests)
    it('should accept valid input with all fields', () => {
      const input = { ...validInput, slaHours: 48 };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept valid input without optional slaHours', () => {
      const result = createReviewInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should apply default slaHours of 24', () => {
      const result = createReviewInputSchema.parse(validInput);
      expect(result.slaHours).toBe(REVIEW_SLA_CONFIG.DEFAULT_SLA_HOURS);
    });

    it.each(AI_OUTPUT_TYPES)('should accept outputType: %s', (type) => {
      const input = { ...validInput, outputType: type };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept confidence at boundary 0', () => {
      const input = { ...validInput, confidence: 0 };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept confidence at boundary 1', () => {
      const input = { ...validInput, confidence: 1 };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept unknown outputPayload (object)', () => {
      const input = { ...validInput, outputPayload: { nested: { deep: true } } };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept unknown outputPayload (array)', () => {
      const input = { ...validInput, outputPayload: [1, 2, 3] };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept unknown outputPayload (string)', () => {
      const input = { ...validInput, outputPayload: 'raw text' };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept slaHours of 1 (minimum)', () => {
      const input = { ...validInput, slaHours: 1 };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept slaHours of 168 (maximum - 1 week)', () => {
      const input = { ...validInput, slaHours: 168 };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    // Invalid inputs (20 tests)
    it('should reject missing tenantId', () => {
      const { tenantId, ...input } = validInput;
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid tenantId format', () => {
      const input = { ...validInput, tenantId: 'not-a-uuid' };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing outputType', () => {
      const { outputType, ...input } = validInput;
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid outputType', () => {
      const input = { ...validInput, outputType: 'INVALID_TYPE' };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing confidence', () => {
      const { confidence, ...input } = validInput;
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject confidence below 0', () => {
      const input = { ...validInput, confidence: -0.1 };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject confidence above 1', () => {
      const input = { ...validInput, confidence: 1.1 };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject NaN confidence', () => {
      const input = { ...validInput, confidence: NaN };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject Infinity confidence', () => {
      const input = { ...validInput, confidence: Infinity };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject slaHours below 1', () => {
      const input = { ...validInput, slaHours: 0 };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject slaHours above 168', () => {
      const input = { ...validInput, slaHours: 169 };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer slaHours', () => {
      const input = { ...validInput, slaHours: 24.5 };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject negative slaHours', () => {
      const input = { ...validInput, slaHours: -1 };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    // Error path verification (5 tests)
    it('should report correct path for tenantId error', () => {
      const input = { ...validInput, tenantId: 'invalid' };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('tenantId');
      }
    });

    it('should report correct path for outputType error', () => {
      const input = { ...validInput, outputType: 'INVALID' };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('outputType');
      }
    });

    it('should report correct path for confidence error', () => {
      const input = { ...validInput, confidence: 2 };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('confidence');
      }
    });

    it('should report correct path for slaHours error', () => {
      const input = { ...validInput, slaHours: 500 };
      const result = createReviewInputSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('slaHours');
      }
    });

    it('should have correct type inference', () => {
      const result = createReviewInputSchema.parse(validInput);
      const _typeCheck: CreateReviewInput = result;
      expect(_typeCheck.tenantId).toBe(validUUID);
    });
  });

  // ============================================
  // reviewDecisionInputSchema Tests (40 tests)
  // ============================================

  describe('reviewDecisionInputSchema', () => {
    const validApprovedInput = {
      reviewId: validUUID,
      decision: 'APPROVED' as const,
    };

    const validRejectedInput = {
      reviewId: validUUID,
      decision: 'REJECTED_QUALITY' as const,
      notes: 'The output quality is too low for production use.',
    };

    // Valid inputs (15 tests)
    it('should accept APPROVED without notes', () => {
      const result = reviewDecisionInputSchema.safeParse(validApprovedInput);
      expect(result.success).toBe(true);
    });

    it('should accept APPROVED with notes', () => {
      const input = { ...validApprovedInput, notes: 'Looks good!' };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept REJECTED_QUALITY with notes', () => {
      const result = reviewDecisionInputSchema.safeParse(validRejectedInput);
      expect(result.success).toBe(true);
    });

    it('should accept REJECTED_ACCURACY with notes', () => {
      const input = {
        reviewId: validUUID,
        decision: 'REJECTED_ACCURACY' as const,
        notes: 'Inaccurate data detected.',
      };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept REJECTED_SAFETY with notes', () => {
      const input = {
        reviewId: validUUID,
        decision: 'REJECTED_SAFETY' as const,
        notes: 'Safety concerns identified.',
      };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept ESCALATED without notes', () => {
      const input = {
        reviewId: validUUID,
        decision: 'ESCALATED' as const,
      };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept ESCALATED with notes', () => {
      const input = {
        reviewId: validUUID,
        decision: 'ESCALATED' as const,
        notes: 'Need senior review.',
      };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept notes at maximum length (2000 chars)', () => {
      const input = {
        ...validRejectedInput,
        notes: 'x'.repeat(2000),
      };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it.each(REVIEW_DECISIONS.filter((d) => !d.startsWith('REJECTED')))(
      'should accept %s without notes',
      (decision) => {
        const input = { reviewId: validUUID, decision };
        const result = reviewDecisionInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    );

    // Invalid inputs - rejection without notes (10 tests)
    it('should reject REJECTED_QUALITY without notes', () => {
      const input = {
        reviewId: validUUID,
        decision: 'REJECTED_QUALITY' as const,
      };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject REJECTED_QUALITY with empty notes', () => {
      const input = {
        reviewId: validUUID,
        decision: 'REJECTED_QUALITY' as const,
        notes: '',
      };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject REJECTED_QUALITY with whitespace-only notes', () => {
      const input = {
        reviewId: validUUID,
        decision: 'REJECTED_QUALITY' as const,
        notes: '   \t\n  ',
      };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject REJECTED_ACCURACY without notes', () => {
      const input = {
        reviewId: validUUID,
        decision: 'REJECTED_ACCURACY' as const,
      };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject REJECTED_ACCURACY with empty notes', () => {
      const input = {
        reviewId: validUUID,
        decision: 'REJECTED_ACCURACY' as const,
        notes: '',
      };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject REJECTED_SAFETY without notes', () => {
      const input = {
        reviewId: validUUID,
        decision: 'REJECTED_SAFETY' as const,
      };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject REJECTED_SAFETY with empty notes', () => {
      const input = {
        reviewId: validUUID,
        decision: 'REJECTED_SAFETY' as const,
        notes: '',
      };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    // Invalid inputs - other errors (10 tests)
    it('should reject missing reviewId', () => {
      const { reviewId, ...input } = validApprovedInput;
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid reviewId', () => {
      const input = { ...validApprovedInput, reviewId: 'not-a-uuid' };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing decision', () => {
      const result = reviewDecisionInputSchema.safeParse({ reviewId: validUUID });
      expect(result.success).toBe(false);
    });

    it('should reject invalid decision', () => {
      const input = { reviewId: validUUID, decision: 'INVALID_DECISION' };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject notes exceeding 2000 chars', () => {
      const input = {
        ...validRejectedInput,
        notes: 'x'.repeat(2001),
      };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    // Error path verification (5 tests)
    it('should report notes path for rejection without notes', () => {
      const input = {
        reviewId: validUUID,
        decision: 'REJECTED_QUALITY' as const,
        notes: '',
      };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('notes');
      }
    });

    it('should report reviewId path for invalid UUID', () => {
      const input = { ...validApprovedInput, reviewId: 'invalid' };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('reviewId');
      }
    });

    it('should report decision path for invalid decision', () => {
      const input = { reviewId: validUUID, decision: 'INVALID' };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('decision');
      }
    });

    it('should have correct type inference', () => {
      const result = reviewDecisionInputSchema.parse(validRejectedInput);
      const _typeCheck: ReviewDecisionInput = result;
      expect(_typeCheck.decision).toBe('REJECTED_QUALITY');
    });

    it('should have correct error message for missing rejection notes', () => {
      const input = {
        reviewId: validUUID,
        decision: 'REJECTED_QUALITY' as const,
      };
      const result = reviewDecisionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Notes are required');
      }
    });
  });

  // ============================================
  // reviewListFilterSchema Tests (30 tests)
  // ============================================

  describe('reviewListFilterSchema', () => {
    // Defaults (5 tests)
    it('should apply default page of 1', () => {
      const result = reviewListFilterSchema.parse({});
      expect(result.page).toBe(1);
    });

    it('should apply default limit of 20', () => {
      const result = reviewListFilterSchema.parse({});
      expect(result.limit).toBe(20);
    });

    it('should apply default sortBy of createdAt', () => {
      const result = reviewListFilterSchema.parse({});
      expect(result.sortBy).toBe('createdAt');
    });

    it('should apply default sortOrder of desc', () => {
      const result = reviewListFilterSchema.parse({});
      expect(result.sortOrder).toBe('desc');
    });

    it('should accept empty filter', () => {
      const result = reviewListFilterSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    // Valid filters (15 tests)
    it('should accept status array', () => {
      const result = reviewListFilterSchema.safeParse({
        status: ['PENDING', 'IN_REVIEW'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept outputType array', () => {
      const result = reviewListFilterSchema.safeParse({
        outputType: ['LEAD_SCORING', 'SENTIMENT_ANALYSIS'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept minConfidence', () => {
      const result = reviewListFilterSchema.safeParse({ minConfidence: 0.5 });
      expect(result.success).toBe(true);
    });

    it('should accept maxConfidence', () => {
      const result = reviewListFilterSchema.safeParse({ maxConfidence: 0.9 });
      expect(result.success).toBe(true);
    });

    it('should accept confidenceThreshold', () => {
      const result = reviewListFilterSchema.safeParse({ confidenceThreshold: 0.7 });
      expect(result.success).toBe(true);
    });

    it('should accept slaBreached boolean true', () => {
      const result = reviewListFilterSchema.safeParse({ slaBreached: true });
      expect(result.success).toBe(true);
    });

    it('should accept slaBreached boolean false', () => {
      const result = reviewListFilterSchema.safeParse({ slaBreached: false });
      expect(result.success).toBe(true);
    });

    it('should accept escalationDepth', () => {
      const result = reviewListFilterSchema.safeParse({ escalationDepth: 2 });
      expect(result.success).toBe(true);
    });

    it('should accept escalationDepth at max (3)', () => {
      const result = reviewListFilterSchema.safeParse({
        escalationDepth: REVIEW_SLA_CONFIG.MAX_ESCALATION_DEPTH,
      });
      expect(result.success).toBe(true);
    });

    it('should accept tenantId filter', () => {
      const result = reviewListFilterSchema.safeParse({ tenantId: validUUID });
      expect(result.success).toBe(true);
    });

    it('should accept reviewerId filter', () => {
      const result = reviewListFilterSchema.safeParse({ reviewerId: validUUID });
      expect(result.success).toBe(true);
    });

    it('should accept sortBy slaDeadline', () => {
      const result = reviewListFilterSchema.safeParse({ sortBy: 'slaDeadline' });
      expect(result.success).toBe(true);
    });

    it('should accept sortBy confidence', () => {
      const result = reviewListFilterSchema.safeParse({ sortBy: 'confidence' });
      expect(result.success).toBe(true);
    });

    it('should accept sortBy escalationDepth', () => {
      const result = reviewListFilterSchema.safeParse({ sortBy: 'escalationDepth' });
      expect(result.success).toBe(true);
    });

    it('should accept sortOrder asc', () => {
      const result = reviewListFilterSchema.safeParse({ sortOrder: 'asc' });
      expect(result.success).toBe(true);
    });

    // Invalid filters (10 tests)
    it('should reject page below 1', () => {
      const result = reviewListFilterSchema.safeParse({ page: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject negative page', () => {
      const result = reviewListFilterSchema.safeParse({ page: -1 });
      expect(result.success).toBe(false);
    });

    it('should reject limit above 100', () => {
      const result = reviewListFilterSchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });

    it('should reject limit below 1', () => {
      const result = reviewListFilterSchema.safeParse({ limit: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject invalid status', () => {
      const result = reviewListFilterSchema.safeParse({
        status: ['INVALID_STATUS'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid outputType', () => {
      const result = reviewListFilterSchema.safeParse({
        outputType: ['INVALID_TYPE'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject escalationDepth above max', () => {
      const result = reviewListFilterSchema.safeParse({
        escalationDepth: REVIEW_SLA_CONFIG.MAX_ESCALATION_DEPTH + 1,
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative escalationDepth', () => {
      const result = reviewListFilterSchema.safeParse({ escalationDepth: -1 });
      expect(result.success).toBe(false);
    });

    it('should reject invalid sortBy', () => {
      const result = reviewListFilterSchema.safeParse({ sortBy: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should reject invalid sortOrder', () => {
      const result = reviewListFilterSchema.safeParse({ sortOrder: 'random' });
      expect(result.success).toBe(false);
    });

    it('should have correct type inference', () => {
      const result = reviewListFilterSchema.parse({ page: 2, limit: 50 });
      const _typeCheck: ReviewListFilter = result;
      expect(_typeCheck.page).toBe(2);
    });
  });

  // ============================================
  // auditLogEntrySchema Tests (10 tests)
  // ============================================

  describe('auditLogEntrySchema', () => {
    const validAuditEntry = {
      id: validUUID,
      reviewId: validUUID2,
      eventType: 'REVIEW_REQUESTED' as const,
      actorType: 'SYSTEM' as const,
      timestamp: '2026-02-03T10:00:00.000Z',
    };

    it('should accept valid audit entry (system)', () => {
      const result = auditLogEntrySchema.safeParse(validAuditEntry);
      expect(result.success).toBe(true);
    });

    it('should accept valid audit entry with actorId (user)', () => {
      const input = {
        ...validAuditEntry,
        actorId: validUUID,
        actorType: 'USER' as const,
      };
      const result = auditLogEntrySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept audit entry with metadata', () => {
      const input = {
        ...validAuditEntry,
        metadata: { reason: 'SLA breach', level: 2 },
      };
      const result = auditLogEntrySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should coerce date string to Date', () => {
      const result = auditLogEntrySchema.parse(validAuditEntry);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it.each(AUDIT_EVENT_TYPES)('should accept eventType: %s', (eventType) => {
      const input = { ...validAuditEntry, eventType };
      const result = auditLogEntrySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid eventType', () => {
      const input = { ...validAuditEntry, eventType: 'INVALID' };
      const result = auditLogEntrySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid actorType', () => {
      const input = { ...validAuditEntry, actorType: 'BOT' };
      const result = auditLogEntrySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid id', () => {
      const input = { ...validAuditEntry, id: 'not-uuid' };
      const result = auditLogEntrySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid reviewId', () => {
      const input = { ...validAuditEntry, reviewId: 'not-uuid' };
      const result = auditLogEntrySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should have correct type inference', () => {
      const result = auditLogEntrySchema.parse(validAuditEntry);
      const _typeCheck: AuditLogEntry = result;
      expect(_typeCheck.eventType).toBe('REVIEW_REQUESTED');
    });
  });

  // ============================================
  // reviewBatchSchema Tests (10 tests)
  // ============================================

  describe('reviewBatchSchema', () => {
    const validReviewInput = {
      tenantId: validUUID,
      outputType: 'LEAD_SCORING' as const,
      outputPayload: { score: 85 },
      confidence: 0.85,
    };

    it('should accept empty array', () => {
      const result = reviewBatchSchema.safeParse([]);
      expect(result.success).toBe(true);
    });

    it('should accept single valid review', () => {
      const result = reviewBatchSchema.safeParse([validReviewInput]);
      expect(result.success).toBe(true);
    });

    it('should accept array of valid reviews', () => {
      const reviews = Array(10).fill(validReviewInput);
      const result = reviewBatchSchema.safeParse(reviews);
      expect(result.success).toBe(true);
    });

    it('should accept exactly 100 items (max)', () => {
      const reviews = Array(100).fill(validReviewInput);
      const result = reviewBatchSchema.safeParse(reviews);
      expect(result.success).toBe(true);
    });

    it('should reject array exceeding 100 items', () => {
      const reviews = Array(101).fill(validReviewInput);
      const result = reviewBatchSchema.safeParse(reviews);
      expect(result.success).toBe(false);
    });

    it('should reject array with invalid item', () => {
      const reviews = [validReviewInput, { invalid: true }];
      const result = reviewBatchSchema.safeParse(reviews);
      expect(result.success).toBe(false);
    });

    it('should reject array with invalid confidence', () => {
      const reviews = [{ ...validReviewInput, confidence: 2 }];
      const result = reviewBatchSchema.safeParse(reviews);
      expect(result.success).toBe(false);
    });

    it('should reject non-array input', () => {
      const result = reviewBatchSchema.safeParse(validReviewInput);
      expect(result.success).toBe(false);
    });

    it('should apply defaults to items', () => {
      const result = reviewBatchSchema.parse([validReviewInput]);
      expect(result[0].slaHours).toBe(REVIEW_SLA_CONFIG.DEFAULT_SLA_HOURS);
    });

    it('should have correct type inference', () => {
      const result = reviewBatchSchema.parse([validReviewInput]);
      const _typeCheck: ReviewBatch = result;
      expect(_typeCheck.length).toBe(1);
    });
  });

  // ============================================
  // reviewResponseSchema Tests (10 tests)
  // ============================================

  describe('reviewResponseSchema', () => {
    const validResponse = {
      id: validUUID,
      tenantId: validUUID2,
      outputType: 'LEAD_SCORING' as const,
      outputPayload: { score: 85 },
      confidence: 0.85,
      status: 'PENDING' as const,
      slaDeadline: '2026-02-04T10:00:00.000Z',
      escalationDepth: 0,
      lockedBy: null,
      lockedAt: null,
      lockExpiresAt: null,
      reviewerId: null,
      reviewDecision: null,
      reviewNotes: null,
      createdAt: '2026-02-03T10:00:00.000Z',
      updatedAt: '2026-02-03T10:00:00.000Z',
    };

    it('should accept valid response', () => {
      const result = reviewResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should coerce date strings to Date', () => {
      const result = reviewResponseSchema.parse(validResponse);
      expect(result.slaDeadline).toBeInstanceOf(Date);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('should accept response with reviewer details', () => {
      const input = {
        ...validResponse,
        status: 'APPROVED' as const,
        lockedBy: validUUID,
        lockedAt: '2026-02-03T10:30:00.000Z',
        lockExpiresAt: '2026-02-03T10:35:00.000Z',
        reviewerId: validUUID,
        reviewDecision: 'APPROVED' as const,
        reviewNotes: 'Looks good!',
      };
      const result = reviewResponseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it.each(REVIEW_STATUSES)('should accept status: %s', (status) => {
      const input = { ...validResponse, status };
      const result = reviewResponseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const input = { ...validResponse, status: 'INVALID' };
      const result = reviewResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid outputType', () => {
      const input = { ...validResponse, outputType: 'INVALID' };
      const result = reviewResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject negative escalationDepth', () => {
      const input = { ...validResponse, escalationDepth: -1 };
      const result = reviewResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid id', () => {
      const input = { ...validResponse, id: 'not-uuid' };
      const result = reviewResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should have correct type inference', () => {
      const result = reviewResponseSchema.parse(validResponse);
      const _typeCheck: ReviewResponse = result;
      expect(_typeCheck.status).toBe('PENDING');
    });
  });

  // ============================================
  // reviewListResponseSchema Tests (10 tests)
  // ============================================

  describe('reviewListResponseSchema', () => {
    const validResponse = {
      id: validUUID,
      tenantId: validUUID2,
      outputType: 'LEAD_SCORING' as const,
      outputPayload: { score: 85 },
      confidence: 0.85,
      status: 'PENDING' as const,
      slaDeadline: '2026-02-04T10:00:00.000Z',
      escalationDepth: 0,
      lockedBy: null,
      lockedAt: null,
      lockExpiresAt: null,
      reviewerId: null,
      reviewDecision: null,
      reviewNotes: null,
      createdAt: '2026-02-03T10:00:00.000Z',
      updatedAt: '2026-02-03T10:00:00.000Z',
    };

    const validListResponse = {
      data: [validResponse],
      total: 1,
      page: 1,
      limit: 20,
      hasMore: false,
    };

    it('should accept valid list response', () => {
      const result = reviewListResponseSchema.safeParse(validListResponse);
      expect(result.success).toBe(true);
    });

    it('should accept empty data array', () => {
      const input = { ...validListResponse, data: [], total: 0 };
      const result = reviewListResponseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept hasMore true', () => {
      const input = { ...validListResponse, hasMore: true, total: 100 };
      const result = reviewListResponseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject negative total', () => {
      const input = { ...validListResponse, total: -1 };
      const result = reviewListResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject page below 1', () => {
      const input = { ...validListResponse, page: 0 };
      const result = reviewListResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject limit above 100', () => {
      const input = { ...validListResponse, limit: 101 };
      const result = reviewListResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject limit below 1', () => {
      const input = { ...validListResponse, limit: 0 };
      const result = reviewListResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid data item', () => {
      const input = { ...validListResponse, data: [{ invalid: true }] };
      const result = reviewListResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing hasMore', () => {
      const { hasMore, ...input } = validListResponse;
      const result = reviewListResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should have correct type inference', () => {
      const result = reviewListResponseSchema.parse(validListResponse);
      const _typeCheck: ReviewListResponse = result;
      expect(_typeCheck.data.length).toBe(1);
    });
  });

  // ============================================
  // Consistency Tests (20 tests)
  // ============================================

  describe('Consistency Tests', () => {
    describe('Enum values match domain constants', () => {
      it('aiOutputTypeSchema accepts all AI_OUTPUT_TYPES', () => {
        DOMAIN_AI_OUTPUT_TYPES.forEach((type) => {
          expect(aiOutputTypeSchema.safeParse(type).success).toBe(true);
        });
      });

      it('reviewStatusSchema accepts all REVIEW_STATUSES', () => {
        DOMAIN_REVIEW_STATUSES.forEach((status) => {
          expect(reviewStatusSchema.safeParse(status).success).toBe(true);
        });
      });

      it('reviewDecisionSchema accepts all REVIEW_DECISIONS', () => {
        DOMAIN_REVIEW_DECISIONS.forEach((decision) => {
          expect(reviewDecisionSchema.safeParse(decision).success).toBe(true);
        });
      });

      it('auditEventTypeSchema accepts all AUDIT_EVENT_TYPES', () => {
        DOMAIN_AUDIT_EVENT_TYPES.forEach((type) => {
          expect(auditEventTypeSchema.safeParse(type).success).toBe(true);
        });
      });
    });

    describe('Re-exports match domain constants', () => {
      it('AI_OUTPUT_TYPES is re-exported correctly', () => {
        expect(AI_OUTPUT_TYPES).toEqual(DOMAIN_AI_OUTPUT_TYPES);
      });

      it('REVIEW_STATUSES is re-exported correctly', () => {
        expect(REVIEW_STATUSES).toEqual(DOMAIN_REVIEW_STATUSES);
      });

      it('REVIEW_DECISIONS is re-exported correctly', () => {
        expect(REVIEW_DECISIONS).toEqual(DOMAIN_REVIEW_DECISIONS);
      });

      it('AUDIT_EVENT_TYPES is re-exported correctly', () => {
        expect(AUDIT_EVENT_TYPES).toEqual(DOMAIN_AUDIT_EVENT_TYPES);
      });

      it('REVIEW_SLA_CONFIG is re-exported correctly', () => {
        expect(REVIEW_SLA_CONFIG).toEqual(DOMAIN_REVIEW_SLA_CONFIG);
      });
    });

    describe('Type inference matches domain types', () => {
      it('AIOutputType matches domain type', () => {
        // Compile-time type check - if this compiles, types match
        const domainType: (typeof DOMAIN_AI_OUTPUT_TYPES)[number] = 'LEAD_SCORING';
        const validatorType: AIOutputType = domainType;
        expect(validatorType).toBe(domainType);
      });

      it('ReviewStatus matches domain type', () => {
        const domainType: (typeof DOMAIN_REVIEW_STATUSES)[number] = 'PENDING';
        const validatorType: ReviewStatus = domainType;
        expect(validatorType).toBe(domainType);
      });

      it('ReviewDecision matches domain type', () => {
        const domainType: (typeof DOMAIN_REVIEW_DECISIONS)[number] = 'APPROVED';
        const validatorType: ReviewDecision = domainType;
        expect(validatorType).toBe(domainType);
      });

      it('AuditEventType matches domain type', () => {
        const domainType: (typeof DOMAIN_AUDIT_EVENT_TYPES)[number] = 'REVIEW_REQUESTED';
        const validatorType: AuditEventType = domainType;
        expect(validatorType).toBe(domainType);
      });
    });

    describe('Schema composition', () => {
      it('createReviewInputSchema uses aiOutputTypeSchema', () => {
        // Valid outputType should work
        expect(
          createReviewInputSchema.safeParse({
            tenantId: validUUID,
            outputType: 'LEAD_SCORING',
            outputPayload: {},
            confidence: 0.5,
          }).success
        ).toBe(true);

        // Invalid outputType should fail
        expect(
          createReviewInputSchema.safeParse({
            tenantId: validUUID,
            outputType: 'INVALID',
            outputPayload: {},
            confidence: 0.5,
          }).success
        ).toBe(false);
      });

      it('reviewDecisionInputSchema uses reviewDecisionSchema', () => {
        // Valid decision should work
        expect(
          reviewDecisionInputSchema.safeParse({
            reviewId: validUUID,
            decision: 'APPROVED',
          }).success
        ).toBe(true);

        // Invalid decision should fail
        expect(
          reviewDecisionInputSchema.safeParse({
            reviewId: validUUID,
            decision: 'INVALID',
          }).success
        ).toBe(false);
      });

      it('reviewListFilterSchema uses reviewStatusSchema', () => {
        // Valid status should work
        expect(
          reviewListFilterSchema.safeParse({
            status: ['PENDING', 'APPROVED'],
          }).success
        ).toBe(true);

        // Invalid status should fail
        expect(
          reviewListFilterSchema.safeParse({
            status: ['INVALID'],
          }).success
        ).toBe(false);
      });

      it('reviewListFilterSchema uses aiOutputTypeSchema', () => {
        // Valid outputType should work
        expect(
          reviewListFilterSchema.safeParse({
            outputType: ['LEAD_SCORING'],
          }).success
        ).toBe(true);

        // Invalid outputType should fail
        expect(
          reviewListFilterSchema.safeParse({
            outputType: ['INVALID'],
          }).success
        ).toBe(false);
      });

      it('auditLogEntrySchema uses auditEventTypeSchema', () => {
        // Valid eventType should work
        expect(
          auditLogEntrySchema.safeParse({
            id: validUUID,
            reviewId: validUUID,
            eventType: 'REVIEW_REQUESTED',
            actorType: 'SYSTEM',
            timestamp: new Date().toISOString(),
          }).success
        ).toBe(true);

        // Invalid eventType should fail
        expect(
          auditLogEntrySchema.safeParse({
            id: validUUID,
            reviewId: validUUID,
            eventType: 'INVALID',
            actorType: 'SYSTEM',
            timestamp: new Date().toISOString(),
          }).success
        ).toBe(false);
      });

      it('reviewResponseSchema uses reviewStatusSchema', () => {
        const baseResponse = {
          id: validUUID,
          tenantId: validUUID,
          outputType: 'LEAD_SCORING' as const,
          outputPayload: {},
          confidence: 0.5,
          slaDeadline: new Date().toISOString(),
          escalationDepth: 0,
          lockedBy: null,
          lockedAt: null,
          lockExpiresAt: null,
          reviewerId: null,
          reviewDecision: null,
          reviewNotes: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // Valid status should work
        expect(
          reviewResponseSchema.safeParse({
            ...baseResponse,
            status: 'PENDING',
          }).success
        ).toBe(true);

        // Invalid status should fail
        expect(
          reviewResponseSchema.safeParse({
            ...baseResponse,
            status: 'INVALID',
          }).success
        ).toBe(false);
      });
    });

    describe('SLA config consistency', () => {
      it('createReviewInputSchema uses REVIEW_SLA_CONFIG.DEFAULT_SLA_HOURS', () => {
        const result = createReviewInputSchema.parse({
          tenantId: validUUID,
          outputType: 'LEAD_SCORING',
          outputPayload: {},
          confidence: 0.5,
        });
        expect(result.slaHours).toBe(DOMAIN_REVIEW_SLA_CONFIG.DEFAULT_SLA_HOURS);
      });

      it('reviewListFilterSchema uses REVIEW_SLA_CONFIG.MAX_ESCALATION_DEPTH', () => {
        // At max should work
        expect(
          reviewListFilterSchema.safeParse({
            escalationDepth: DOMAIN_REVIEW_SLA_CONFIG.MAX_ESCALATION_DEPTH,
          }).success
        ).toBe(true);

        // Above max should fail
        expect(
          reviewListFilterSchema.safeParse({
            escalationDepth: DOMAIN_REVIEW_SLA_CONFIG.MAX_ESCALATION_DEPTH + 1,
          }).success
        ).toBe(false);
      });
    });
  });
});
