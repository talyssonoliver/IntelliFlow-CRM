/**
 * AI Output Review Validators (IFC-176)
 *
 * Zod validation schemas for AI Output Review inputs and outputs.
 * Follows Single Source of Truth pattern - all enum schemas derived from domain constants.
 *
 * @module ai-review
 * @implements IFC-176
 */

import { z } from 'zod';
import {
  AI_OUTPUT_TYPES,
  REVIEW_STATUSES,
  REVIEW_DECISIONS,
  AUDIT_EVENT_TYPES,
  REVIEW_SLA_CONFIG,
} from '@intelliflow/domain';
import { idSchema } from './common';

// ===========================================
// Enum Schemas (Single Source of Truth)
// ===========================================

/**
 * Schema for AI output types.
 * Derived from domain constant AI_OUTPUT_TYPES.
 */
export const aiOutputTypeSchema = z.enum(AI_OUTPUT_TYPES);

/**
 * Schema for review statuses.
 * Derived from domain constant REVIEW_STATUSES.
 */
export const reviewStatusSchema = z.enum(REVIEW_STATUSES);

/**
 * Schema for review decisions.
 * Derived from domain constant REVIEW_DECISIONS.
 */
export const reviewDecisionSchema = z.enum(REVIEW_DECISIONS);

/**
 * Schema for audit event types.
 * Derived from domain constant AUDIT_EVENT_TYPES.
 */
export const auditEventTypeSchema = z.enum(AUDIT_EVENT_TYPES);

// Type exports (inferred from schemas)
export type AIOutputType = z.infer<typeof aiOutputTypeSchema>;
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;
export type AuditEventType = z.infer<typeof auditEventTypeSchema>;

// ===========================================
// Confidence Schema
// ===========================================

/**
 * Schema for confidence scores with edge case protection.
 * Validates: 0 <= confidence <= 1, finite number, not NaN.
 */
export const reviewConfidenceSchema = z
  .number()
  .min(0, 'Confidence must be >= 0')
  .max(1, 'Confidence must be <= 1')
  .refine((v) => !isNaN(v) && isFinite(v), {
    message: 'Confidence must be a finite number',
  });

/**
 * Type guard for validating confidence scores at runtime.
 * Useful for validating ML pipeline outputs before schema parsing.
 *
 * @param v - Value to check
 * @returns True if v is a valid confidence score (number, 0-1, finite)
 */
export const isValidConfidence = (v: unknown): v is number =>
  typeof v === 'number' && !isNaN(v) && isFinite(v) && v >= 0 && v <= 1;

// ===========================================
// Input Schemas
// ===========================================

/**
 * Schema for creating a new AI output review.
 * Used when submitting AI-generated output for human review.
 */
export const createReviewInputSchema = z.object({
  /** Tenant ID for multi-tenancy isolation */
  tenantId: idSchema,
  /** Type of AI output being reviewed */
  outputType: aiOutputTypeSchema,
  /** The AI-generated output payload (structure varies by output type) */
  outputPayload: z.unknown(),
  /** Confidence score from the AI model (0-1) */
  confidence: reviewConfidenceSchema,
  /** SLA deadline in hours (default: 24, max: 168 = 1 week) */
  slaHours: z
    .number()
    .int()
    .min(1)
    .max(168)
    .optional()
    .default(REVIEW_SLA_CONFIG.DEFAULT_SLA_HOURS),
});

export type CreateReviewInput = z.infer<typeof createReviewInputSchema>;

/**
 * Schema for submitting a review decision.
 * Notes are required for rejection decisions (REJECTED_*).
 */
export const reviewDecisionInputSchema = z
  .object({
    /** ID of the review to decide on */
    reviewId: idSchema,
    /** The decision being made */
    decision: reviewDecisionSchema,
    /** Optional notes (required for rejections) */
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (data) => {
      // Notes required for rejections (format validation only)
      if (data.decision.startsWith('REJECTED') && !data.notes?.trim()) {
        return false;
      }
      return true;
    },
    {
      message: 'Notes are required for rejection decisions',
      path: ['notes'],
    }
  );

export type ReviewDecisionInput = z.infer<typeof reviewDecisionInputSchema>;

// ===========================================
// Filter Schema
// ===========================================

/**
 * Schema for filtering and paginating review lists.
 * Supports filtering by status, output type, confidence, SLA breach, etc.
 */
export const reviewListFilterSchema = z.object({
  /** Filter by status(es) */
  status: z.array(reviewStatusSchema).optional(),
  /** Filter by output type(s) */
  outputType: z.array(aiOutputTypeSchema).optional(),
  /** Minimum confidence score */
  minConfidence: reviewConfidenceSchema.optional(),
  /** Maximum confidence score */
  maxConfidence: reviewConfidenceSchema.optional(),
  /** Filter by minimum confidence threshold */
  confidenceThreshold: reviewConfidenceSchema.optional(),
  /** Filter by SLA breach status */
  slaBreached: z.boolean().optional(),
  /** Filter by escalation depth */
  escalationDepth: z.number().int().min(0).max(REVIEW_SLA_CONFIG.MAX_ESCALATION_DEPTH).optional(),
  /** Filter by tenant */
  tenantId: idSchema.optional(),
  /** Filter by reviewer */
  reviewerId: idSchema.optional(),
  /** Page number (1-indexed) */
  page: z.number().int().min(1).default(1),
  /** Items per page (max 100) */
  limit: z.number().int().min(1).max(100).default(20),
  /** Sort field */
  sortBy: z
    .enum(['createdAt', 'slaDeadline', 'confidence', 'escalationDepth'])
    .default('createdAt'),
  /** Sort order */
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ReviewListFilter = z.infer<typeof reviewListFilterSchema>;

// ===========================================
// Audit Log Schema
// ===========================================

/**
 * Schema for audit log entries.
 * Records all events in the review lifecycle.
 */
export const auditLogEntrySchema = z.object({
  /** Unique audit entry ID */
  id: idSchema,
  /** Review this entry belongs to */
  reviewId: idSchema,
  /** Type of event */
  eventType: auditEventTypeSchema,
  /** Actor who triggered the event (optional for system events) */
  actorId: idSchema.optional(),
  /** Type of actor */
  actorType: z.enum(['USER', 'SYSTEM']),
  /** Additional event metadata */
  metadata: z.record(z.unknown()).optional(),
  /** When the event occurred */
  timestamp: z.coerce.date(),
});

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

// ===========================================
// Batch Schema
// ===========================================

/**
 * Schema for batch review creation.
 * Maximum 100 items per batch for performance.
 */
export const reviewBatchSchema = z.array(createReviewInputSchema).max(100);

export type ReviewBatch = z.infer<typeof reviewBatchSchema>;

// ===========================================
// Response Schemas
// ===========================================

/**
 * Schema for a single review response.
 * Full review object returned from API.
 */
export const reviewResponseSchema = z.object({
  /** Review ID */
  id: idSchema,
  /** Tenant ID */
  tenantId: idSchema,
  /** AI output type */
  outputType: aiOutputTypeSchema,
  /** The AI-generated output payload */
  outputPayload: z.unknown(),
  /** Confidence score */
  confidence: reviewConfidenceSchema,
  /** Current status */
  status: reviewStatusSchema,
  /** SLA deadline */
  slaDeadline: z.coerce.date(),
  /** Current escalation depth */
  escalationDepth: z.number().int().min(0),
  /** ID of user who locked the review (null if not locked) */
  lockedBy: idSchema.nullable(),
  /** When the lock was acquired */
  lockedAt: z.coerce.date().nullable(),
  /** When the lock expires */
  lockExpiresAt: z.coerce.date().nullable(),
  /** ID of reviewer who made the decision */
  reviewerId: idSchema.nullable(),
  /** The review decision made */
  reviewDecision: reviewDecisionSchema.nullable(),
  /** Notes from the reviewer */
  reviewNotes: z.string().nullable(),
  /** Creation timestamp */
  createdAt: z.coerce.date(),
  /** Last update timestamp */
  updatedAt: z.coerce.date(),
});

export type ReviewResponse = z.infer<typeof reviewResponseSchema>;

/**
 * Schema for paginated review list response.
 */
export const reviewListResponseSchema = z.object({
  /** Array of reviews */
  data: z.array(reviewResponseSchema),
  /** Total count of matching reviews */
  total: z.number().int().nonnegative(),
  /** Current page number */
  page: z.number().int().positive(),
  /** Items per page */
  limit: z.number().int().positive().max(100),
  /** Whether more pages exist */
  hasMore: z.boolean(),
});

export type ReviewListResponse = z.infer<typeof reviewListResponseSchema>;

// ===========================================
// Re-exports (Convenience Pattern)
// ===========================================

/**
 * Re-export domain constants for convenience.
 * Prevents the need for dual imports from domain and validators.
 */
export {
  AI_OUTPUT_TYPES,
  REVIEW_STATUSES,
  REVIEW_DECISIONS,
  AUDIT_EVENT_TYPES,
  REVIEW_SLA_CONFIG,
} from '@intelliflow/domain';
