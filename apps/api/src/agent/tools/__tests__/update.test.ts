/**
 * Update Agent Tools Tests
 *
 * Tests for updateCaseTool and updateAppointmentTool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  updateCaseTool,
  updateAppointmentTool,
  updateTools,
  UpdatedCaseResult,
  UpdatedAppointmentResult,
} from '../update';
import type { AgentAuthContext } from '../../types';

// Mock the dependencies
vi.mock('../../logger', () => ({
  agentLogger: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../approval-workflow', () => ({
  pendingActionsStore: {
    add: vi.fn().mockResolvedValue(undefined),
  },
  rollbackStore: {
    add: vi.fn().mockResolvedValue(undefined),
  },
}));

const createMockContext = (overrides?: Partial<AgentAuthContext>): AgentAuthContext => ({
  userId: 'user-123',
  userEmail: 'user@example.com',
  role: 'SALES_REP',
  tenantId: 'tenant-123',
  agentSessionId: 'session-123',
  allowedActionTypes: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
  allowedEntityTypes: ['CASE', 'APPOINTMENT', 'CONTACT', 'LEAD'],
  maxActionsPerSession: 100,
  actionCount: 0,
  ...overrides,
});

describe('Update Agent Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateCaseTool', () => {
    describe('metadata', () => {
      it('should have correct name', () => {
        expect(updateCaseTool.name).toBe('update_case');
      });

      it('should have correct description', () => {
        expect(updateCaseTool.description).toContain('Update an existing legal case');
      });

      it('should have correct actionType', () => {
        expect(updateCaseTool.actionType).toBe('UPDATE');
      });

      it('should have correct entityTypes', () => {
        expect(updateCaseTool.entityTypes).toContain('CASE');
      });

      it('should require approval', () => {
        expect(updateCaseTool.requiresApproval).toBe(true);
      });

      it('should have inputSchema', () => {
        expect(updateCaseTool.inputSchema).toBeDefined();
      });
    });

    describe('execute', () => {
      it('should return requiresApproval and actionId on success', async () => {
        const context = createMockContext();
        const input = { id: 'case-123', title: 'Updated Title' };

        const result = await updateCaseTool.execute(input, context);

        expect(result.success).toBe(true);
        expect(result.requiresApproval).toBe(true);
        expect(result.actionId).toBeDefined();
        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      });

      it('should reject if CASE entity type not allowed', async () => {
        const context = createMockContext({
          allowedEntityTypes: ['APPOINTMENT'], // No CASE
        });
        const input = { id: 'case-123', title: 'Updated Title' };

        const result = await updateCaseTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Not authorized to update cases');
      });

      it('should reject if UPDATE action type not allowed', async () => {
        const context = createMockContext({
          allowedActionTypes: ['READ'], // No UPDATE
        });
        const input = { id: 'case-123', title: 'Updated Title' };

        const result = await updateCaseTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Not authorized to perform update actions');
      });

      it('should reject if max actions exceeded', async () => {
        const context = createMockContext({
          actionCount: 100,
          maxActionsPerSession: 100,
        });
        const input = { id: 'case-123', title: 'Updated Title' };

        const result = await updateCaseTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Maximum actions per session exceeded');
      });
    });

    describe('generatePreview', () => {
      it('should generate preview for title change', async () => {
        const context = createMockContext();
        const input = { id: 'case-123', title: 'New Title' };

        const preview = await updateCaseTool.generatePreview(input, context);

        expect(preview.summary).toContain('Update case');
        expect(preview.changes).toHaveLength(1);
        expect(preview.changes[0].field).toBe('title');
        expect(preview.changes[0].newValue).toBe('New Title');
        expect(preview.estimatedImpact).toBe('LOW');
      });

      it('should generate preview for description change', async () => {
        const context = createMockContext();
        const input = { id: 'case-123', description: 'New description' };

        const preview = await updateCaseTool.generatePreview(input, context);

        expect(preview.changes.some((c) => c.field === 'description')).toBe(true);
      });

      it('should add warning for URGENT priority', async () => {
        const context = createMockContext();
        const input = { id: 'case-123', priority: 'URGENT' as const };

        const preview = await updateCaseTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('URGENT'))).toBe(true);
        expect(preview.estimatedImpact).toBe('HIGH');
      });

      it('should add warning for HIGH priority', async () => {
        const context = createMockContext();
        const input = { id: 'case-123', priority: 'HIGH' as const };

        const preview = await updateCaseTool.generatePreview(input, context);

        expect(preview.estimatedImpact).toBe('HIGH');
      });

      it('should add warning for CLOSED status', async () => {
        const context = createMockContext();
        const input = { id: 'case-123', status: 'CLOSED' as const };

        const preview = await updateCaseTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('Closing'))).toBe(true);
        expect(preview.estimatedImpact).toBe('HIGH');
      });

      it('should add warning for CANCELLED status', async () => {
        const context = createMockContext();
        const input = { id: 'case-123', status: 'CANCELLED' as const };

        const preview = await updateCaseTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('Cancelling'))).toBe(true);
        expect(preview.estimatedImpact).toBe('HIGH');
      });

      it('should add warning for deadline in the past', async () => {
        const context = createMockContext();
        const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const input = { id: 'case-123', deadline: pastDate };

        const preview = await updateCaseTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('past'))).toBe(true);
      });

      it('should add warning for deadline less than 24 hours away', async () => {
        const context = createMockContext();
        const soonDate = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours from now
        const input = { id: 'case-123', deadline: soonDate };

        const preview = await updateCaseTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('24 hours'))).toBe(true);
        expect(preview.estimatedImpact).toBe('MEDIUM');
      });

      it('should add warning for assignee change', async () => {
        const context = createMockContext();
        const input = { id: 'case-123', assignedTo: 'new-user-id' };

        const preview = await updateCaseTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('Reassigning'))).toBe(true);
        expect(preview.estimatedImpact).toBe('MEDIUM');
      });

      it('should set LOW impact for minor changes', async () => {
        const context = createMockContext();
        const input = { id: 'case-123', title: 'Minor title change' };

        const preview = await updateCaseTool.generatePreview(input, context);

        expect(preview.estimatedImpact).toBe('LOW');
      });

      it('should include affected entities', async () => {
        const context = createMockContext();
        const input = { id: 'case-123', title: 'New Title' };

        const preview = await updateCaseTool.generatePreview(input, context);

        expect(preview.affectedEntities).toHaveLength(1);
        expect(preview.affectedEntities[0].type).toBe('CASE');
        expect(preview.affectedEntities[0].id).toBe('case-123');
      });
    });

    describe('rollback', () => {
      it('should successfully rollback a case update', async () => {
        const context = createMockContext();
        const executionResult: UpdatedCaseResult = {
          id: 'case-123',
          title: 'Updated Title',
          status: 'OPEN',
          priority: 'HIGH',
          previousState: {
            title: 'Original Title',
            status: 'OPEN',
            priority: 'MEDIUM',
          },
          updatedAt: new Date(),
        };

        const result = await updateCaseTool.rollback('action-123', executionResult, context);

        expect(result.success).toBe(true);
        expect(result.actionId).toBe('action-123');
        expect(result.rolledBackAt).toBeDefined();
        expect(result.restoredState).toEqual(executionResult.previousState);
      });

      it('should handle rollback errors gracefully', async () => {
        const context = createMockContext();
        const executionResult: UpdatedCaseResult = {
          id: 'case-123',
          title: 'Updated Title',
          status: 'OPEN',
          priority: 'HIGH',
          previousState: {},
          updatedAt: new Date(),
        };

        // Make rollbackStore.add throw
        const { rollbackStore } = await import('../../approval-workflow');
        vi.mocked(rollbackStore.add).mockRejectedValueOnce(new Error('Rollback failed'));

        const result = await updateCaseTool.rollback('action-123', executionResult, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Rollback failed');
      });
    });
  });

  describe('updateAppointmentTool', () => {
    describe('metadata', () => {
      it('should have correct name', () => {
        expect(updateAppointmentTool.name).toBe('update_appointment');
      });

      it('should have correct description', () => {
        expect(updateAppointmentTool.description).toContain('Update an existing appointment');
      });

      it('should have correct actionType', () => {
        expect(updateAppointmentTool.actionType).toBe('UPDATE');
      });

      it('should have correct entityTypes', () => {
        expect(updateAppointmentTool.entityTypes).toContain('APPOINTMENT');
      });

      it('should require approval', () => {
        expect(updateAppointmentTool.requiresApproval).toBe(true);
      });
    });

    describe('execute', () => {
      it('should return requiresApproval and actionId on success', async () => {
        const context = createMockContext();
        const input = { id: 'appt-123', title: 'Updated Meeting' };

        const result = await updateAppointmentTool.execute(input, context);

        expect(result.success).toBe(true);
        expect(result.requiresApproval).toBe(true);
        expect(result.actionId).toBeDefined();
      });

      it('should reject if APPOINTMENT entity type not allowed', async () => {
        const context = createMockContext({
          allowedEntityTypes: ['CASE'], // No APPOINTMENT
        });
        const input = { id: 'appt-123', title: 'Updated Meeting' };

        const result = await updateAppointmentTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Not authorized to update appointments');
      });

      it('should reject if UPDATE action type not allowed', async () => {
        const context = createMockContext({
          allowedActionTypes: ['READ'], // No UPDATE
        });
        const input = { id: 'appt-123', title: 'Updated Meeting' };

        const result = await updateAppointmentTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Not authorized to perform update actions');
      });

      it('should reject if start time is after end time', async () => {
        const context = createMockContext();
        const input = {
          id: 'appt-123',
          startTime: new Date('2024-01-15T14:00:00'),
          endTime: new Date('2024-01-15T13:00:00'), // Before start time
        };

        const result = await updateAppointmentTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Start time must be before end time');
      });

      it('should reject if max actions exceeded', async () => {
        const context = createMockContext({
          actionCount: 100,
          maxActionsPerSession: 100,
        });
        const input = { id: 'appt-123', title: 'Updated Meeting' };

        const result = await updateAppointmentTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Maximum actions per session exceeded');
      });
    });

    describe('generatePreview', () => {
      it('should generate preview for title change', async () => {
        const context = createMockContext();
        const input = { id: 'appt-123', title: 'New Meeting Title' };

        const preview = await updateAppointmentTool.generatePreview(input, context);

        expect(preview.summary).toContain('Update appointment');
        expect(preview.changes.some((c) => c.field === 'title')).toBe(true);
        expect(preview.estimatedImpact).toBe('LOW');
      });

      it('should generate preview for description change', async () => {
        const context = createMockContext();
        const input = { id: 'appt-123', description: 'Meeting agenda' };

        const preview = await updateAppointmentTool.generatePreview(input, context);

        expect(preview.changes.some((c) => c.field === 'description')).toBe(true);
      });

      it('should add warning for start time in the past', async () => {
        const context = createMockContext();
        const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const input = { id: 'appt-123', startTime: pastDate };

        const preview = await updateAppointmentTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('past'))).toBe(true);
        expect(preview.estimatedImpact).toBe('HIGH');
      });

      it('should add warning for time outside business hours (early morning)', async () => {
        const context = createMockContext();
        const earlyDate = new Date();
        earlyDate.setHours(6, 0, 0, 0);
        const input = { id: 'appt-123', startTime: earlyDate };

        const preview = await updateAppointmentTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('business hours'))).toBe(true);
      });

      it('should add warning for time outside business hours (late evening)', async () => {
        const context = createMockContext();
        const lateDate = new Date();
        lateDate.setHours(20, 0, 0, 0);
        const input = { id: 'appt-123', startTime: lateDate };

        const preview = await updateAppointmentTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('business hours'))).toBe(true);
      });

      it('should add warning for weekend appointment (Saturday)', async () => {
        const context = createMockContext();
        // Find next Saturday
        const saturday = new Date();
        saturday.setDate(saturday.getDate() + (6 - saturday.getDay()));
        saturday.setHours(10, 0, 0, 0);
        const input = { id: 'appt-123', startTime: saturday };

        const preview = await updateAppointmentTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('weekend'))).toBe(true);
      });

      it('should add warning for weekend appointment (Sunday)', async () => {
        const context = createMockContext();
        // Find next Sunday
        const sunday = new Date();
        sunday.setDate(sunday.getDate() + (7 - sunday.getDay()));
        sunday.setHours(10, 0, 0, 0);
        const input = { id: 'appt-123', startTime: sunday };

        const preview = await updateAppointmentTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('weekend'))).toBe(true);
      });

      it('should add warning for rescheduling notification', async () => {
        const context = createMockContext();
        const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        futureDate.setHours(14, 0, 0, 0);
        const input = { id: 'appt-123', startTime: futureDate };

        const preview = await updateAppointmentTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('notify all attendees'))).toBe(true);
      });

      it('should generate preview for endTime change', async () => {
        const context = createMockContext();
        const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const input = { id: 'appt-123', endTime: futureDate };

        const preview = await updateAppointmentTool.generatePreview(input, context);

        expect(preview.changes.some((c) => c.field === 'endTime')).toBe(true);
        expect(preview.estimatedImpact).toBe('HIGH');
      });

      it('should add warning for location change', async () => {
        const context = createMockContext();
        const input = { id: 'appt-123', location: 'New Conference Room' };

        const preview = await updateAppointmentTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('Location change'))).toBe(true);
        expect(preview.estimatedImpact).toBe('MEDIUM');
      });

      it('should generate preview for appointment type change', async () => {
        const context = createMockContext();
        const input = { id: 'appt-123', appointmentType: 'VIDEO_CALL' as const };

        const preview = await updateAppointmentTool.generatePreview(input, context);

        expect(preview.changes.some((c) => c.field === 'appointmentType')).toBe(true);
      });

      it('should generate preview for notes change', async () => {
        const context = createMockContext();
        const input = { id: 'appt-123', notes: 'New meeting notes' };

        const preview = await updateAppointmentTool.generatePreview(input, context);

        expect(preview.changes.some((c) => c.field === 'notes')).toBe(true);
        expect(preview.estimatedImpact).toBe('LOW');
      });

      it('should include affected entities', async () => {
        const context = createMockContext();
        const input = { id: 'appt-123', title: 'New Title' };

        const preview = await updateAppointmentTool.generatePreview(input, context);

        expect(preview.affectedEntities).toHaveLength(1);
        expect(preview.affectedEntities[0].type).toBe('APPOINTMENT');
        expect(preview.affectedEntities[0].id).toBe('appt-123');
      });
    });

    describe('rollback', () => {
      it('should successfully rollback an appointment update', async () => {
        const context = createMockContext();
        const executionResult: UpdatedAppointmentResult = {
          id: 'appt-123',
          title: 'Updated Meeting',
          startTime: new Date('2024-01-15T14:00:00'),
          endTime: new Date('2024-01-15T15:00:00'),
          previousState: {
            title: 'Original Meeting',
            startTime: new Date('2024-01-15T10:00:00'),
            endTime: new Date('2024-01-15T11:00:00'),
          },
          updatedAt: new Date(),
        };

        const result = await updateAppointmentTool.rollback('action-123', executionResult, context);

        expect(result.success).toBe(true);
        expect(result.actionId).toBe('action-123');
        expect(result.rolledBackAt).toBeDefined();
        expect(result.restoredState).toEqual(executionResult.previousState);
      });

      it('should handle rollback errors gracefully', async () => {
        const context = createMockContext();
        const executionResult: UpdatedAppointmentResult = {
          id: 'appt-123',
          title: 'Updated Meeting',
          startTime: new Date(),
          endTime: new Date(),
          previousState: {},
          updatedAt: new Date(),
        };

        // Make rollbackStore.add throw
        const { rollbackStore } = await import('../../approval-workflow');
        vi.mocked(rollbackStore.add).mockRejectedValueOnce(new Error('Rollback error'));

        const result = await updateAppointmentTool.rollback('action-123', executionResult, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Rollback');
      });
    });
  });

  describe('updateTools export', () => {
    it('should export both update tools', () => {
      expect(updateTools.updateCaseTool).toBe(updateCaseTool);
      expect(updateTools.updateAppointmentTool).toBe(updateAppointmentTool);
    });
  });
});
