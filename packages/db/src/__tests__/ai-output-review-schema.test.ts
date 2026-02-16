/**
 * AI Output Review Schema Validation Tests
 *
 * These tests verify that the Prisma schema has all required columns,
 * indexes, and relations for the AIOutputReview and AIOutputReviewAudit models.
 * Part of IFC-178 TDD Phase 1 (RED).
 *
 * @see packages/db/prisma/schema.prisma
 * @see .specify/sprints/sprint-4/specifications/IFC-178-spec.md
 */
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';

describe('AI Output Review Schema Validation', () => {
  describe('AIOutputReview model', () => {
    it('should have required columns in Prisma model', () => {
      // Verify the model exists by checking Prisma types
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'AIOutputReview');

      expect(model).toBeDefined();

      const fieldNames = model?.fields.map((f) => f.name) ?? [];

      // Core fields
      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('tenantId');

      // AI output details
      expect(fieldNames).toContain('outputType');
      expect(fieldNames).toContain('outputPayload');
      expect(fieldNames).toContain('confidence');

      // Workflow state
      expect(fieldNames).toContain('status');
      expect(fieldNames).toContain('slaDeadline');
      expect(fieldNames).toContain('escalationDepth');

      // Lock mechanism
      expect(fieldNames).toContain('lockedBy');
      expect(fieldNames).toContain('lockedAt');
      expect(fieldNames).toContain('lockExpiresAt');

      // Review decision
      expect(fieldNames).toContain('reviewerId');
      expect(fieldNames).toContain('reviewDecision');
      expect(fieldNames).toContain('reviewNotes');

      // Optimistic locking
      expect(fieldNames).toContain('version');

      // Timestamps
      expect(fieldNames).toContain('createdAt');
      expect(fieldNames).toContain('updatedAt');
    });

    it('should have tenant relation with cascade delete', () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'AIOutputReview');
      const tenantField = model?.fields.find((f) => f.name === 'tenant');

      expect(tenantField).toBeDefined();
      expect(tenantField?.type).toBe('Tenant');

      // Check that tenantId is a required field
      const tenantIdField = model?.fields.find((f) => f.name === 'tenantId');
      expect(tenantIdField).toBeDefined();
      expect(tenantIdField?.isRequired).toBe(true);
    });

    it('should have auditEntries relation', () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'AIOutputReview');
      const auditEntriesField = model?.fields.find((f) => f.name === 'auditEntries');

      expect(auditEntriesField).toBeDefined();
      expect(auditEntriesField?.type).toBe('AIOutputReviewAudit');
      expect(auditEntriesField?.isList).toBe(true);
    });

    it('should have version field defaulting to 1 for optimistic locking', () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'AIOutputReview');
      const versionField = model?.fields.find((f) => f.name === 'version');

      expect(versionField).toBeDefined();
      expect(versionField?.type).toBe('Int');
      expect(versionField?.hasDefaultValue).toBe(true);
      expect(versionField?.default).toBe(1);
    });

    it('should have status field defaulting to PENDING', () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'AIOutputReview');
      const statusField = model?.fields.find((f) => f.name === 'status');

      expect(statusField).toBeDefined();
      expect(statusField?.type).toBe('ReviewStatus');
      expect(statusField?.hasDefaultValue).toBe(true);
      expect(statusField?.default).toBe('PENDING');
    });

    it('should have nullable lock fields', () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'AIOutputReview');

      const lockedBy = model?.fields.find((f) => f.name === 'lockedBy');
      const lockedAt = model?.fields.find((f) => f.name === 'lockedAt');
      const lockExpiresAt = model?.fields.find((f) => f.name === 'lockExpiresAt');

      expect(lockedBy?.isRequired).toBe(false);
      expect(lockedAt?.isRequired).toBe(false);
      expect(lockExpiresAt?.isRequired).toBe(false);
    });

    it('should use Float type for confidence', () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'AIOutputReview');
      const confidenceField = model?.fields.find((f) => f.name === 'confidence');

      expect(confidenceField?.type).toBe('Float');
    });

    it('should use Json type for outputPayload', () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'AIOutputReview');
      const payloadField = model?.fields.find((f) => f.name === 'outputPayload');

      expect(payloadField?.type).toBe('Json');
    });
  });

  describe('AIOutputReviewAudit model', () => {
    it('should have required columns', () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'AIOutputReviewAudit');

      expect(model).toBeDefined();

      const fieldNames = model?.fields.map((f) => f.name) ?? [];

      // Core fields
      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('reviewId');

      // Event details
      expect(fieldNames).toContain('eventType');
      expect(fieldNames).toContain('actorId');
      expect(fieldNames).toContain('actorType');
      expect(fieldNames).toContain('metadata');

      // Timestamp
      expect(fieldNames).toContain('timestamp');
    });

    it('should have review relation', () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'AIOutputReviewAudit');
      const reviewField = model?.fields.find((f) => f.name === 'review');

      expect(reviewField).toBeDefined();
      expect(reviewField?.type).toBe('AIOutputReview');
    });

    it('should have reviewId as required field', () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'AIOutputReviewAudit');
      const reviewIdField = model?.fields.find((f) => f.name === 'reviewId');

      expect(reviewIdField).toBeDefined();
      expect(reviewIdField?.isRequired).toBe(true);
    });

    it('should have nullable actorId for system events', () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'AIOutputReviewAudit');
      const actorIdField = model?.fields.find((f) => f.name === 'actorId');

      expect(actorIdField?.isRequired).toBe(false);
    });

    it('should have actorType defaulting to USER', () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'AIOutputReviewAudit');
      const actorTypeField = model?.fields.find((f) => f.name === 'actorType');

      expect(actorTypeField?.hasDefaultValue).toBe(true);
      expect(actorTypeField?.default).toBe('USER');
    });

    it('should have timestamp with default now()', () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'AIOutputReviewAudit');
      const timestampField = model?.fields.find((f) => f.name === 'timestamp');

      expect(timestampField?.type).toBe('DateTime');
      expect(timestampField?.hasDefaultValue).toBe(true);
    });

    it('should use Json type for nullable metadata', () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'AIOutputReviewAudit');
      const metadataField = model?.fields.find((f) => f.name === 'metadata');

      expect(metadataField?.type).toBe('Json');
      expect(metadataField?.isRequired).toBe(false);
    });
  });

  describe('Table mapping', () => {
    it('should map AIOutputReview to ai_output_reviews table', () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'AIOutputReview');

      expect(model?.dbName).toBe('ai_output_reviews');
    });

    it('should map AIOutputReviewAudit to ai_output_review_audit table', () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'AIOutputReviewAudit');

      expect(model?.dbName).toBe('ai_output_review_audit');
    });
  });
});
