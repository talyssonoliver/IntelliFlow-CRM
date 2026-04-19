/**
 * ActivityTypeRegistry Tests
 * IFC-193: Activity Feed Type Registry
 *
 * Tests: completeness, type safety, lookup, default fallback, key uniqueness
 */

import { describe, it, expect } from 'vitest';
import {
  ACTIVITY_TYPE_REGISTRY,
  resolveActivityType,
  KNOWN_EVENT_TYPES,
  DEFAULT_METADATA,
  type ActivityTypeMetadata,
} from '../ActivityTypeRegistry';
import { ACTIVITY_FEED_TYPES } from '../../../activity-feed/ActivityFeedConstants';

// Import all domain event classes to verify completeness
import {
  LeadCreatedEvent,
  LeadScoredEvent,
  LeadStatusChangedEvent,
  LeadQualifiedEvent,
  LeadConvertedEvent,
  LeadRoutedEvent,
} from '../../lead/LeadEvents';
import {
  ContactCreatedEvent,
  ContactUpdatedEvent,
  ContactAccountAssociatedEvent,
  ContactAccountDisassociatedEvent,
  ContactConvertedFromLeadEvent,
  ContactLinkedToLeadEvent,
  ContactUnlinkedFromLeadEvent,
  ContactInteractedEvent,
} from '../../contact/ContactEvents';
import {
  AccountCreatedEvent,
  AccountUpdatedEvent,
  AccountRevenueUpdatedEvent,
  AccountHierarchyUpdatedEvent,
  AccountIndustryCategorizedEvent,
} from '../../account/AccountEvents';
import {
  OpportunityCreatedEvent,
  OpportunityStageChangedEvent,
  OpportunityValueUpdatedEvent,
  OpportunityWonEvent,
  OpportunityLostEvent,
  OpportunityProbabilityUpdatedEvent,
  OpportunityCloseDateChangedEvent,
  OpportunityReopenedEvent,
  DealWonEnrichedEvent,
  DealLostEnrichedEvent,
} from '../../opportunity/OpportunityEvents';
import {
  TaskCreatedEvent,
  TaskStatusChangedEvent,
  TaskCompletedEvent,
  TaskCancelledEvent,
  TaskPriorityChangedEvent,
  TaskDueDateChangedEvent,
  TaskUpdatedEvent,
  TaskDeletedEvent,
  TaskAssignedEvent,
  TaskLinkedToEntityEvent,
} from '../../task/TaskEvents';
import {
  TicketCreatedEvent,
  TicketStatusChangedEvent,
  TicketPriorityChangedEvent,
  TicketAssignedEvent,
  TicketUnassignedEvent,
  TicketResolvedEvent,
  TicketClosedEvent,
  TicketReopenedEvent,
  TicketResponseSlaBreachedEvent,
  TicketResolutionSlaBreachedEvent,
  TicketSlaPausedEvent,
  TicketSlaResumedEvent,
  TicketRoutedEvent,
  TicketRoutingFailedEvent,
} from '../../ticket/TicketEvents';
import {
  CaseCreatedEvent,
  CaseStatusChangedEvent,
  CaseDeadlineUpdatedEvent,
  CaseTaskAddedEvent,
  CaseTaskRemovedEvent,
  CaseTaskCompletedEvent,
  CasePriorityChangedEvent,
  CaseClosedEvent,
} from '../../../legal/cases/CaseEvents';
import {
  CaseWorkflowStartedEvent,
  CaseWorkflowCompletedEvent,
  CaseWorkflowFailedEvent,
  CaseApprovalRequiredEvent,
  CaseApprovalReceivedEvent,
  CaseEscalatedEvent,
  CaseSLABreachedEvent,
  CaseAssignedEvent,
  CaseNoteAddedEvent,
  CaseDocumentAttachedEvent,
  CaseReopenedEvent,
  CaseTimerStartedEvent,
  CaseTimerPausedEvent,
} from '../../../events/case-events';
import {
  AppointmentCreatedEvent,
  AppointmentRescheduledEvent,
  AppointmentConfirmedEvent,
  AppointmentCancelledEvent,
  AppointmentCompletedEvent,
  AppointmentNoShowEvent,
  AppointmentLinkedToCaseEvent,
  AppointmentUnlinkedFromCaseEvent,
  AppointmentAttendeeAddedEvent,
  AppointmentAttendeeRemovedEvent,
  AppointmentConflictDetectedEvent,
} from '../../../legal/appointments/AppointmentEvents';
import {
  DeadlineCreatedEvent,
  DeadlineStatusChangedEvent,
  DeadlineApproachingEvent,
  DeadlineDueTodayEvent,
  DeadlineOverdueEvent,
  DeadlineCompletedEvent,
  DeadlineWaivedEvent,
  DeadlineExtendedEvent,
  DeadlineReminderSentEvent,
} from '../../../legal/deadlines/DeadlineEvents';
import {
  InvoiceCreatedEvent,
  InvoiceIssuedEvent,
  InvoicePaymentRecordedEvent,
  InvoicePaidEvent,
  InvoiceVoidedEvent,
  InvoiceRefundedEvent,
  InvoiceUncollectibleEvent,
  ReceiptIssuedEvent,
} from '../../billing/billing-events';
import {
  DocumentIngestionCreatedEvent,
  DocumentIngestionFailedEvent,
} from '../../../legal/cases/DocumentIngestionEvents';
import {
  ScoreFeedbackSubmittedEvent,
  RetrainingRecommendedEvent,
  TrainingDataExportedEvent,
  FeedbackAnalyticsGeneratedEvent,
} from '../../../ai/FeedbackEvents';
import {
  ChainVersionCreatedEvent,
  ChainVersionActivatedEvent,
  ChainVersionDeprecatedEvent,
  ChainVersionRolledBackEvent,
} from '../../../ai/ChainVersionEvents';
import { ReviewRequestedEvent } from '../../../ai/review/events/ReviewRequestedEvent';
import { ReviewApprovedEvent } from '../../../ai/review/events/ReviewApprovedEvent';
import { ReviewRejectedEvent } from '../../../ai/review/events/ReviewRejectedEvent';
import { ReviewEscalatedEvent } from '../../../ai/review/events/ReviewEscalatedEvent';
import {
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
} from '../../../autoresponse/AutoResponseEvents';
import {
  NotificationCreatedEvent,
  NotificationSentEvent,
  NotificationDeliveredEvent,
  NotificationFailedEvent,
  NotificationReadEvent,
  NotificationPreferenceUpdatedEvent,
  NotificationScheduledEvent,
  NotificationMovedToDLQEvent,
} from '../../../notifications/NotificationEvents';
import { ChurnRiskAssessedEvent } from '../../../intelligence/events/ChurnRiskAssessedEvent';
import {
  SurveySentEvent,
  SurveyRespondedEvent,
  SurveyFollowedUpEvent,
  SurveyClosedEvent,
} from '../../feedback/SurveyEvents';

// Collect all domain event instances to extract their eventType values
function getAllDomainEventTypes(): string[] {
  const events = [
    // Lead (6)
    new LeadCreatedEvent({} as any),
    new LeadScoredEvent({} as any),
    new LeadStatusChangedEvent({} as any),
    new LeadQualifiedEvent({} as any),
    new LeadConvertedEvent({} as any),
    new LeadRoutedEvent({} as any),
    // Contact (8)
    new ContactCreatedEvent({} as any),
    new ContactUpdatedEvent({} as any),
    new ContactAccountAssociatedEvent({} as any),
    new ContactAccountDisassociatedEvent({} as any),
    new ContactConvertedFromLeadEvent({} as any),
    new ContactLinkedToLeadEvent({} as any),
    new ContactUnlinkedFromLeadEvent({} as any),
    new ContactInteractedEvent({} as any),
    // Account (5)
    new AccountCreatedEvent({} as any),
    new AccountUpdatedEvent({} as any),
    new AccountRevenueUpdatedEvent({} as any),
    new AccountHierarchyUpdatedEvent({} as any),
    new AccountIndustryCategorizedEvent({} as any),
    // Opportunity (10)
    new OpportunityCreatedEvent({} as any),
    new OpportunityStageChangedEvent({} as any),
    new OpportunityValueUpdatedEvent({} as any),
    new OpportunityWonEvent({} as any),
    new OpportunityLostEvent({} as any),
    new OpportunityProbabilityUpdatedEvent({} as any),
    new OpportunityCloseDateChangedEvent({} as any),
    new OpportunityReopenedEvent({} as any),
    new DealWonEnrichedEvent({} as any),
    new DealLostEnrichedEvent({} as any),
    // Task (10)
    new TaskCreatedEvent({} as any),
    new TaskStatusChangedEvent({} as any),
    new TaskCompletedEvent({} as any),
    new TaskCancelledEvent({} as any),
    new TaskPriorityChangedEvent({} as any),
    new TaskDueDateChangedEvent({} as any),
    new TaskUpdatedEvent({} as any),
    new TaskDeletedEvent({} as any),
    new TaskAssignedEvent({} as any, null, null, 'system', '', null),
    new TaskLinkedToEntityEvent({} as any, 'lead', '', 'system'),
    // Ticket (14)
    new TicketCreatedEvent({} as any),
    new TicketStatusChangedEvent({} as any),
    new TicketPriorityChangedEvent({} as any),
    new TicketAssignedEvent({} as any),
    new TicketUnassignedEvent({} as any),
    new TicketResolvedEvent({} as any),
    new TicketClosedEvent({} as any),
    new TicketReopenedEvent({} as any),
    new TicketResponseSlaBreachedEvent({} as any),
    new TicketResolutionSlaBreachedEvent({} as any),
    new TicketSlaPausedEvent({} as any),
    new TicketSlaResumedEvent({} as any),
    new TicketRoutedEvent({} as any),
    new TicketRoutingFailedEvent({} as any),
    // Case from CaseEvents (8)
    new CaseCreatedEvent({} as any),
    new CaseStatusChangedEvent({} as any),
    new CaseDeadlineUpdatedEvent({} as any),
    new CaseTaskAddedEvent({} as any),
    new CaseTaskRemovedEvent({} as any),
    new CaseTaskCompletedEvent({} as any),
    new CasePriorityChangedEvent({} as any),
    new CaseClosedEvent({} as any),
    // Case from case-events (13)
    new CaseWorkflowStartedEvent({} as any),
    new CaseWorkflowCompletedEvent({} as any),
    new CaseWorkflowFailedEvent({} as any),
    new CaseApprovalRequiredEvent({} as any),
    new CaseApprovalReceivedEvent({} as any),
    new CaseEscalatedEvent({} as any),
    new CaseSLABreachedEvent({} as any),
    new CaseAssignedEvent({} as any),
    new CaseNoteAddedEvent({} as any),
    new CaseDocumentAttachedEvent({} as any),
    new CaseReopenedEvent({} as any),
    new CaseTimerStartedEvent({} as any),
    new CaseTimerPausedEvent({} as any),
    // Appointment (11)
    new AppointmentCreatedEvent({} as any),
    new AppointmentRescheduledEvent({} as any),
    new AppointmentConfirmedEvent({} as any),
    new AppointmentCancelledEvent({} as any),
    new AppointmentCompletedEvent({} as any),
    new AppointmentNoShowEvent({} as any),
    new AppointmentLinkedToCaseEvent({} as any),
    new AppointmentUnlinkedFromCaseEvent({} as any),
    new AppointmentAttendeeAddedEvent({} as any),
    new AppointmentAttendeeRemovedEvent({} as any),
    new AppointmentConflictDetectedEvent({} as any),
    // Deadline (9)
    new DeadlineCreatedEvent({} as any),
    new DeadlineStatusChangedEvent({} as any),
    new DeadlineApproachingEvent({} as any),
    new DeadlineDueTodayEvent({} as any),
    new DeadlineOverdueEvent({} as any),
    new DeadlineCompletedEvent({} as any),
    new DeadlineWaivedEvent({} as any),
    new DeadlineExtendedEvent({} as any),
    new DeadlineReminderSentEvent({} as any),
    // Billing (8)
    new InvoiceCreatedEvent({} as any),
    new InvoiceIssuedEvent({} as any),
    new InvoicePaymentRecordedEvent({} as any),
    new InvoicePaidEvent({} as any),
    new InvoiceVoidedEvent({} as any),
    new InvoiceRefundedEvent({} as any),
    new InvoiceUncollectibleEvent({} as any),
    new ReceiptIssuedEvent({} as any),
    // Document (2)
    new DocumentIngestionCreatedEvent({} as any),
    new DocumentIngestionFailedEvent({} as any),
    // AI Feedback (4)
    new ScoreFeedbackSubmittedEvent({} as any),
    new RetrainingRecommendedEvent({} as any),
    new TrainingDataExportedEvent({} as any),
    new FeedbackAnalyticsGeneratedEvent({} as any),
    // Chain Version (4)
    new ChainVersionCreatedEvent({} as any),
    new ChainVersionActivatedEvent({} as any),
    new ChainVersionDeprecatedEvent({} as any),
    new ChainVersionRolledBackEvent({} as any),
    // AI Review (4)
    new ReviewRequestedEvent({} as any),
    new ReviewApprovedEvent({} as any),
    new ReviewRejectedEvent({} as any),
    new ReviewEscalatedEvent({} as any),
    // Auto-response (10)
    new AutoResponseGeneratedEvent({} as any),
    new AutoResponseSubmittedForApprovalEvent({} as any),
    new AutoResponseApprovedEvent({} as any),
    new AutoResponseRejectedEvent({} as any),
    new AutoResponseSentEvent({} as any),
    new AutoResponseExpiredEvent({} as any),
    new AutoResponseEscalatedEvent({} as any),
    new AutoResponseInvalidatedEvent({} as any),
    new AutoResponseSendFailedEvent({} as any),
    new AutoResponseEscalationResolvedEvent({} as any),
    // Notification (8)
    new NotificationCreatedEvent({} as any),
    new NotificationSentEvent({} as any),
    new NotificationDeliveredEvent({} as any),
    new NotificationFailedEvent({} as any),
    new NotificationReadEvent({} as any),
    new NotificationPreferenceUpdatedEvent({} as any),
    new NotificationScheduledEvent({} as any),
    new NotificationMovedToDLQEvent({} as any),
    // Intelligence (1)
    new ChurnRiskAssessedEvent({} as any),
    // Survey (4)
    new SurveySentEvent({} as any),
    new SurveyRespondedEvent({} as any),
    new SurveyFollowedUpEvent({} as any),
    new SurveyClosedEvent({} as any),
  ];
  return events.map((e) => e.eventType);
}

describe('ActivityTypeRegistry', () => {
  // 1a: Imports are defined
  it('should export ACTIVITY_TYPE_REGISTRY, resolveActivityType, KNOWN_EVENT_TYPES, DEFAULT_METADATA', () => {
    expect(ACTIVITY_TYPE_REGISTRY).toBeDefined();
    expect(typeof resolveActivityType).toBe('function');
    expect(KNOWN_EVENT_TYPES).toBeDefined();
    expect(DEFAULT_METADATA).toBeDefined();
  });

  // 1b: Completeness — every domain event eventType is in the registry
  it('should map every domain event eventType to a registry entry', () => {
    const domainEventTypes = getAllDomainEventTypes();
    const missingTypes: string[] = [];
    for (const eventType of domainEventTypes) {
      if (!(eventType in ACTIVITY_TYPE_REGISTRY)) {
        missingTypes.push(eventType);
      }
    }
    expect(missingTypes).toEqual([]);
  });

  // 1c: Type safety — every feedType is a valid ActivityFeedType
  it('should have valid ActivityFeedType for every entry', () => {
    const validTypes = new Set(ACTIVITY_FEED_TYPES);
    const invalidEntries: string[] = [];
    for (const [key, meta] of Object.entries(ACTIVITY_TYPE_REGISTRY)) {
      if (!validTypes.has(meta.feedType as any)) {
        invalidEntries.push(`${key}: feedType '${meta.feedType}' is not in ACTIVITY_FEED_TYPES`);
      }
    }
    expect(invalidEntries).toEqual([]);
  });

  // 1d: Metadata shape — every entry has non-empty icon, label, color with correct format
  it('should have valid metadata shape for every entry', () => {
    const colorPattern = /^[a-z]+-[0-9]+$/;
    const invalid: string[] = [];
    for (const [key, meta] of Object.entries(ACTIVITY_TYPE_REGISTRY)) {
      if (!meta.icon || typeof meta.icon !== 'string') invalid.push(`${key}: invalid icon`);
      if (!meta.label || typeof meta.label !== 'string') invalid.push(`${key}: invalid label`);
      if (!meta.color || typeof meta.color !== 'string') invalid.push(`${key}: invalid color`);
      if (meta.color && !colorPattern.test(meta.color))
        invalid.push(`${key}: color '${meta.color}' doesn't match pattern`);
    }
    expect(invalid).toEqual([]);
  });

  // 1e: Lookup known type
  it('should resolve known event type correctly', () => {
    const result = resolveActivityType('lead.created');
    expect(result.feedType).toBe('STATUS_CHANGE');
    expect(result.icon).toBeTruthy();
    expect(result.label).toBeTruthy();
    expect(result.color).toBeTruthy();
  });

  // 1f: Lookup unknown type — returns default
  it('should return DEFAULT_METADATA for unknown event types', () => {
    const result = resolveActivityType('nonexistent.event.type');
    expect(result).toEqual(DEFAULT_METADATA);
    expect(result.feedType).toBe('SYSTEM');
  });

  // 1g: KNOWN_EVENT_TYPES length matches registry
  it('should have KNOWN_EVENT_TYPES length equal to registry key count', () => {
    expect(KNOWN_EVENT_TYPES.length).toBe(Object.keys(ACTIVITY_TYPE_REGISTRY).length);
  });

  // 1h: No duplicate keys (JS object dedup detection)
  it('should have no duplicate registry keys', () => {
    const keys = Object.keys(ACTIVITY_TYPE_REGISTRY);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  // 1i: Icon non-empty for every entry
  it('should have non-empty icon for every entry', () => {
    for (const [key, meta] of Object.entries(ACTIVITY_TYPE_REGISTRY)) {
      expect(meta.icon.length, `${key} has empty icon`).toBeGreaterThan(0);
    }
  });
});
