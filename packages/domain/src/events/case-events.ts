/**
 * Case Domain Events for Workflow Integration
 *
 * Extended case events specifically designed for workflow engine integration.
 * These events complement the core CaseEvents in legal/cases/CaseEvents.ts
 * with additional workflow-focused events.
 *
 * @module @intelliflow/domain/events/case-events
 */

import { DomainEvent } from '../shared/DomainEvent';
import { CaseId } from '../legal/cases/CaseId';
import { CaseTaskId } from '../legal/cases/CaseTaskId';

// Re-export core case types for convenience
export type {
  CaseStatus,
  CasePriority,
  CaseTaskStatus,
} from '../legal/cases/CaseEvents';

// Re-export core case events
export {
  CaseCreatedEvent,
  CaseStatusChangedEvent,
  CaseDeadlineUpdatedEvent,
  CaseTaskAddedEvent,
  CaseTaskRemovedEvent,
  CaseTaskCompletedEvent,
  CasePriorityChangedEvent,
  CaseClosedEvent,
} from '../legal/cases/CaseEvents';

// ============================================================================
// Workflow-Specific Case Events
// ============================================================================

/**
 * Event: Case workflow was started
 * Emitted when a workflow engine begins processing a case
 */
export class CaseWorkflowStartedEvent extends DomainEvent {
  readonly eventType = 'case.workflow_started';

  constructor(
    public readonly caseId: CaseId,
    public readonly workflowId: string,
    public readonly workflowName: string,
    public readonly workflowEngine: 'temporal' | 'langgraph' | 'bullmq',
    public readonly initiatedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      workflowId: this.workflowId,
      workflowName: this.workflowName,
      workflowEngine: this.workflowEngine,
      initiatedBy: this.initiatedBy,
    };
  }
}

/**
 * Event: Case workflow completed successfully
 */
export class CaseWorkflowCompletedEvent extends DomainEvent {
  readonly eventType = 'case.workflow_completed';

  constructor(
    public readonly caseId: CaseId,
    public readonly workflowId: string,
    public readonly workflowName: string,
    public readonly result: Record<string, unknown>,
    public readonly durationMs: number
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      workflowId: this.workflowId,
      workflowName: this.workflowName,
      result: this.result,
      durationMs: this.durationMs,
    };
  }
}

/**
 * Event: Case workflow failed
 */
export class CaseWorkflowFailedEvent extends DomainEvent {
  readonly eventType = 'case.workflow_failed';

  constructor(
    public readonly caseId: CaseId,
    public readonly workflowId: string,
    public readonly workflowName: string,
    public readonly error: string,
    public readonly retryable: boolean,
    public readonly attemptNumber: number
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      workflowId: this.workflowId,
      workflowName: this.workflowName,
      error: this.error,
      retryable: this.retryable,
      attemptNumber: this.attemptNumber,
    };
  }
}

/**
 * Event: Case requires human approval
 * Emitted when a workflow reaches a human-in-the-loop checkpoint
 */
export class CaseApprovalRequiredEvent extends DomainEvent {
  readonly eventType = 'case.approval_required';

  constructor(
    public readonly caseId: CaseId,
    public readonly workflowId: string,
    public readonly approvalType: 'proceed' | 'review' | 'escalate' | 'close',
    public readonly requiredApprovers: string[],
    public readonly reason: string,
    public readonly deadline: Date | null
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      workflowId: this.workflowId,
      approvalType: this.approvalType,
      requiredApprovers: this.requiredApprovers,
      reason: this.reason,
      deadline: this.deadline?.toISOString() ?? null,
    };
  }
}

/**
 * Event: Case approval was received
 */
export class CaseApprovalReceivedEvent extends DomainEvent {
  readonly eventType = 'case.approval_received';

  constructor(
    public readonly caseId: CaseId,
    public readonly workflowId: string,
    public readonly approvalType: 'proceed' | 'review' | 'escalate' | 'close',
    public readonly approvedBy: string,
    public readonly approved: boolean,
    public readonly comments: string | null
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      workflowId: this.workflowId,
      approvalType: this.approvalType,
      approvedBy: this.approvedBy,
      approved: this.approved,
      comments: this.comments,
    };
  }
}

/**
 * Event: Case was escalated
 */
export class CaseEscalatedEvent extends DomainEvent {
  readonly eventType = 'case.escalated';

  constructor(
    public readonly caseId: CaseId,
    public readonly escalationLevel: number,
    public readonly previousAssignee: string,
    public readonly newAssignee: string,
    public readonly reason: string,
    public readonly escalatedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      escalationLevel: this.escalationLevel,
      previousAssignee: this.previousAssignee,
      newAssignee: this.newAssignee,
      reason: this.reason,
      escalatedBy: this.escalatedBy,
    };
  }
}

/**
 * Event: Case SLA was breached
 */
export class CaseSLABreachedEvent extends DomainEvent {
  readonly eventType = 'case.sla_breached';

  constructor(
    public readonly caseId: CaseId,
    public readonly slaType: 'response' | 'resolution' | 'update',
    public readonly targetTime: Date,
    public readonly breachedAt: Date,
    public readonly overageMinutes: number
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      slaType: this.slaType,
      targetTime: this.targetTime.toISOString(),
      breachedAt: this.breachedAt.toISOString(),
      overageMinutes: this.overageMinutes,
    };
  }
}

/**
 * Event: Case was assigned to a user
 */
export class CaseAssignedEvent extends DomainEvent {
  readonly eventType = 'case.assigned';

  constructor(
    public readonly caseId: CaseId,
    public readonly previousAssignee: string | null,
    public readonly newAssignee: string,
    public readonly assignedBy: string,
    public readonly reason: string | null
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      previousAssignee: this.previousAssignee,
      newAssignee: this.newAssignee,
      assignedBy: this.assignedBy,
      reason: this.reason,
    };
  }
}

/**
 * Event: Case note was added
 */
export class CaseNoteAddedEvent extends DomainEvent {
  readonly eventType = 'case.note_added';

  constructor(
    public readonly caseId: CaseId,
    public readonly noteId: string,
    public readonly content: string,
    public readonly isInternal: boolean,
    public readonly addedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      noteId: this.noteId,
      content: this.content,
      isInternal: this.isInternal,
      addedBy: this.addedBy,
    };
  }
}

/**
 * Event: Case document was attached
 */
export class CaseDocumentAttachedEvent extends DomainEvent {
  readonly eventType = 'case.document_attached';

  constructor(
    public readonly caseId: CaseId,
    public readonly documentId: string,
    public readonly documentName: string,
    public readonly documentType: string,
    public readonly sizeBytes: number,
    public readonly attachedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      documentId: this.documentId,
      documentName: this.documentName,
      documentType: this.documentType,
      sizeBytes: this.sizeBytes,
      attachedBy: this.attachedBy,
    };
  }
}

/**
 * Event: Case was reopened
 */
export class CaseReopenedEvent extends DomainEvent {
  readonly eventType = 'case.reopened';

  constructor(
    public readonly caseId: CaseId,
    public readonly originalCloseDate: Date,
    public readonly reason: string,
    public readonly reopenedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      originalCloseDate: this.originalCloseDate.toISOString(),
      reason: this.reason,
      reopenedBy: this.reopenedBy,
    };
  }
}

/**
 * Event: Case timer was started (for SLA tracking)
 */
export class CaseTimerStartedEvent extends DomainEvent {
  readonly eventType = 'case.timer_started';

  constructor(
    public readonly caseId: CaseId,
    public readonly timerType: 'response' | 'resolution' | 'update',
    public readonly targetDuration: number, // in minutes
    public readonly startedAt: Date
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      timerType: this.timerType,
      targetDuration: this.targetDuration,
      startedAt: this.startedAt.toISOString(),
    };
  }
}

/**
 * Event: Case timer was paused
 */
export class CaseTimerPausedEvent extends DomainEvent {
  readonly eventType = 'case.timer_paused';

  constructor(
    public readonly caseId: CaseId,
    public readonly timerType: 'response' | 'resolution' | 'update',
    public readonly elapsedMinutes: number,
    public readonly reason: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      timerType: this.timerType,
      elapsedMinutes: this.elapsedMinutes,
      reason: this.reason,
    };
  }
}

// ============================================================================
// Event Registry for Workflow Routing
// ============================================================================

/**
 * All case event types for workflow routing
 */
export const CASE_EVENT_TYPES = [
  'case.created',
  'case.status_changed',
  'case.deadline_updated',
  'case.task_added',
  'case.task_removed',
  'case.task_completed',
  'case.priority_changed',
  'case.closed',
  'case.workflow_started',
  'case.workflow_completed',
  'case.workflow_failed',
  'case.approval_required',
  'case.approval_received',
  'case.escalated',
  'case.sla_breached',
  'case.assigned',
  'case.note_added',
  'case.document_attached',
  'case.reopened',
  'case.timer_started',
  'case.timer_paused',
] as const;

export type CaseEventType = (typeof CASE_EVENT_TYPES)[number];

/**
 * Map event types to their recommended workflow engine
 */
export const CASE_EVENT_WORKFLOW_ROUTING: Record<
  CaseEventType,
  'temporal' | 'langgraph' | 'bullmq' | 'rules'
> = {
  // Durable workflows (Temporal)
  'case.created': 'temporal',
  'case.status_changed': 'temporal',
  'case.closed': 'temporal',
  'case.reopened': 'temporal',
  'case.workflow_started': 'temporal',
  'case.workflow_completed': 'temporal',
  'case.workflow_failed': 'temporal',
  'case.approval_required': 'temporal',
  'case.approval_received': 'temporal',
  'case.escalated': 'temporal',

  // Rules engine (fast, synchronous)
  'case.deadline_updated': 'rules',
  'case.priority_changed': 'rules',
  'case.sla_breached': 'rules',
  'case.timer_started': 'rules',
  'case.timer_paused': 'rules',

  // Background jobs (BullMQ)
  'case.task_added': 'bullmq',
  'case.task_removed': 'bullmq',
  'case.task_completed': 'bullmq',
  'case.assigned': 'bullmq',
  'case.note_added': 'bullmq',
  'case.document_attached': 'bullmq',
};
