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
  // Errors
  InvalidLeadStatusError,
  TenantMismatchError,
  InvalidStatusTransitionError,
  DraftExpiredError,
  ApprovalRequiredError,
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
} from './AutoResponseEvents';

// Repository
export {
  type AutoResponseDraftRepository,
  type AutoResponseDraftQuery,
} from './AutoResponseDraftRepository';
