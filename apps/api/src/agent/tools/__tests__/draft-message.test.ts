/**
 * Draft Message Agent Tool Tests
 *
 * Comprehensive tests for draftMessageTool.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { draftMessageTool, draftMessageTools } from '../draft-message';
import type { AgentAuthContext } from '../../types';

// Mock dependencies
vi.mock('../../logger', () => ({
  agentLogger: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../approval-workflow', () => ({
  pendingActionsStore: {
    add: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getBySession: vi.fn().mockResolvedValue([]),
  },
}));

const createMockContext = (overrides?: Partial<AgentAuthContext>): AgentAuthContext => ({
  userId: 'user-123',
  userEmail: 'user@example.com',
  role: 'SALES_REP',
  tenantId: 'tenant-123',
  agentSessionId: 'session-123',
  allowedActionTypes: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'SEARCH', 'DRAFT'],
  allowedEntityTypes: ['LEAD', 'CONTACT', 'ACCOUNT', 'OPPORTUNITY', 'CASE', 'APPOINTMENT', 'MESSAGE'],
  maxActionsPerSession: 100,
  actionCount: 0,
  ...overrides,
});

describe('Draft Message Agent Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('draftMessageTool', () => {
    describe('metadata', () => {
      it('should have correct name', () => {
        expect(draftMessageTool.name).toBe('draft_message');
      });

      it('should have correct description', () => {
        expect(draftMessageTool.description).toContain('Draft an email, SMS, or internal note');
        expect(draftMessageTool.description).toContain('approval');
      });

      it('should have correct actionType', () => {
        expect(draftMessageTool.actionType).toBe('DRAFT');
      });

      it('should have MESSAGE in entityTypes', () => {
        expect(draftMessageTool.entityTypes).toContain('MESSAGE');
      });

      it('should have LEAD, CONTACT, ACCOUNT in entityTypes', () => {
        expect(draftMessageTool.entityTypes).toContain('LEAD');
        expect(draftMessageTool.entityTypes).toContain('CONTACT');
        expect(draftMessageTool.entityTypes).toContain('ACCOUNT');
      });

      it('should require approval', () => {
        expect(draftMessageTool.requiresApproval).toBe(true);
      });

      it('should have input schema', () => {
        expect(draftMessageTool.inputSchema).toBeDefined();
      });
    });

    describe('execute', () => {
      it('should create a pending action for a valid email draft', async () => {
        const context = createMockContext();
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Follow-up',
          body: 'Thank you for your interest.',
        };

        const result = await draftMessageTool.execute(input, context);

        expect(result.success).toBe(true);
        expect(result.requiresApproval).toBe(true);
        expect(result.actionId).toBeDefined();
        expect(result.executionTimeMs).toBeDefined();
      });

      it('should create a pending action for a valid SMS draft', async () => {
        const context = createMockContext();
        const input = {
          type: 'SMS' as const,
          recipientType: 'CONTACT' as const,
          recipientId: 'contact-123',
          body: 'Quick reminder about our meeting tomorrow.',
        };

        const result = await draftMessageTool.execute(input, context);

        expect(result.success).toBe(true);
        expect(result.requiresApproval).toBe(true);
      });

      it('should create a pending action for a valid note', async () => {
        const context = createMockContext();
        const input = {
          type: 'NOTE' as const,
          recipientType: 'ACCOUNT' as const,
          recipientId: 'account-123',
          body: 'Internal note about this account.',
        };

        const result = await draftMessageTool.execute(input, context);

        expect(result.success).toBe(true);
        expect(result.requiresApproval).toBe(true);
      });

      it('should return error when DRAFT action not allowed', async () => {
        const context = createMockContext({
          allowedActionTypes: ['READ', 'SEARCH'],
        });
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Test',
          body: 'Test message',
        };

        const result = await draftMessageTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Not authorized to draft messages');
      });

      it('should return error when LEAD entity type not allowed', async () => {
        const context = createMockContext({
          allowedEntityTypes: ['CONTACT', 'ACCOUNT'],
        });
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Test',
          body: 'Test message',
        };

        const result = await draftMessageTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Not authorized to send messages to LEAD');
      });

      it('should return error when CONTACT entity type not allowed', async () => {
        const context = createMockContext({
          allowedEntityTypes: ['LEAD', 'ACCOUNT'],
        });
        const input = {
          type: 'SMS' as const,
          recipientType: 'CONTACT' as const,
          recipientId: 'contact-123',
          body: 'Test message',
        };

        const result = await draftMessageTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Not authorized to send messages to CONTACT');
      });

      it('should return error when ACCOUNT entity type not allowed', async () => {
        const context = createMockContext({
          allowedEntityTypes: ['LEAD', 'CONTACT'],
        });
        const input = {
          type: 'NOTE' as const,
          recipientType: 'ACCOUNT' as const,
          recipientId: 'account-123',
          body: 'Test note',
        };

        const result = await draftMessageTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Not authorized to send messages to ACCOUNT');
      });

      it('should return error when email has no subject', async () => {
        const context = createMockContext();
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          body: 'Test message without subject',
        };

        const result = await draftMessageTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Email messages require a subject');
      });

      it('should return error when max actions exceeded', async () => {
        const context = createMockContext({
          maxActionsPerSession: 5,
          actionCount: 5,
        });
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Test',
          body: 'Test message',
        };

        const result = await draftMessageTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Maximum actions per session exceeded');
      });

      it('should handle execution errors gracefully', async () => {
        const { pendingActionsStore } = await import('../../approval-workflow');
        vi.mocked(pendingActionsStore.add).mockRejectedValueOnce(new Error('Store failed'));

        const context = createMockContext();
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Test',
          body: 'Test message',
        };

        const result = await draftMessageTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Store failed');
      });

      it('should handle non-Error exceptions', async () => {
        const { pendingActionsStore } = await import('../../approval-workflow');
        vi.mocked(pendingActionsStore.add).mockRejectedValueOnce('String error');

        const context = createMockContext();
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Test',
          body: 'Test message',
        };

        const result = await draftMessageTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unknown error');
      });
    });

    describe('generatePreview', () => {
      it('should generate preview for email with subject', async () => {
        const context = createMockContext();
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Follow-up Meeting',
          body: 'Thank you for your interest in our services.',
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.summary).toContain('Draft email');
        expect(preview.summary).toContain('Follow-up Meeting');
        expect(preview.summary).toContain('lead');
        expect(preview.estimatedImpact).toBe('MEDIUM');
        expect(preview.affectedEntities).toHaveLength(2);
      });

      it('should generate preview for SMS', async () => {
        const context = createMockContext();
        const input = {
          type: 'SMS' as const,
          recipientType: 'CONTACT' as const,
          recipientId: 'contact-123',
          body: 'Quick reminder.',
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.summary).toContain('Draft sms');
        expect(preview.summary).toContain('contact');
        expect(preview.estimatedImpact).toBe('HIGH');
      });

      it('should generate preview for NOTE', async () => {
        const context = createMockContext();
        const input = {
          type: 'NOTE' as const,
          recipientType: 'ACCOUNT' as const,
          recipientId: 'account-123',
          body: 'Internal note.',
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.summary).toContain('Draft note');
        expect(preview.summary).toContain('account');
        expect(preview.estimatedImpact).toBe('LOW');
      });

      it('should add warning for long SMS', async () => {
        const context = createMockContext();
        const input = {
          type: 'SMS' as const,
          recipientType: 'CONTACT' as const,
          recipientId: 'contact-123',
          body: 'A'.repeat(200), // More than 160 characters
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('200 characters'))).toBe(true);
        expect(preview.warnings?.some((w) => w.includes('split into multiple SMS'))).toBe(true);
      });

      it('should add warning for very long email', async () => {
        const context = createMockContext();
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Long Email',
          body: 'A'.repeat(6000), // More than 5000 characters
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('quite long'))).toBe(true);
      });

      it('should add scheduled time to changes and summary', async () => {
        const context = createMockContext();
        const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Scheduled Email',
          body: 'This is scheduled.',
          scheduledFor,
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.summary).toContain('scheduled for');
        const scheduledChange = preview.changes.find((c) => c.field === 'scheduledFor');
        expect(scheduledChange).toBeDefined();
        expect(scheduledChange?.newValue).toBe(scheduledFor.toISOString());
      });

      it('should add warning for past scheduled time', async () => {
        const context = createMockContext();
        const pastTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Past Email',
          body: 'This was scheduled in the past.',
          scheduledFor: pastTime,
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings).toContain('Warning: Scheduled time is in the past');
      });

      it('should add warning for early morning scheduled time', async () => {
        const context = createMockContext();
        const earlyMorning = new Date('2026-02-02T05:00:00');
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Early Email',
          body: 'This is scheduled early.',
          scheduledFor: earlyMorning,
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('outside typical business hours'))).toBe(
          true
        );
      });

      it('should add warning for late evening scheduled time', async () => {
        const context = createMockContext();
        const lateEvening = new Date('2026-02-02T21:00:00');
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Late Email',
          body: 'This is scheduled late.',
          scheduledFor: lateEvening,
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('outside typical business hours'))).toBe(
          true
        );
      });

      it('should add templateId to changes when provided', async () => {
        const context = createMockContext();
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Template Email',
          body: 'Using template.',
          templateId: 'template-456',
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        const templateChange = preview.changes.find((c) => c.field === 'templateId');
        expect(templateChange).toBeDefined();
        expect(templateChange?.newValue).toBe('template-456');
      });

      it('should add warning for confidential content', async () => {
        const context = createMockContext();
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Important Info',
          body: 'This information is confidential and should not be shared.',
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('confidential content'))).toBe(true);
      });

      it('should add warning for private content', async () => {
        const context = createMockContext();
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Private Info',
          body: 'This is private information for your eyes only.',
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('confidential content'))).toBe(true);
      });

      it('should add warning for email without unsubscribe', async () => {
        const context = createMockContext();
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Marketing Email',
          body: 'Check out our latest offers!',
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('unsubscribe link'))).toBe(true);
      });

      it('should not warn about unsubscribe when present', async () => {
        const context = createMockContext();
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Marketing Email',
          body: 'Check out our offers! Click here to unsubscribe.',
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.warnings?.some((w) => w.includes('unsubscribe link'))).toBeFalsy();
      });

      it('should not warn about unsubscribe for SMS', async () => {
        const context = createMockContext();
        const input = {
          type: 'SMS' as const,
          recipientType: 'CONTACT' as const,
          recipientId: 'contact-123',
          body: 'Check out our offers!',
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.warnings?.some((w) => w.includes('unsubscribe'))).toBeFalsy();
      });

      it('should not warn about unsubscribe for NOTE', async () => {
        const context = createMockContext();
        const input = {
          type: 'NOTE' as const,
          recipientType: 'ACCOUNT' as const,
          recipientId: 'account-123',
          body: 'Internal note without unsubscribe.',
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.warnings?.some((w) => w.includes('unsubscribe'))).toBeFalsy();
      });

      it('should create correct affected entities', async () => {
        const context = createMockContext();
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Test',
          body: 'Test body',
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.affectedEntities).toHaveLength(2);
        expect(preview.affectedEntities[0]).toEqual({
          type: 'MESSAGE',
          id: 'NEW',
          name: 'Test',
          action: 'CREATE',
        });
        expect(preview.affectedEntities[1]).toEqual({
          type: 'LEAD',
          id: 'lead-123',
          name: 'LEAD lead-123',
          action: 'UPDATE',
        });
      });

      it('should use message type for name when no subject', async () => {
        const context = createMockContext();
        const input = {
          type: 'SMS' as const,
          recipientType: 'CONTACT' as const,
          recipientId: 'contact-456',
          body: 'SMS body',
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.affectedEntities[0].name).toBe('SMS to CONTACT');
      });

      it('should have no warnings for normal short email with unsubscribe', async () => {
        const context = createMockContext();
        const scheduledFor = new Date('2026-02-02T14:00:00'); // Business hours
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Normal Email',
          body: 'This is a normal email. Click to unsubscribe.',
          scheduledFor,
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.warnings?.length ?? 0).toBe(0);
      });
    });

    describe('rollback', () => {
      it('should successfully rollback a draft message', async () => {
        const context = createMockContext();
        const executionResult = {
          id: 'message-123',
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Test',
          body: 'Test body',
          status: 'DRAFT' as const,
          createdAt: new Date(),
        };

        const result = await draftMessageTool.rollback('action-123', executionResult, context);

        expect(result.success).toBe(true);
        expect(result.actionId).toBe('action-123');
        expect(result.rolledBackAt).toBeInstanceOf(Date);
        expect(result.restoredState).toEqual({ cancelledMessageId: 'message-123' });
      });

      it('should successfully rollback a pending approval message', async () => {
        const context = createMockContext();
        const executionResult = {
          id: 'message-456',
          type: 'SMS' as const,
          recipientType: 'CONTACT' as const,
          recipientId: 'contact-123',
          body: 'SMS body',
          status: 'PENDING_APPROVAL' as const,
          createdAt: new Date(),
        };

        const result = await draftMessageTool.rollback('action-456', executionResult, context);

        expect(result.success).toBe(true);
      });

      it('should successfully rollback a scheduled message', async () => {
        const context = createMockContext();
        const executionResult = {
          id: 'message-789',
          type: 'EMAIL' as const,
          recipientType: 'ACCOUNT' as const,
          recipientId: 'account-123',
          subject: 'Scheduled',
          body: 'Scheduled body',
          status: 'SCHEDULED' as const,
          scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000),
          createdAt: new Date(),
        };

        const result = await draftMessageTool.rollback('action-789', executionResult, context);

        expect(result.success).toBe(true);
      });

      it('should fail rollback for sent message', async () => {
        const context = createMockContext();
        const executionResult = {
          id: 'message-sent',
          type: 'EMAIL' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          subject: 'Sent Email',
          body: 'Already sent',
          status: 'SENT' as const,
          createdAt: new Date(),
        };

        const result = await draftMessageTool.rollback('action-sent', executionResult, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Cannot rollback a message that has already been sent');
      });

      it('should handle rollback errors', async () => {
        const { agentLogger } = await import('../../logger');
        vi.mocked(agentLogger.log).mockRejectedValueOnce(new Error('Log error'));

        const context = createMockContext();
        const executionResult = {
          id: 'message-error',
          type: 'NOTE' as const,
          recipientType: 'ACCOUNT' as const,
          recipientId: 'account-123',
          body: 'Note body',
          status: 'DRAFT' as const,
          createdAt: new Date(),
        };

        const result = await draftMessageTool.rollback('action-error', executionResult, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Log error');
      });

      it('should handle non-Error exceptions in rollback', async () => {
        const { agentLogger } = await import('../../logger');
        vi.mocked(agentLogger.log).mockRejectedValueOnce({ custom: 'error' });

        const context = createMockContext();
        const executionResult = {
          id: 'message-custom',
          type: 'SMS' as const,
          recipientType: 'CONTACT' as const,
          recipientId: 'contact-123',
          body: 'SMS body',
          status: 'DRAFT' as const,
          createdAt: new Date(),
        };

        const result = await draftMessageTool.rollback('action-custom', executionResult, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Rollback failed');
      });
    });
  });

  describe('draftMessageTools export', () => {
    it('should export draftMessageTool', () => {
      expect(draftMessageTools.draftMessageTool).toBe(draftMessageTool);
    });

    it('should have exactly 1 tool', () => {
      expect(Object.keys(draftMessageTools)).toHaveLength(1);
    });
  });
});
