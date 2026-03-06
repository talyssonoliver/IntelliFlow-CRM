/**
 * AI Output Review Enum Consistency Tests
 *
 * These tests verify that Prisma enums match the domain layer constants exactly.
 * Part of IFC-178 TDD Phase 1 (RED).
 *
 * @see packages/domain/src/ai/review/AIOutputReview.ts
 * @see packages/domain/src/ai/review/ReviewStatus.ts
 */
import { describe, it, expect } from 'vitest';
import { AI_OUTPUT_TYPES, REVIEW_STATUSES, REVIEW_DECISIONS } from '@intelliflow/domain';

// Import Prisma enums - these will fail until schema is updated
import { AIOutputType, ReviewStatus, ReviewDecision } from '../../generated/prisma/client';

describe('AI Output Review Enum Consistency', () => {
  describe('AIOutputType enum', () => {
    it('should have all 6 AI output types from domain', () => {
      const prismaValues = Object.values(AIOutputType);
      const domainValues = [...AI_OUTPUT_TYPES];

      expect(prismaValues).toHaveLength(6);
      expect(prismaValues.sort()).toEqual(domainValues.sort());
    });

    it('should include LEAD_SCORING', () => {
      expect(Object.values(AIOutputType)).toContain('LEAD_SCORING');
    });

    it('should include SENTIMENT_ANALYSIS', () => {
      expect(Object.values(AIOutputType)).toContain('SENTIMENT_ANALYSIS');
    });

    it('should include AUTO_RESPONSE', () => {
      expect(Object.values(AIOutputType)).toContain('AUTO_RESPONSE');
    });

    it('should include CHURN_PREDICTION', () => {
      expect(Object.values(AIOutputType)).toContain('CHURN_PREDICTION');
    });

    it('should include EMAIL_GENERATION', () => {
      expect(Object.values(AIOutputType)).toContain('EMAIL_GENERATION');
    });

    it('should include NEXT_BEST_ACTION', () => {
      expect(Object.values(AIOutputType)).toContain('NEXT_BEST_ACTION');
    });
  });

  describe('ReviewStatus enum', () => {
    it('should have all 6 review statuses from domain', () => {
      const prismaValues = Object.values(ReviewStatus);
      const domainValues = [...REVIEW_STATUSES];

      expect(prismaValues).toHaveLength(6);
      expect(prismaValues.sort()).toEqual(domainValues.sort());
    });

    it('should include PENDING', () => {
      expect(Object.values(ReviewStatus)).toContain('PENDING');
    });

    it('should include IN_REVIEW', () => {
      expect(Object.values(ReviewStatus)).toContain('IN_REVIEW');
    });

    it('should include APPROVED', () => {
      expect(Object.values(ReviewStatus)).toContain('APPROVED');
    });

    it('should include REJECTED', () => {
      expect(Object.values(ReviewStatus)).toContain('REJECTED');
    });

    it('should include ESCALATED', () => {
      expect(Object.values(ReviewStatus)).toContain('ESCALATED');
    });

    it('should include EXPIRED', () => {
      expect(Object.values(ReviewStatus)).toContain('EXPIRED');
    });
  });

  describe('ReviewDecision enum', () => {
    it('should have all 5 review decisions from domain', () => {
      const prismaValues = Object.values(ReviewDecision);
      const domainValues = [...REVIEW_DECISIONS];

      expect(prismaValues).toHaveLength(5);
      expect(prismaValues.sort()).toEqual(domainValues.sort());
    });

    it('should include APPROVED', () => {
      expect(Object.values(ReviewDecision)).toContain('APPROVED');
    });

    it('should include REJECTED_QUALITY', () => {
      expect(Object.values(ReviewDecision)).toContain('REJECTED_QUALITY');
    });

    it('should include REJECTED_ACCURACY', () => {
      expect(Object.values(ReviewDecision)).toContain('REJECTED_ACCURACY');
    });

    it('should include REJECTED_SAFETY', () => {
      expect(Object.values(ReviewDecision)).toContain('REJECTED_SAFETY');
    });

    it('should include ESCALATED', () => {
      expect(Object.values(ReviewDecision)).toContain('ESCALATED');
    });
  });
});
