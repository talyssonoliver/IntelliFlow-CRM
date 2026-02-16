/**
 * Case Workflow Events Tests
 *
 * Tests for all workflow-specific case domain events,
 * the event type registry, and workflow routing map.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import { CaseId } from '../../legal/cases/CaseId';
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
  CASE_EVENT_TYPES,
  CASE_EVENT_WORKFLOW_ROUTING,
} from '../case-events';

describe('Case Workflow Events', () => {
  describe('CaseWorkflowStartedEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();
      const event = new CaseWorkflowStartedEvent(
        caseId,
        'wf-001',
        'Contract Review',
        'temporal',
        'user-123'
      );

      expect(event.eventType).toBe('case.workflow_started');
      expect(event.caseId).toBe(caseId);
      expect(event.workflowId).toBe('wf-001');
      expect(event.workflowName).toBe('Contract Review');
      expect(event.workflowEngine).toBe('temporal');
      expect(event.initiatedBy).toBe('user-123');
      expect(event.eventId).toBeDefined();
      expect(event.occurredAt).toBeInstanceOf(Date);
    });

    it('should generate correct payload', () => {
      const caseId = CaseId.generate();
      const event = new CaseWorkflowStartedEvent(
        caseId,
        'wf-002',
        'Approval Flow',
        'langgraph',
        'user-456'
      );

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.workflowId).toBe('wf-002');
      expect(payload.workflowName).toBe('Approval Flow');
      expect(payload.workflowEngine).toBe('langgraph');
      expect(payload.initiatedBy).toBe('user-456');
    });
  });

  describe('CaseWorkflowCompletedEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();
      const result = { outcome: 'approved', score: 95 };
      const event = new CaseWorkflowCompletedEvent(caseId, 'wf-001', 'Review Flow', result, 5000);

      expect(event.eventType).toBe('case.workflow_completed');
      expect(event.caseId).toBe(caseId);
      expect(event.workflowId).toBe('wf-001');
      expect(event.workflowName).toBe('Review Flow');
      expect(event.result).toEqual(result);
      expect(event.durationMs).toBe(5000);
    });

    it('should generate correct payload', () => {
      const caseId = CaseId.generate();
      const result = { status: 'done' };
      const event = new CaseWorkflowCompletedEvent(caseId, 'wf-003', 'Processing', result, 1200);

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.workflowId).toBe('wf-003');
      expect(payload.result).toEqual(result);
      expect(payload.durationMs).toBe(1200);
    });
  });

  describe('CaseWorkflowFailedEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();
      const event = new CaseWorkflowFailedEvent(
        caseId,
        'wf-001',
        'Review Flow',
        'Timeout exceeded',
        true,
        2
      );

      expect(event.eventType).toBe('case.workflow_failed');
      expect(event.caseId).toBe(caseId);
      expect(event.error).toBe('Timeout exceeded');
      expect(event.retryable).toBe(true);
      expect(event.attemptNumber).toBe(2);
    });

    it('should generate correct payload', () => {
      const caseId = CaseId.generate();
      const event = new CaseWorkflowFailedEvent(
        caseId,
        'wf-010',
        'Escalation',
        'Not found',
        false,
        1
      );

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.workflowId).toBe('wf-010');
      expect(payload.error).toBe('Not found');
      expect(payload.retryable).toBe(false);
      expect(payload.attemptNumber).toBe(1);
    });
  });

  describe('CaseApprovalRequiredEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();
      const deadline = new Date('2025-06-01');
      const event = new CaseApprovalRequiredEvent(
        caseId,
        'wf-001',
        'proceed',
        ['manager-1', 'manager-2'],
        'Requires senior review',
        deadline
      );

      expect(event.eventType).toBe('case.approval_required');
      expect(event.approvalType).toBe('proceed');
      expect(event.requiredApprovers).toEqual(['manager-1', 'manager-2']);
      expect(event.reason).toBe('Requires senior review');
      expect(event.deadline).toEqual(deadline);
    });

    it('should handle null deadline', () => {
      const caseId = CaseId.generate();
      const event = new CaseApprovalRequiredEvent(
        caseId,
        'wf-002',
        'review',
        ['approver-1'],
        'Review needed',
        null
      );

      const payload = event.toPayload();

      expect(payload.deadline).toBeNull();
    });

    it('should generate correct payload', () => {
      const caseId = CaseId.generate();
      const deadline = new Date('2025-07-15');
      const event = new CaseApprovalRequiredEvent(
        caseId,
        'wf-005',
        'escalate',
        ['admin'],
        'High priority',
        deadline
      );

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.approvalType).toBe('escalate');
      expect(payload.requiredApprovers).toEqual(['admin']);
      expect(payload.reason).toBe('High priority');
      expect(payload.deadline).toBe(deadline.toISOString());
    });
  });

  describe('CaseApprovalReceivedEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();
      const event = new CaseApprovalReceivedEvent(
        caseId,
        'wf-001',
        'proceed',
        'manager-1',
        true,
        'Looks good'
      );

      expect(event.eventType).toBe('case.approval_received');
      expect(event.approvedBy).toBe('manager-1');
      expect(event.approved).toBe(true);
      expect(event.comments).toBe('Looks good');
    });

    it('should handle null comments', () => {
      const caseId = CaseId.generate();
      const event = new CaseApprovalReceivedEvent(caseId, 'wf-002', 'review', 'admin', false, null);

      const payload = event.toPayload();

      expect(payload.approved).toBe(false);
      expect(payload.comments).toBeNull();
    });

    it('should generate correct payload', () => {
      const caseId = CaseId.generate();
      const event = new CaseApprovalReceivedEvent(
        caseId,
        'wf-003',
        'close',
        'user-1',
        true,
        'Approved'
      );

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.workflowId).toBe('wf-003');
      expect(payload.approvalType).toBe('close');
      expect(payload.approvedBy).toBe('user-1');
    });
  });

  describe('CaseEscalatedEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();
      const event = new CaseEscalatedEvent(caseId, 2, 'junior-1', 'senior-1', 'SLA risk', 'system');

      expect(event.eventType).toBe('case.escalated');
      expect(event.escalationLevel).toBe(2);
      expect(event.previousAssignee).toBe('junior-1');
      expect(event.newAssignee).toBe('senior-1');
      expect(event.reason).toBe('SLA risk');
      expect(event.escalatedBy).toBe('system');
    });

    it('should generate correct payload', () => {
      const caseId = CaseId.generate();
      const event = new CaseEscalatedEvent(
        caseId,
        3,
        'user-a',
        'user-b',
        'Urgent matter',
        'manager-1'
      );

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.escalationLevel).toBe(3);
      expect(payload.previousAssignee).toBe('user-a');
      expect(payload.newAssignee).toBe('user-b');
      expect(payload.reason).toBe('Urgent matter');
      expect(payload.escalatedBy).toBe('manager-1');
    });
  });

  describe('CaseSLABreachedEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();
      const targetTime = new Date('2025-01-15T10:00:00Z');
      const breachedAt = new Date('2025-01-15T12:00:00Z');

      const event = new CaseSLABreachedEvent(caseId, 'response', targetTime, breachedAt, 120);

      expect(event.eventType).toBe('case.sla_breached');
      expect(event.slaType).toBe('response');
      expect(event.targetTime).toEqual(targetTime);
      expect(event.breachedAt).toEqual(breachedAt);
      expect(event.overageMinutes).toBe(120);
    });

    it('should generate correct payload with ISO dates', () => {
      const caseId = CaseId.generate();
      const targetTime = new Date('2025-03-01T09:00:00Z');
      const breachedAt = new Date('2025-03-01T11:30:00Z');

      const event = new CaseSLABreachedEvent(caseId, 'resolution', targetTime, breachedAt, 150);

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.slaType).toBe('resolution');
      expect(payload.targetTime).toBe(targetTime.toISOString());
      expect(payload.breachedAt).toBe(breachedAt.toISOString());
      expect(payload.overageMinutes).toBe(150);
    });
  });

  describe('CaseAssignedEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();
      const event = new CaseAssignedEvent(
        caseId,
        'old-user',
        'new-user',
        'admin-1',
        'Workload rebalancing'
      );

      expect(event.eventType).toBe('case.assigned');
      expect(event.previousAssignee).toBe('old-user');
      expect(event.newAssignee).toBe('new-user');
      expect(event.assignedBy).toBe('admin-1');
      expect(event.reason).toBe('Workload rebalancing');
    });

    it('should handle null previous assignee', () => {
      const caseId = CaseId.generate();
      const event = new CaseAssignedEvent(caseId, null, 'user-1', 'system', null);

      const payload = event.toPayload();

      expect(payload.previousAssignee).toBeNull();
      expect(payload.reason).toBeNull();
    });

    it('should generate correct payload', () => {
      const caseId = CaseId.generate();
      const event = new CaseAssignedEvent(
        caseId,
        'user-a',
        'user-b',
        'manager',
        'Specialization match'
      );

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.previousAssignee).toBe('user-a');
      expect(payload.newAssignee).toBe('user-b');
      expect(payload.assignedBy).toBe('manager');
      expect(payload.reason).toBe('Specialization match');
    });
  });

  describe('CaseNoteAddedEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();
      const event = new CaseNoteAddedEvent(
        caseId,
        'note-001',
        'Client called about update',
        false,
        'user-1'
      );

      expect(event.eventType).toBe('case.note_added');
      expect(event.noteId).toBe('note-001');
      expect(event.content).toBe('Client called about update');
      expect(event.isInternal).toBe(false);
      expect(event.addedBy).toBe('user-1');
    });

    it('should generate correct payload', () => {
      const caseId = CaseId.generate();
      const event = new CaseNoteAddedEvent(
        caseId,
        'note-002',
        'Internal strategy note',
        true,
        'lawyer-1'
      );

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.noteId).toBe('note-002');
      expect(payload.content).toBe('Internal strategy note');
      expect(payload.isInternal).toBe(true);
      expect(payload.addedBy).toBe('lawyer-1');
    });
  });

  describe('CaseDocumentAttachedEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();
      const event = new CaseDocumentAttachedEvent(
        caseId,
        'doc-001',
        'contract.pdf',
        'application/pdf',
        524288,
        'user-1'
      );

      expect(event.eventType).toBe('case.document_attached');
      expect(event.documentId).toBe('doc-001');
      expect(event.documentName).toBe('contract.pdf');
      expect(event.documentType).toBe('application/pdf');
      expect(event.sizeBytes).toBe(524288);
      expect(event.attachedBy).toBe('user-1');
    });

    it('should generate correct payload', () => {
      const caseId = CaseId.generate();
      const event = new CaseDocumentAttachedEvent(
        caseId,
        'doc-002',
        'evidence.jpg',
        'image/jpeg',
        1048576,
        'paralegal-1'
      );

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.documentId).toBe('doc-002');
      expect(payload.documentName).toBe('evidence.jpg');
      expect(payload.documentType).toBe('image/jpeg');
      expect(payload.sizeBytes).toBe(1048576);
      expect(payload.attachedBy).toBe('paralegal-1');
    });
  });

  describe('CaseReopenedEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();
      const closeDate = new Date('2025-01-10');
      const event = new CaseReopenedEvent(caseId, closeDate, 'New evidence discovered', 'user-1');

      expect(event.eventType).toBe('case.reopened');
      expect(event.originalCloseDate).toEqual(closeDate);
      expect(event.reason).toBe('New evidence discovered');
      expect(event.reopenedBy).toBe('user-1');
    });

    it('should generate correct payload with ISO date', () => {
      const caseId = CaseId.generate();
      const closeDate = new Date('2025-02-20T15:30:00Z');
      const event = new CaseReopenedEvent(caseId, closeDate, 'Client appeal', 'manager-1');

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.originalCloseDate).toBe(closeDate.toISOString());
      expect(payload.reason).toBe('Client appeal');
      expect(payload.reopenedBy).toBe('manager-1');
    });
  });

  describe('CaseTimerStartedEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();
      const startedAt = new Date('2025-01-15T09:00:00Z');
      const event = new CaseTimerStartedEvent(caseId, 'response', 60, startedAt);

      expect(event.eventType).toBe('case.timer_started');
      expect(event.timerType).toBe('response');
      expect(event.targetDuration).toBe(60);
      expect(event.startedAt).toEqual(startedAt);
    });

    it('should generate correct payload', () => {
      const caseId = CaseId.generate();
      const startedAt = new Date('2025-03-10T14:00:00Z');
      const event = new CaseTimerStartedEvent(caseId, 'resolution', 480, startedAt);

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.timerType).toBe('resolution');
      expect(payload.targetDuration).toBe(480);
      expect(payload.startedAt).toBe(startedAt.toISOString());
    });
  });

  describe('CaseTimerPausedEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();
      const event = new CaseTimerPausedEvent(caseId, 'response', 30, 'Waiting for client');

      expect(event.eventType).toBe('case.timer_paused');
      expect(event.timerType).toBe('response');
      expect(event.elapsedMinutes).toBe(30);
      expect(event.reason).toBe('Waiting for client');
    });

    it('should generate correct payload', () => {
      const caseId = CaseId.generate();
      const event = new CaseTimerPausedEvent(caseId, 'update', 120, 'Holiday period');

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.timerType).toBe('update');
      expect(payload.elapsedMinutes).toBe(120);
      expect(payload.reason).toBe('Holiday period');
    });
  });

  describe('Common Event Properties', () => {
    it('should generate unique event IDs for different events', () => {
      const caseId = CaseId.generate();
      const event1 = new CaseWorkflowStartedEvent(caseId, 'wf-1', 'Flow A', 'temporal', 'user-1');
      const event2 = new CaseWorkflowStartedEvent(caseId, 'wf-2', 'Flow B', 'temporal', 'user-2');

      expect(event1.eventId).not.toBe(event2.eventId);
    });

    it('should set occurredAt timestamp on creation', () => {
      const beforeCreate = new Date();
      const caseId = CaseId.generate();
      const event = new CaseEscalatedEvent(caseId, 1, 'user-a', 'user-b', 'test', 'system');
      const afterCreate = new Date();

      expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(event.occurredAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    });
  });

  describe('CASE_EVENT_TYPES', () => {
    it('should have 21 event types', () => {
      expect(CASE_EVENT_TYPES).toHaveLength(21);
    });

    it('should include core case events', () => {
      expect(CASE_EVENT_TYPES).toContain('case.created');
      expect(CASE_EVENT_TYPES).toContain('case.status_changed');
      expect(CASE_EVENT_TYPES).toContain('case.closed');
    });

    it('should include workflow events', () => {
      expect(CASE_EVENT_TYPES).toContain('case.workflow_started');
      expect(CASE_EVENT_TYPES).toContain('case.workflow_completed');
      expect(CASE_EVENT_TYPES).toContain('case.workflow_failed');
    });

    it('should include approval events', () => {
      expect(CASE_EVENT_TYPES).toContain('case.approval_required');
      expect(CASE_EVENT_TYPES).toContain('case.approval_received');
    });

    it('should include SLA and timer events', () => {
      expect(CASE_EVENT_TYPES).toContain('case.sla_breached');
      expect(CASE_EVENT_TYPES).toContain('case.timer_started');
      expect(CASE_EVENT_TYPES).toContain('case.timer_paused');
    });

    it('should include assignment and note events', () => {
      expect(CASE_EVENT_TYPES).toContain('case.assigned');
      expect(CASE_EVENT_TYPES).toContain('case.note_added');
      expect(CASE_EVENT_TYPES).toContain('case.document_attached');
      expect(CASE_EVENT_TYPES).toContain('case.reopened');
    });
  });

  describe('CASE_EVENT_WORKFLOW_ROUTING', () => {
    it('should map all event types in CASE_EVENT_TYPES', () => {
      for (const eventType of CASE_EVENT_TYPES) {
        expect(CASE_EVENT_WORKFLOW_ROUTING).toHaveProperty(eventType);
      }
    });

    it('should route workflow events to temporal', () => {
      expect(CASE_EVENT_WORKFLOW_ROUTING['case.workflow_started']).toBe('temporal');
      expect(CASE_EVENT_WORKFLOW_ROUTING['case.workflow_completed']).toBe('temporal');
      expect(CASE_EVENT_WORKFLOW_ROUTING['case.workflow_failed']).toBe('temporal');
    });

    it('should route timer events to rules engine', () => {
      expect(CASE_EVENT_WORKFLOW_ROUTING['case.timer_started']).toBe('rules');
      expect(CASE_EVENT_WORKFLOW_ROUTING['case.timer_paused']).toBe('rules');
      expect(CASE_EVENT_WORKFLOW_ROUTING['case.sla_breached']).toBe('rules');
    });

    it('should route task events to bullmq', () => {
      expect(CASE_EVENT_WORKFLOW_ROUTING['case.task_added']).toBe('bullmq');
      expect(CASE_EVENT_WORKFLOW_ROUTING['case.task_removed']).toBe('bullmq');
      expect(CASE_EVENT_WORKFLOW_ROUTING['case.task_completed']).toBe('bullmq');
    });

    it('should only contain valid routing targets', () => {
      const validTargets = ['temporal', 'langgraph', 'bullmq', 'rules'];
      for (const target of Object.values(CASE_EVENT_WORKFLOW_ROUTING)) {
        expect(validTargets).toContain(target);
      }
    });
  });
});
