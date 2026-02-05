/**
 * Review status enum values - Single Source of Truth
 */
export const REVIEW_STATUSES = [
  'PENDING',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'ESCALATED',
  'EXPIRED',
] as const;

export type ReviewStatusType = (typeof REVIEW_STATUSES)[number];

/**
 * Review status enum for AIOutputReview aggregate
 */
export enum ReviewStatus {
  PENDING = 'PENDING',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ESCALATED = 'ESCALATED',
  EXPIRED = 'EXPIRED',
}

/**
 * Review decision enum values - Single Source of Truth
 */
export const REVIEW_DECISIONS = [
  'APPROVED',
  'REJECTED_QUALITY',
  'REJECTED_ACCURACY',
  'REJECTED_SAFETY',
  'ESCALATED',
] as const;

export type ReviewDecisionType = (typeof REVIEW_DECISIONS)[number];

/**
 * Review decision types for rejection and escalation
 */
export enum ReviewDecision {
  APPROVED = 'APPROVED',
  REJECTED_QUALITY = 'REJECTED_QUALITY',
  REJECTED_ACCURACY = 'REJECTED_ACCURACY',
  REJECTED_SAFETY = 'REJECTED_SAFETY',
  ESCALATED = 'ESCALATED',
}

/**
 * Audit event type enum values - Single Source of Truth
 */
export const AUDIT_EVENT_TYPES = [
  'REVIEW_REQUESTED',
  'REVIEW_CLAIMED',
  'REVIEW_RELEASED',
  'REVIEW_APPROVED',
  'REVIEW_REJECTED',
  'REVIEW_ESCALATED',
  'REVIEW_EXPIRED',
  'ROLLBACK_INITIATED',
  'ROLLBACK_COMPLETED',
] as const;

export type AuditEventTypeValue = (typeof AUDIT_EVENT_TYPES)[number];

/**
 * Audit event types for the approval audit log
 */
export enum AuditEventType {
  REVIEW_REQUESTED = 'REVIEW_REQUESTED',
  REVIEW_CLAIMED = 'REVIEW_CLAIMED',
  REVIEW_RELEASED = 'REVIEW_RELEASED',
  REVIEW_APPROVED = 'REVIEW_APPROVED',
  REVIEW_REJECTED = 'REVIEW_REJECTED',
  REVIEW_ESCALATED = 'REVIEW_ESCALATED',
  REVIEW_EXPIRED = 'REVIEW_EXPIRED',
  ROLLBACK_INITIATED = 'ROLLBACK_INITIATED',
  ROLLBACK_COMPLETED = 'ROLLBACK_COMPLETED',
}

/**
 * Valid state transitions for the review state machine
 */
export const VALID_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  [ReviewStatus.PENDING]: [
    ReviewStatus.IN_REVIEW,
    ReviewStatus.APPROVED,
    ReviewStatus.REJECTED,
    ReviewStatus.ESCALATED,
    ReviewStatus.EXPIRED,
  ],
  [ReviewStatus.IN_REVIEW]: [
    ReviewStatus.PENDING, // Release lock
    ReviewStatus.APPROVED,
    ReviewStatus.REJECTED,
    ReviewStatus.ESCALATED,
  ],
  [ReviewStatus.ESCALATED]: [
    ReviewStatus.PENDING, // Re-queue after escalation
    ReviewStatus.IN_REVIEW,
    ReviewStatus.APPROVED,
    ReviewStatus.REJECTED,
  ],
  [ReviewStatus.APPROVED]: [], // Terminal state
  [ReviewStatus.REJECTED]: [], // Terminal state
  [ReviewStatus.EXPIRED]: [], // Terminal state
};

/**
 * Check if a state transition is valid
 */
export function canTransitionTo(from: ReviewStatus, to: ReviewStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
