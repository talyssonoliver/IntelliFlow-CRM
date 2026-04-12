/**
 * Audit Event Handler Additional Tests (supplementary coverage)
 *
 * Tests for uncovered branches in audit-event-handler.ts:
 * - handleBatch with mixed success/failure results
 * - Error handling in handle() when auditLogger.log throws
 * - inferAction: LOGOUT, TRANSFER edge cases
 * - inferResourceType: opportunity, task, appointment
 * - inferActorType: predict keyword detection
 * - Custom mapping overriding default
 * - Specific event mappings: ContactUpdated, ContactDeleted, AccountUpdated, AccountDeleted,
 *   OpportunityUpdated, OpportunityDeleted, TaskUpdated, TaskAssigned, TaskDeleted,
 *   AppointmentRescheduled, AppointmentCancelled, AppointmentDeleted,
 *   AIPrediction, AIGeneration, UserLoginFailed, PasswordReset, PermissionDenied,
 *   BulkUpdate, BulkDelete
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AuditEventHandler,
  resetAuditEventHandler,
  type DomainEventPayload,
} from '../audit-event-handler';

// Track what's passed to auditLogger.log
const mockLogFn = vi.fn().mockResolvedValue('audit-log-id-999');

vi.mock('../audit-logger', () => ({
  getAuditLogger: vi.fn(() => ({
    log: (...args: any[]) => mockLogFn(...args),
  })),
}));

const mockPrisma = {} as any;

describe('AuditEventHandler - Additional Coverage', () => {
  let handler: AuditEventHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAuditEventHandler();
    handler = new AuditEventHandler(mockPrisma);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Error handling in handle()
  // ===========================================================================
  describe('handle() error path', () => {
    it('should return error result when auditLogger.log throws', async () => {
      mockLogFn.mockRejectedValueOnce(new Error('Database connection lost'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const event: DomainEventPayload = {
        eventId: 'err-1',
        eventType: 'LeadCreated',
        aggregateType: 'Lead',
        aggregateId: 'lead-err',
        occurredAt: new Date(),
        payload: { lead: {} },
        metadata: { tenantId: 'tenant-1' },
      };

      const result = await handler.handle(event);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection lost');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should return error result when auditLogger.log throws non-Error', async () => {
      mockLogFn.mockRejectedValueOnce('string error');
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const event: DomainEventPayload = {
        eventId: 'err-2',
        eventType: 'LeadCreated',
        aggregateType: 'Lead',
        aggregateId: 'lead-err2',
        occurredAt: new Date(),
        payload: { lead: {} },
      };

      const result = await handler.handle(event);

      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
    });
  });

  // ===========================================================================
  // handleBatch with mixed results
  // ===========================================================================
  describe('handleBatch - mixed results', () => {
    it('should handle batch where some events fail', async () => {
      mockLogFn
        .mockResolvedValueOnce('id-1')
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce('id-3');

      vi.spyOn(console, 'error').mockImplementation(() => {});

      const events: DomainEventPayload[] = [
        {
          eventId: 'batch-ok',
          eventType: 'LeadCreated',
          aggregateType: 'Lead',
          aggregateId: 'lead-1',
          occurredAt: new Date(),
          payload: { lead: {} },
          metadata: { tenantId: 't1' },
        },
        {
          eventId: 'batch-fail',
          eventType: 'ContactCreated',
          aggregateType: 'Contact',
          aggregateId: 'contact-1',
          occurredAt: new Date(),
          payload: { contact: {} },
          metadata: { tenantId: 't1' },
        },
        {
          eventId: 'batch-ok-2',
          eventType: 'TaskCreated',
          aggregateType: 'Task',
          aggregateId: 'task-1',
          occurredAt: new Date(),
          payload: { task: {} },
          metadata: { tenantId: 't1' },
        },
      ];

      const results = await handler.handleBatch(events);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe('Timeout');
      expect(results[2].success).toBe(true);
    });
  });

  // ===========================================================================
  // Specific event mappings - uncovered events
  // ===========================================================================
  describe('Specific event mappings - additional coverage', () => {
    it('should handle ContactUpdated with changedFields', async () => {
      const event: DomainEventPayload = {
        eventId: 'cu-1',
        eventType: 'ContactUpdated',
        aggregateType: 'Contact',
        aggregateId: 'contact-1',
        occurredAt: new Date(),
        payload: {
          before: { firstName: 'Jane' },
          after: { firstName: 'Janet' },
          changedFields: ['firstName'],
        },
        metadata: { tenantId: 't1', userId: 'u1' },
      };

      const result = await handler.handle(event);
      expect(result.success).toBe(true);

      // Verify the log was called with correct extracted states
      expect(mockLogFn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          resourceType: 'contact',
          beforeState: { firstName: 'Jane' },
          afterState: { firstName: 'Janet' },
          changedFields: ['firstName'],
        })
      );
    });

    it('should handle ContactDeleted event', async () => {
      const result = await handler.handle({
        eventId: 'cd-1',
        eventType: 'ContactDeleted',
        aggregateType: 'Contact',
        aggregateId: 'c-del',
        occurredAt: new Date(),
        payload: {},
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELETE',
          resourceType: 'contact',
        })
      );
    });

    it('should handle AccountUpdated event', async () => {
      const result = await handler.handle({
        eventId: 'au-1',
        eventType: 'AccountUpdated',
        aggregateType: 'Account',
        aggregateId: 'acc-1',
        occurredAt: new Date(),
        payload: {
          before: { name: 'Old Corp' },
          after: { name: 'New Corp' },
          changedFields: ['name'],
        },
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          resourceType: 'account',
          changedFields: ['name'],
        })
      );
    });

    it('should handle AccountDeleted event', async () => {
      const result = await handler.handle({
        eventId: 'ad-1',
        eventType: 'AccountDeleted',
        aggregateType: 'Account',
        aggregateId: 'acc-del',
        occurredAt: new Date(),
        payload: {},
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE', resourceType: 'account' })
      );
    });

    it('should handle OpportunityUpdated event', async () => {
      const result = await handler.handle({
        eventId: 'ou-1',
        eventType: 'OpportunityUpdated',
        aggregateType: 'Opportunity',
        aggregateId: 'opp-1',
        occurredAt: new Date(),
        payload: {
          before: { amount: 1000 },
          after: { amount: 2000 },
          changedFields: ['amount'],
        },
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
    });

    it('should handle OpportunityDeleted event', async () => {
      const result = await handler.handle({
        eventId: 'od-1',
        eventType: 'OpportunityDeleted',
        aggregateType: 'Opportunity',
        aggregateId: 'opp-del',
        occurredAt: new Date(),
        payload: {},
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
    });

    it('should handle OpportunityClosed event with outcome', async () => {
      const result = await handler.handle({
        eventId: 'oc-1',
        eventType: 'OpportunityClosed',
        aggregateType: 'Opportunity',
        aggregateId: 'opp-closed',
        occurredAt: new Date(),
        payload: { closedAt: '2025-01-15', outcome: 'won' },
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(
        expect.objectContaining({
          afterState: expect.objectContaining({
            status: 'closed',
            outcome: 'won',
          }),
        })
      );
    });

    it('should handle TaskUpdated event', async () => {
      const result = await handler.handle({
        eventId: 'tu-1',
        eventType: 'TaskUpdated',
        aggregateType: 'Task',
        aggregateId: 'task-upd',
        occurredAt: new Date(),
        payload: {
          before: { status: 'PENDING' },
          after: { status: 'IN_PROGRESS' },
          changedFields: ['status'],
        },
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
    });

    it('should handle TaskAssigned event', async () => {
      const result = await handler.handle({
        eventId: 'ta-1',
        eventType: 'TaskAssigned',
        aggregateType: 'Task',
        aggregateId: 'task-assign',
        occurredAt: new Date(),
        payload: { assignedTo: 'user-2' },
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ASSIGN',
          afterState: { assignedTo: 'user-2' },
          changedFields: ['assignedTo'],
        })
      );
    });

    it('should handle TaskDeleted event', async () => {
      const result = await handler.handle({
        eventId: 'td-1',
        eventType: 'TaskDeleted',
        aggregateType: 'Task',
        aggregateId: 'task-del',
        occurredAt: new Date(),
        payload: {},
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
    });

    it('should handle AppointmentCreated event', async () => {
      const result = await handler.handle({
        eventId: 'ac-1',
        eventType: 'AppointmentCreated',
        aggregateType: 'Appointment',
        aggregateId: 'apt-1',
        occurredAt: new Date(),
        payload: {
          appointment: { title: 'Team Standup', startTime: '2025-01-10' },
        },
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          resourceType: 'appointment',
          resourceName: 'Team Standup',
        })
      );
    });

    it('should handle AppointmentRescheduled event', async () => {
      const result = await handler.handle({
        eventId: 'ar-1',
        eventType: 'AppointmentRescheduled',
        aggregateType: 'Appointment',
        aggregateId: 'apt-resch',
        occurredAt: new Date(),
        payload: {
          previousStartTime: '2025-01-10T10:00',
          previousEndTime: '2025-01-10T11:00',
          newStartTime: '2025-01-12T14:00',
          newEndTime: '2025-01-12T15:00',
        },
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(
        expect.objectContaining({
          changedFields: ['startTime', 'endTime'],
        })
      );
    });

    it('should handle AppointmentCancelled event', async () => {
      const result = await handler.handle({
        eventId: 'acn-1',
        eventType: 'AppointmentCancelled',
        aggregateType: 'Appointment',
        aggregateId: 'apt-cancel',
        occurredAt: new Date(),
        payload: { reason: 'Client unavailable' },
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(
        expect.objectContaining({
          afterState: { status: 'CANCELLED', reason: 'Client unavailable' },
        })
      );
    });

    it('should handle AppointmentDeleted event', async () => {
      const result = await handler.handle({
        eventId: 'adl-1',
        eventType: 'AppointmentDeleted',
        aggregateType: 'Appointment',
        aggregateId: 'apt-del',
        occurredAt: new Date(),
        payload: {},
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE', resourceType: 'appointment' })
      );
    });

    it('should handle AIPrediction event with AI_AGENT actor', async () => {
      const result = await handler.handle({
        eventId: 'aip-1',
        eventType: 'AIPrediction',
        aggregateType: 'AI',
        aggregateId: 'pred-1',
        occurredAt: new Date(),
        payload: { prediction: { churnRisk: 0.85 } },
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AI_PREDICT',
          actorType: 'AI_AGENT',
          afterState: { churnRisk: 0.85, severity: 'MEDIUM' },
        })
      );
    });

    it('should handle AIGeneration event', async () => {
      const result = await handler.handle({
        eventId: 'aig-1',
        eventType: 'AIGeneration',
        aggregateType: 'AI',
        aggregateId: 'gen-1',
        occurredAt: new Date(),
        payload: { content: 'Generated email text', model: 'gpt-4' },
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AI_GENERATE',
          actorType: 'AI_AGENT',
        })
      );
    });

    it('should handle UserLoginFailed event', async () => {
      const result = await handler.handle({
        eventId: 'ulf-1',
        eventType: 'UserLoginFailed',
        aggregateType: 'User',
        aggregateId: 'user-fail',
        occurredAt: new Date(),
        payload: { reason: 'Invalid password', attemptCount: 3 },
        metadata: { tenantId: 't1', userId: 'user-fail' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LOGIN_FAILED',
          dataClassification: 'PRIVILEGED',
        })
      );
    });

    it('should handle PasswordReset event', async () => {
      const result = await handler.handle({
        eventId: 'pr-1',
        eventType: 'PasswordReset',
        aggregateType: 'User',
        aggregateId: 'user-pr',
        occurredAt: new Date(),
        payload: {},
        metadata: { tenantId: 't1', userId: 'user-pr' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(expect.objectContaining({ action: 'PASSWORD_RESET' }));
    });

    it('should handle PermissionDenied event', async () => {
      const result = await handler.handle({
        eventId: 'pd-1',
        eventType: 'PermissionDenied',
        aggregateType: 'System',
        aggregateId: 'sys-1',
        occurredAt: new Date(),
        payload: { requiredPermission: 'admin:write', reason: 'Insufficient role' },
        metadata: { tenantId: 't1', userId: 'user-denied' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PERMISSION_DENIED',
          afterState: expect.objectContaining({
            requiredPermission: 'admin:write',
            reason: 'Insufficient role',
          }),
        })
      );
    });

    it('should handle BulkUpdate event', async () => {
      const result = await handler.handle({
        eventId: 'bu-1',
        eventType: 'BulkUpdate',
        aggregateType: 'System',
        aggregateId: 'bulk-1',
        occurredAt: new Date(),
        payload: { count: 50, successCount: 48, failureCount: 2 },
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BULK_UPDATE',
          afterState: { count: 50, successCount: 48, failureCount: 2 },
        })
      );
    });

    it('should handle BulkDelete event', async () => {
      const result = await handler.handle({
        eventId: 'bd-1',
        eventType: 'BulkDelete',
        aggregateType: 'System',
        aggregateId: 'bulk-del',
        occurredAt: new Date(),
        payload: { count: 25, successCount: 25, failureCount: 0 },
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(expect.objectContaining({ action: 'BULK_DELETE' }));
    });
  });

  // ===========================================================================
  // Action inference edge cases
  // ===========================================================================
  describe('inferAction edge cases', () => {
    it('should infer LOGOUT for logout events', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await handler.handle({
        eventId: 'inf-logout',
        eventType: 'SessionLogoutCompleted',
        aggregateType: 'Session',
        aggregateId: 'sess-1',
        occurredAt: new Date(),
        payload: {},
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGOUT' }));
    });

    it('should infer TRANSFER for transfer events', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await handler.handle({
        eventId: 'inf-transfer',
        eventType: 'LeadTransferred',
        aggregateType: 'Lead',
        aggregateId: 'lead-t',
        occurredAt: new Date(),
        payload: {},
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(expect.objectContaining({ action: 'TRANSFER' }));
    });

    it('should default to UPDATE for unrecognized event types', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await handler.handle({
        eventId: 'inf-default',
        eventType: 'SomethingHappened',
        aggregateType: 'Unknown',
        aggregateId: 'unk-1',
        occurredAt: new Date(),
        payload: {},
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE' }));
    });

    it('should infer CREATE for "added" events', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await handler.handle({
        eventId: 'inf-added',
        eventType: 'AttachmentAdded',
        aggregateType: 'Document',
        aggregateId: 'doc-1',
        occurredAt: new Date(),
        payload: {},
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE' }));
    });

    it('should infer DELETE for "removed" events', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await handler.handle({
        eventId: 'inf-removed',
        eventType: 'TagRemoved',
        aggregateType: 'Tag',
        aggregateId: 'tag-1',
        occurredAt: new Date(),
        payload: {},
        metadata: { tenantId: 't1' },
      });

      expect(result.success).toBe(true);
      expect(mockLogFn).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE' }));
    });
  });

  // ===========================================================================
  // Resource type inference edge cases
  // ===========================================================================
  describe('inferResourceType edge cases', () => {
    it('should infer opportunity resource type', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      await handler.handle({
        eventId: 'rt-opp',
        eventType: 'UnknownOpportunityEvent',
        aggregateType: 'OpportunityAggregate',
        aggregateId: 'opp-1',
        occurredAt: new Date(),
        payload: {},
        metadata: { tenantId: 't1' },
      });

      expect(mockLogFn).toHaveBeenCalledWith(
        expect.objectContaining({ resourceType: 'opportunity' })
      );
    });

    it('should infer appointment resource type', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      await handler.handle({
        eventId: 'rt-apt',
        eventType: 'UnknownAppointmentEvent',
        aggregateType: 'AppointmentEntity',
        aggregateId: 'apt-1',
        occurredAt: new Date(),
        payload: {},
        metadata: { tenantId: 't1' },
      });

      expect(mockLogFn).toHaveBeenCalledWith(
        expect.objectContaining({ resourceType: 'appointment' })
      );
    });

    it('should infer task resource type', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      await handler.handle({
        eventId: 'rt-task',
        eventType: 'UnknownTaskEvent',
        aggregateType: 'TaskWorkflow',
        aggregateId: 'task-1',
        occurredAt: new Date(),
        payload: {},
        metadata: { tenantId: 't1' },
      });

      expect(mockLogFn).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'task' }));
    });
  });

  // ===========================================================================
  // Actor type inference - predict keyword
  // ===========================================================================
  describe('inferActorType - predict keyword', () => {
    it('should infer AI_AGENT for predict events', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      await handler.handle({
        eventId: 'at-predict',
        eventType: 'ChurnPredicted',
        aggregateType: 'Prediction',
        aggregateId: 'pred-1',
        occurredAt: new Date(),
        payload: {},
        metadata: { tenantId: 't1' },
      });

      expect(mockLogFn).toHaveBeenCalledWith(expect.objectContaining({ actorType: 'AI_AGENT' }));
    });
  });

  // ===========================================================================
  // Custom mapping overriding default
  // ===========================================================================
  describe('custom mapping overriding default', () => {
    it('should prefer custom mapping over default for same event type', async () => {
      handler.registerMapping('LeadCreated', {
        action: 'CREATE',
        resourceType: 'lead',
        dataClassification: 'PRIVILEGED', // Override from CONFIDENTIAL
        extractAfterState: (p) => ({ customField: 'overridden' }),
      });

      await handler.handle({
        eventId: 'override-1',
        eventType: 'LeadCreated',
        aggregateType: 'Lead',
        aggregateId: 'lead-o',
        occurredAt: new Date(),
        payload: { lead: { email: 'test@test.com' } },
        metadata: { tenantId: 't1' },
      });

      expect(mockLogFn).toHaveBeenCalledWith(
        expect.objectContaining({
          dataClassification: 'PRIVILEGED',
          afterState: { customField: 'overridden' },
        })
      );
    });
  });

  // ===========================================================================
  // changedFields with null/undefined
  // ===========================================================================
  describe('extractChangedFields with missing data', () => {
    it('should handle LeadUpdated without changedFields in payload', async () => {
      await handler.handle({
        eventId: 'cf-1',
        eventType: 'LeadUpdated',
        aggregateType: 'Lead',
        aggregateId: 'lead-cf',
        occurredAt: new Date(),
        payload: {
          before: { status: 'NEW' },
          after: { status: 'QUALIFIED' },
          // changedFields is missing
        },
        metadata: { tenantId: 't1' },
      });

      expect(mockLogFn).toHaveBeenCalledWith(
        expect.objectContaining({
          changedFields: [], // Falls back to ?? []
        })
      );
    });
  });
});
