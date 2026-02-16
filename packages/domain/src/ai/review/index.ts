// AIOutputReview Aggregate
export { AIOutputReview, AI_OUTPUT_TYPES, REVIEW_SLA_CONFIG } from './AIOutputReview';
export type { CreateReviewProps, AIOutputType } from './AIOutputReview';

// Value Objects
export { ReviewId, InvalidReviewIdError } from './ReviewId';
export { ConfidenceScore, InvalidConfidenceScoreError } from './ConfidenceScore';

// Enums and Status
export {
  ReviewStatus,
  ReviewDecision,
  AuditEventType,
  REVIEW_STATUSES,
  REVIEW_DECISIONS,
  AUDIT_EVENT_TYPES,
  VALID_TRANSITIONS,
  canTransitionTo,
} from './ReviewStatus';
export type { ReviewStatusType, ReviewDecisionType, AuditEventTypeValue } from './ReviewStatus';

// Domain Events
export * from './events';

// Repository Interface (IFC-177)
export type { IAIOutputReviewRepository, AIReviewQueryOptions } from './AIOutputReviewRepository';
