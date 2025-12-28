/**
 * Agent Tools Tests
 *
 * IFC-139: Tests for agent tools
 *
 * Validates:
 * - Search tools work without approval
 * - Create/Update/Draft tools require approval
 * - Preview generation
 * - Rollback capability
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  searchLeadsTool,
  searchContactsTool,
  searchOpportunitiesTool,
  combinedSearchTool,
  createCaseTool,
  createAppointmentTool,
  updateCaseTool,
  updateAppointmentTool,
  draftMessageTool,
  getAgentTool,
  getAvailableToolNames,
  getToolsByActionType,
  getToolsRequiringApproval,
} from '../tools';
import { AgentAuthContext } from '../types';
import { resetSessionActionCount } from '../authorization';

describe('Agent Tools', () => {
  const testSessionId = 'test-session-tools';

  const createTestContext = (overrides: Partial<AgentAuthContext> = {}): AgentAuthContext => ({
    userId: 'user-1',
    userRole: 'MANAGER',
    permissions: [],
    agentSessionId: testSessionId,
    allowedEntityTypes: [
      'LEAD',
      'CONTACT',
      'ACCOUNT',
      'OPPORTUNITY',
      'CASE',
      'APPOINTMENT',
      'TASK',
      'MESSAGE',
    ],
    allowedActionTypes: ['SEARCH', 'CREATE', 'UPDATE', 'DRAFT'],
    maxActionsPerSession: 100,
    actionCount: 0,
    ...overrides,
  });

  beforeEach(() => {
    resetSessionActionCount(testSessionId);
    vi.clearAllMocks();
  });

  describe('Tool Registry', () => {
    it('should have all expected tools registered', () => {
      const toolNames = getAvailableToolNames();

      expect(toolNames).toContain('search_leads');
      expect(toolNames).toContain('search_contacts');
      expect(toolNames).toContain('search_opportunities');
      expect(toolNames).toContain('search_crm');
      expect(toolNames).toContain('create_case');
      expect(toolNames).toContain('create_appointment');
      expect(toolNames).toContain('update_case');
      expect(toolNames).toContain('update_appointment');
      expect(toolNames).toContain('draft_message');
    });

    it('should get tool by name', () => {
      const tool = getAgentTool('search_leads');

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('search_leads');
      expect(tool?.actionType).toBe('SEARCH');
    });

    it('should return undefined for unknown tool', () => {
      const tool = getAgentTool('unknown_tool');
      expect(tool).toBeUndefined();
    });

    it('should filter tools by action type', () => {
      const searchTools = getToolsByActionType('SEARCH');
      const createTools = getToolsByActionType('CREATE');
      const updateTools = getToolsByActionType('UPDATE');

      expect(searchTools.length).toBeGreaterThan(0);
      expect(searchTools.every((t) => t.actionType === 'SEARCH')).toBe(true);

      expect(createTools.length).toBeGreaterThan(0);
      expect(createTools.every((t) => t.actionType === 'CREATE')).toBe(true);

      expect(updateTools.length).toBeGreaterThan(0);
      expect(updateTools.every((t) => t.actionType === 'UPDATE')).toBe(true);
    });

    it('should identify tools requiring approval', () => {
      const approvalTools = getToolsRequiringApproval();

      expect(approvalTools.length).toBeGreaterThan(0);
      expect(approvalTools.every((t) => t.requiresApproval)).toBe(true);
      expect(approvalTools.some((t) => t.name === 'create_case')).toBe(true);
      expect(approvalTools.some((t) => t.name === 'update_appointment')).toBe(true);
      expect(approvalTools.some((t) => t.name === 'draft_message')).toBe(true);
    });
  });

  describe('Search Tools', () => {
    describe('searchLeadsTool', () => {
      it('should not require approval', () => {
        expect(searchLeadsTool.requiresApproval).toBe(false);
      });

      it('should have SEARCH action type', () => {
        expect(searchLeadsTool.actionType).toBe('SEARCH');
      });

      it('should execute successfully', async () => {
        const context = createTestContext();
        const input = { query: 'test', limit: 20, offset: 0 };

        const result = await searchLeadsTool.execute(input, context);

        expect(result.success).toBe(true);
        expect(result.requiresApproval).toBe(false);
        expect(result.data).toBeDefined();
      });

      it('should reject unauthorized entity access', async () => {
        const context = createTestContext({
          allowedEntityTypes: ['CONTACT'], // No LEAD access
        });
        const input = { query: 'test', limit: 20, offset: 0 };

        const result = await searchLeadsTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Not authorized');
      });

      it('should generate preview', async () => {
        const context = createTestContext();
        const input = { query: 'test query', status: ['NEW', 'CONTACTED'] as const, limit: 20, offset: 0 };

        const preview = await searchLeadsTool.generatePreview(input, context);

        expect(preview.summary).toContain('Search leads');
        expect(preview.estimatedImpact).toBe('LOW');
      });
    });

    describe('combinedSearchTool', () => {
      it('should search multiple entity types', async () => {
        const context = createTestContext();
        const input = {
          entityTypes: ['LEAD', 'CONTACT', 'OPPORTUNITY'] as const,
          query: 'test',
          limit: 20,
        };

        const result = await combinedSearchTool.execute(input, context);

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
      });
    });
  });

  describe('Create Tools', () => {
    describe('createCaseTool', () => {
      it('should require approval', () => {
        expect(createCaseTool.requiresApproval).toBe(true);
      });

      it('should have CREATE action type', () => {
        expect(createCaseTool.actionType).toBe('CREATE');
      });

      it('should return actionId for pending approval', async () => {
        const context = createTestContext();
        const input = {
          title: 'Test Case',
          clientId: 'client-123',
          priority: 'MEDIUM' as const,
        };

        const result = await createCaseTool.execute(input, context);

        expect(result.success).toBe(true);
        expect(result.requiresApproval).toBe(true);
        expect(result.actionId).toBeDefined();
      });

      it('should generate preview with warnings for urgent priority', async () => {
        const context = createTestContext();
        const input = {
          title: 'Urgent Case',
          clientId: 'client-123',
          priority: 'URGENT' as const,
        };

        const preview = await createCaseTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('URGENT'))).toBe(true);
        expect(preview.estimatedImpact).toBe('HIGH');
      });

      it('should have rollback capability', () => {
        expect(createCaseTool.rollback).toBeDefined();
      });
    });

    describe('createAppointmentTool', () => {
      it('should require approval', () => {
        expect(createAppointmentTool.requiresApproval).toBe(true);
      });

      it('should validate time range', async () => {
        const context = createTestContext();
        const now = new Date();
        const input = {
          title: 'Test Appointment',
          startTime: new Date(now.getTime() + 3600000), // 1 hour from now
          endTime: new Date(now.getTime()), // In the past (before start)
          appointmentType: 'MEETING' as const,
          attendeeIds: [],
          linkedCaseIds: [],
        };

        const result = await createAppointmentTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Start time must be before end time');
      });

      it('should generate preview with duration', async () => {
        const context = createTestContext();
        const now = new Date();
        const input = {
          title: 'Meeting',
          startTime: new Date(now.getTime() + 3600000),
          endTime: new Date(now.getTime() + 7200000), // 1 hour duration
          appointmentType: 'MEETING' as const,
          attendeeIds: [],
          linkedCaseIds: [],
        };

        const preview = await createAppointmentTool.generatePreview(input, context);

        expect(preview.changes.some((c) => c.field === 'duration')).toBe(true);
      });
    });
  });

  describe('Update Tools', () => {
    describe('updateCaseTool', () => {
      it('should require approval', () => {
        expect(updateCaseTool.requiresApproval).toBe(true);
      });

      it('should have UPDATE action type', () => {
        expect(updateCaseTool.actionType).toBe('UPDATE');
      });

      it('should generate preview showing field changes', async () => {
        const context = createTestContext();
        const input = {
          id: 'case-123',
          title: 'Updated Title',
          priority: 'HIGH' as const,
          status: 'CLOSED' as const,
        };

        const preview = await updateCaseTool.generatePreview(input, context);

        expect(preview.changes.some((c) => c.field === 'title')).toBe(true);
        expect(preview.changes.some((c) => c.field === 'priority')).toBe(true);
        expect(preview.changes.some((c) => c.field === 'status')).toBe(true);
        expect(preview.warnings?.some((w) => w.includes('Closing'))).toBe(true);
        expect(preview.estimatedImpact).toBe('HIGH');
      });

      it('should have rollback capability', () => {
        expect(updateCaseTool.rollback).toBeDefined();
      });
    });

    describe('updateAppointmentTool', () => {
      it('should warn about rescheduling', async () => {
        const context = createTestContext();
        const input = {
          id: 'apt-123',
          startTime: new Date(),
          endTime: new Date(Date.now() + 3600000),
        };

        const preview = await updateAppointmentTool.generatePreview(input, context);

        expect(preview.warnings?.some((w) => w.includes('notify all attendees'))).toBe(true);
        expect(preview.estimatedImpact).toBe('HIGH');
      });
    });
  });

  describe('Draft Message Tool', () => {
    describe('draftMessageTool', () => {
      it('should require approval', () => {
        expect(draftMessageTool.requiresApproval).toBe(true);
      });

      it('should have DRAFT action type', () => {
        expect(draftMessageTool.actionType).toBe('DRAFT');
      });

      it('should require subject for email', async () => {
        const context = createTestContext();
        const input = {
          type: 'EMAIL' as const,
          recipientType: 'CONTACT' as const,
          recipientId: 'contact-123',
          body: 'Hello, this is a test email.',
          // Missing subject
        };

        const result = await draftMessageTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('subject');
      });

      it('should warn about long SMS messages', async () => {
        const context = createTestContext();
        const longBody = 'A'.repeat(200); // Over 160 characters
        const input = {
          type: 'SMS' as const,
          recipientType: 'LEAD' as const,
          recipientId: 'lead-123',
          body: longBody,
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.warnings?.some((w) => w.includes('160 characters'))).toBe(true);
        expect(preview.estimatedImpact).toBe('HIGH');
      });

      it('should set lower impact for internal notes', async () => {
        const context = createTestContext();
        const input = {
          type: 'NOTE' as const,
          recipientType: 'ACCOUNT' as const,
          recipientId: 'account-123',
          body: 'Internal note about this account.',
        };

        const preview = await draftMessageTool.generatePreview(input, context);

        expect(preview.estimatedImpact).toBe('LOW');
      });

      it('should handle rollback for unsent messages', async () => {
        const context = createTestContext();
        const executionResult = {
          id: 'msg-123',
          type: 'EMAIL' as const,
          recipientType: 'CONTACT' as const,
          recipientId: 'contact-123',
          subject: 'Test',
          body: 'Test body',
          status: 'DRAFT' as const,
          createdAt: new Date(),
        };

        const result = await draftMessageTool.rollback?.('action-123', executionResult, context);

        expect(result?.success).toBe(true);
      });

      it('should prevent rollback of sent messages', async () => {
        const context = createTestContext();
        const executionResult = {
          id: 'msg-123',
          type: 'EMAIL' as const,
          recipientType: 'CONTACT' as const,
          recipientId: 'contact-123',
          subject: 'Test',
          body: 'Test body',
          status: 'SENT' as const,
          createdAt: new Date(),
        };

        const result = await draftMessageTool.rollback?.('action-123', executionResult, context);

        expect(result?.success).toBe(false);
        expect(result?.error).toContain('already been sent');
      });
    });
  });
});
