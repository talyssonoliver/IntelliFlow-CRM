// Auto-Response Domain Module
// Part of IFC-029: Auto-Response with Approval Gate

// Aggregate
export {
  AutoResponseDraft,
  AUTO_RESPONSE_STATUSES,
  TRIGGER_TYPES,
  ALLOWED_LEAD_STATUSES,
  type AutoResponseStatus,
  type TriggerType,
  type CreateAutoResponseDraftProps,
  type RehydrateAutoResponseDraftProps,
  type ApprovalDecision,
  type Escalation,
  // Errors
  InvalidLeadStatusError,
  TenantMismatchError,
  InvalidStatusTransitionError,
  DraftExpiredError,
  ApprovalRequiredError,
  MaxEscalationsReachedError,
} from './AutoResponseDraft';

// ID
export { AutoResponseDraftId } from './AutoResponseDraftId';

// Value Objects
export {
  ResponseContent,
  ResponseContentValidationError,
} from './ResponseContent';

// Events
export {
  AutoResponseGeneratedEvent,
  AutoResponseSubmittedForApprovalEvent,
  AutoResponseApprovedEvent,
  AutoResponseRejectedEvent,
  AutoResponseSentEvent,
  AutoResponseExpiredEvent,
  AutoResponseEscalatedEvent,
  AutoResponseInvalidatedEvent,
  AutoResponseSendFailedEvent,
  AutoResponseEscalationResolvedEvent,
} from './AutoResponseEvents';

// Repository
export {
  type AutoResponseDraftRepository,
  type AutoResponseDraftQuery,
} from './AutoResponseDraftRepository';
