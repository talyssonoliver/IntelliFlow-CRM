/**
 * Create Agent Tools Tests
 *
 * Comprehensive tests for createCaseTool and createAppointmentTool.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCaseTool, createAppointmentTool, createTools } from '../create';
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
  allowedActionTypes: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'SEARCH'],
  allowedEntityTypes: ['LEAD', 'CONTACT', 'OPPORTUNITY', 'CASE', 'APPOINTMENT'],
  maxActionsPerSession: 100,
  actionCount: 0,
  ...overrides,
});

describe('Create Agent Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createCaseTool', () => {
    describe('metadata', () => {
      it('should have correct name', () => {
        expect(createCaseTool.name).toBe('create_case');
      });

      it('should have correct description', () => {
        expect(createCaseTool.description).toContain('Create a new legal case');
        expect(createCaseTool.description).toContain('approval');
      });

      it('should have correct actionType', () => {
        expect(createCaseTool.actionType).toBe('CREATE');
      });

      it('should have CASE in entityTypes', () => {
        expect(createCaseTool.entityTypes).toContain('CASE');
      });

      it('should require approval', () => {
        expect(createCaseTool.requiresApproval).toBe(true);
      });

      it('should have input schema', () => {
        expect(createCaseTool.inputSchema).toBeDefined();
      });
    });

    describe('execute', () => {
      it('should create a pending action for a valid case', async () => {
        const context = createMockContext();
        const input = {
          title: 'Test Case',
          description: 'Test description',
          priority: 'MEDIUM' as const,
          clientId: 'client-123',
        };

        const result = await createCaseTool.execute(input, context);

        expect(result.success).toBe(true);
        expect(result.requiresApproval).toBe(true);
        expect(result.actionId).toBeDefined();
        expect(result.executionTimeMs).toBeDefined();
      });

      it('should return error when CASE entity type not allowed', async () => {
        const context = createMockContext({
          allowedEntityTypes: ['LEAD', 'CONTACT'],
        });
        const input = {
          title: 'Test Case',
          priority: 'MEDIUM' as const,
          clientId: 'client-123',
        };

        const result = await createCaseTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Not authorized to create cases');
      });

      it('should return error when CREATE action not allowed', async () => {
        const context = createMockContext({
          allowedActionTypes: ['READ', 'SEARCH'],
        });
        const input = {
          title: 'Test Case',
          priority: 'MEDIUM' as const,
          clientId: 'client-123',
        };

        const result = await createCaseTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Not authorized to perform create actions');
      });

      it('should return error when max actions exceeded', async () => {
        const context = createMockContext({
          maxActionsPerSession: 10,
          actionCount: 10,
        });
        const input = {
          title: 'Test Case',
          priority: 'MEDIUM' as const,
          clientId: 'client-123',
        };

        const result = await createCaseTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Maximum actions per session exceeded');
      });

      it('should handle execution errors gracefully', async () => {
        const { pendingActionsStore } = await import('../../approval-workflow');
        vi.mocked(pendingActionsStore.add).mockRejectedValueOnce(new Error('Store failed'));

        const context = createMockContext();
        const input = {
          title: 'Test Case',
          priority: 'MEDIUM' as const,
          clientId: 'client-123',
        };

        const result = await createCaseTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Store failed');
      });

      it('should handle non-Error exceptions', async () => {
        const { pendingActionsStore } = await import('../../approval-workflow');
        vi.mocked(pendingActionsStore.add).mockRejectedValueOnce('String error');

        const context = createMockContext();
        const input = {
          title: 'Test Case',
          priority: 'MEDIUM' as const,
          clientId: 'client-123',
        };

        const result = await createCaseTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unknown error');
      });

      it('should include assignedTo when provided', async () => {
        const context = createMockContext();
        const input = {
          title: 'Test Case',
          priority: 'HIGH' as const,
          clientId: 'client-123',
          assignedTo: 'assignee-456',
        };

        const result = await createCaseTool.execute(input, context);

        expect(result.success).toBe(true);
        expect(result.requiresApproval).toBe(true);
      });
    });

    describe('generatePreview', () => {
      it('should generate preview with basic case info', async () => {
        const context = createMockContext();
        const input = {
          title: 'Test Case',
          description: 'Test description',
          priority: 'MEDIUM' as const,
          clientId: 'client-123',
        };

        const preview = await createCaseTool.generatePreview(input, context);

        expect(preview.summary).toContain('Test Case');
        expect(preview.summary).toContain('client-123');
        expect(preview.changes).toHaveLength(5);
        expect(preview.affectedEntities).toHaveLength(1);
        expect(preview.affectedEntities[0].type).toBe('CASE');
        expect(preview.affectedEntities[0].action).toBe('CREATE');
      });

      it('should add warning for URGENT priority', async () => {
        const context = createMockContext();
        const input = {
          title: 'Urgent Case',
          priority: 'URGENT' as const,
          clientId: 'client-123',
        };

        const preview = await createCaseTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings).toContain(
          'This case is marked as URGENT and will require immediate attention'
        );
        expect(preview.estimatedImpact).toBe('HIGH');
      });

      it('should add warning for HIGH priority', async () => {
        const context = createMockContext();
        const input = {
          title: 'High Priority Case',
          priority: 'HIGH' as const,
          clientId: 'client-123',
        };

        const preview = await createCaseTool.generatePreview(input, context);

        expect(preview.estimatedImpact).toBe('HIGH');
      });

      it('should add warning for past deadline', async () => {
        const context = createMockContext();
        const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const input = {
          title: 'Test Case',
          priority: 'MEDIUM' as const,
          clientId: 'client-123',
          deadline: pastDate,
        };

        const preview = await createCaseTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings).toContain('Warning: Deadline is in the past');
      });

      it('should add warning for deadline within 24 hours', async () => {
        const context = createMockContext();
        const soonDeadline = new Date(Date.now() + 12 * 60 * 60 * 1000);
        const input = {
          title: 'Test Case',
          priority: 'MEDIUM' as const,
          clientId: 'client-123',
          deadline: soonDeadline,
        };

        const preview = await createCaseTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings).toContain('Warning: Deadline is less than 24 hours away');
      });

      it('should include deadline in changes when provided', async () => {
        const context = createMockContext();
        const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const input = {
          title: 'Test Case',
          priority: 'MEDIUM' as const,
          clientId: 'client-123',
          deadline,
        };

        const preview = await createCaseTool.generatePreview(input, context);

        const deadlineChange = preview.changes.find((c) => c.field === 'deadline');
        expect(deadlineChange).toBeDefined();
        expect(deadlineChange?.newValue).toBe(deadline.toISOString());
      });

      it('should use context userId when assignedTo not provided', async () => {
        const context = createMockContext({ userId: 'my-user-id' });
        const input = {
          title: 'Test Case',
          priority: 'MEDIUM' as const,
          clientId: 'client-123',
        };

        const preview = await createCaseTool.generatePreview(input, context);

        const assignedToChange = preview.changes.find((c) => c.field === 'assignedTo');
        expect(assignedToChange?.newValue).toBe('my-user-id');
      });

      it('should have no warnings for normal case', async () => {
        const context = createMockContext();
        const farDeadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const input = {
          title: 'Normal Case',
          priority: 'LOW' as const,
          clientId: 'client-123',
          deadline: farDeadline,
        };

        const preview = await createCaseTool.generatePreview(input, context);

        expect(preview.warnings).toBeUndefined();
        expect(preview.estimatedImpact).toBe('MEDIUM');
      });
    });

    describe('rollback', () => {
      it('should successfully rollback a created case', async () => {
        const context = createMockContext();
        const executionResult = {
          id: 'case-123',
          title: 'Test Case',
          status: 'OPEN',
          priority: 'MEDIUM',
          clientId: 'client-123',
          assignedTo: 'user-123',
          createdAt: new Date(),
        };

        const result = await createCaseTool.rollback('action-123', executionResult, context);

        expect(result.success).toBe(true);
        expect(result.actionId).toBe('action-123');
        expect(result.rolledBackAt).toBeInstanceOf(Date);
        expect(result.restoredState).toEqual({ deletedCaseId: 'case-123' });
      });

      it('should handle rollback errors', async () => {
        const { agentLogger } = await import('../../logger');
        vi.mocked(agentLogger.log).mockRejectedValueOnce(new Error('Logging failed'));

        const context = createMockContext();
        const executionResult = {
          id: 'case-123',
          title: 'Test Case',
          status: 'OPEN',
          priority: 'MEDIUM',
          clientId: 'client-123',
          assignedTo: 'user-123',
          createdAt: new Date(),
        };

        const result = await createCaseTool.rollback('action-123', executionResult, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Logging failed');
      });

      it('should handle non-Error exceptions in rollback', async () => {
        const { agentLogger } = await import('../../logger');
        vi.mocked(agentLogger.log).mockRejectedValueOnce('String error');

        const context = createMockContext();
        const executionResult = {
          id: 'case-123',
          title: 'Test Case',
          status: 'OPEN',
          priority: 'MEDIUM',
          clientId: 'client-123',
          assignedTo: 'user-123',
          createdAt: new Date(),
        };

        const result = await createCaseTool.rollback('action-123', executionResult, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Rollback failed');
      });
    });
  });

  describe('createAppointmentTool', () => {
    describe('metadata', () => {
      it('should have correct name', () => {
        expect(createAppointmentTool.name).toBe('create_appointment');
      });

      it('should have correct description', () => {
        expect(createAppointmentTool.description).toContain('Create a new appointment');
        expect(createAppointmentTool.description).toContain('approval');
      });

      it('should have correct actionType', () => {
        expect(createAppointmentTool.actionType).toBe('CREATE');
      });

      it('should have APPOINTMENT in entityTypes', () => {
        expect(createAppointmentTool.entityTypes).toContain('APPOINTMENT');
      });

      it('should require approval', () => {
        expect(createAppointmentTool.requiresApproval).toBe(true);
      });

      it('should have input schema', () => {
        expect(createAppointmentTool.inputSchema).toBeDefined();
      });
    });

    describe('execute', () => {
      const getValidInput = () => ({
        title: 'Test Meeting',
        appointmentType: 'MEETING' as const,
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() + 25 * 60 * 60 * 1000),
        attendeeIds: ['attendee-1'],
        linkedCaseIds: [],
      });

      it('should create a pending action for a valid appointment', async () => {
        const context = createMockContext();
        const input = getValidInput();

        const result = await createAppointmentTool.execute(input, context);

        expect(result.success).toBe(true);
        expect(result.requiresApproval).toBe(true);
        expect(result.actionId).toBeDefined();
        expect(result.executionTimeMs).toBeDefined();
      });

      it('should return error when APPOINTMENT entity type not allowed', async () => {
        const context = createMockContext({
          allowedEntityTypes: ['LEAD', 'CONTACT'],
        });
        const input = getValidInput();

        const result = await createAppointmentTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Not authorized to create appointments');
      });

      it('should return error when CREATE action not allowed', async () => {
        const context = createMockContext({
          allowedActionTypes: ['READ', 'SEARCH'],
        });
        const input = getValidInput();

        const result = await createAppointmentTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Not authorized to perform create actions');
      });

      it('should return error when start time is after end time', async () => {
        const context = createMockContext();
        const input = {
          ...getValidInput(),
          startTime: new Date(Date.now() + 25 * 60 * 60 * 1000),
          endTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        };

        const result = await createAppointmentTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Start time must be before end time');
      });

      it('should return error when start time equals end time', async () => {
        const context = createMockContext();
        const sameTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const input = {
          ...getValidInput(),
          startTime: sameTime,
          endTime: sameTime,
        };

        const result = await createAppointmentTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Start time must be before end time');
      });

      it('should return error when max actions exceeded', async () => {
        const context = createMockContext({
          maxActionsPerSession: 5,
          actionCount: 5,
        });
        const input = getValidInput();

        const result = await createAppointmentTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Maximum actions per session exceeded');
      });

      it('should handle execution errors gracefully', async () => {
        const { pendingActionsStore } = await import('../../approval-workflow');
        vi.mocked(pendingActionsStore.add).mockRejectedValueOnce(new Error('Store error'));

        const context = createMockContext();
        const input = getValidInput();

        const result = await createAppointmentTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Store error');
      });

      it('should handle non-Error exceptions', async () => {
        const { pendingActionsStore } = await import('../../approval-workflow');
        vi.mocked(pendingActionsStore.add).mockRejectedValueOnce(null);

        const context = createMockContext();
        const input = getValidInput();

        const result = await createAppointmentTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unknown error');
      });
    });

    describe('generatePreview', () => {
      it('should generate preview with basic appointment info', async () => {
        const context = createMockContext();
        const startTime = new Date('2026-02-01T10:00:00Z');
        const endTime = new Date('2026-02-01T11:00:00Z');
        const input = {
          title: 'Team Meeting',
          appointmentType: 'MEETING' as const,
          startTime,
          endTime,
          attendeeIds: ['attendee-1'],
          linkedCaseIds: [],
        };

        const preview = await createAppointmentTool.generatePreview(input, context);

        expect(preview.summary).toContain('Team Meeting');
        expect(preview.summary).toContain('MEETING');
        expect(preview.affectedEntities).toHaveLength(1);
        expect(preview.affectedEntities[0].type).toBe('APPOINTMENT');
        expect(preview.affectedEntities[0].action).toBe('CREATE');
      });

      it('should add warning for very long appointments', async () => {
        const context = createMockContext();
        const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const endTime = new Date(startTime.getTime() + 4 * 60 * 60 * 1000); // 4 hours
        const input = {
          title: 'Long Meeting',
          appointmentType: 'MEETING' as const,
          startTime,
          endTime,
          attendeeIds: [],
          linkedCaseIds: [],
        };

        const preview = await createAppointmentTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('long appointment'))).toBe(true);
      });

      it('should add warning for past appointment', async () => {
        const context = createMockContext();
        const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const endTime = new Date(Date.now() - 23 * 60 * 60 * 1000);
        const input = {
          title: 'Past Meeting',
          appointmentType: 'MEETING' as const,
          startTime,
          endTime,
          attendeeIds: [],
          linkedCaseIds: [],
        };

        const preview = await createAppointmentTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings).toContain('Warning: Appointment start time is in the past');
      });

      it('should add warning for early morning appointment', async () => {
        const context = createMockContext();
        const startTime = new Date('2026-02-03T06:00:00'); // 6am on a weekday
        const endTime = new Date('2026-02-03T07:00:00');
        const input = {
          title: 'Early Meeting',
          appointmentType: 'MEETING' as const,
          startTime,
          endTime,
          attendeeIds: [],
          linkedCaseIds: [],
        };

        const preview = await createAppointmentTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('outside typical business hours'))).toBe(
          true
        );
      });

      it('should add warning for late evening appointment', async () => {
        const context = createMockContext();
        const startTime = new Date('2026-02-03T18:00:00'); // 6pm
        const endTime = new Date('2026-02-03T20:00:00'); // 8pm
        const input = {
          title: 'Late Meeting',
          appointmentType: 'MEETING' as const,
          startTime,
          endTime,
          attendeeIds: [],
          linkedCaseIds: [],
        };

        const preview = await createAppointmentTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('outside typical business hours'))).toBe(
          true
        );
      });

      it('should add warning for Saturday appointment', async () => {
        const context = createMockContext();
        // Find next Saturday
        const startTime = new Date('2026-02-07T10:00:00'); // A Saturday
        const endTime = new Date('2026-02-07T11:00:00');
        const input = {
          title: 'Weekend Meeting',
          appointmentType: 'MEETING' as const,
          startTime,
          endTime,
          attendeeIds: [],
          linkedCaseIds: [],
        };

        const preview = await createAppointmentTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('weekend'))).toBe(true);
      });

      it('should add warning for Sunday appointment', async () => {
        const context = createMockContext();
        const startTime = new Date('2026-02-08T10:00:00'); // A Sunday
        const endTime = new Date('2026-02-08T11:00:00');
        const input = {
          title: 'Sunday Meeting',
          appointmentType: 'MEETING' as const,
          startTime,
          endTime,
          attendeeIds: [],
          linkedCaseIds: [],
        };

        const preview = await createAppointmentTool.generatePreview(input, context);

        expect(preview.warnings).toBeDefined();
        expect(preview.warnings?.some((w) => w.includes('weekend'))).toBe(true);
      });

      it('should include location in changes when provided', async () => {
        const context = createMockContext();
        const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
        const input = {
          title: 'Office Meeting',
          appointmentType: 'MEETING' as const,
          startTime,
          endTime,
          location: 'Conference Room A',
          attendeeIds: [],
          linkedCaseIds: [],
        };

        const preview = await createAppointmentTool.generatePreview(input, context);

        const locationChange = preview.changes.find((c) => c.field === 'location');
        expect(locationChange).toBeDefined();
        expect(locationChange?.newValue).toBe('Conference Room A');
      });

      it('should include description in changes when provided', async () => {
        const context = createMockContext();
        const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
        const input = {
          title: 'Planning Meeting',
          appointmentType: 'MEETING' as const,
          startTime,
          endTime,
          description: 'Quarterly planning session',
          attendeeIds: [],
          linkedCaseIds: [],
        };

        const preview = await createAppointmentTool.generatePreview(input, context);

        const descriptionChange = preview.changes.find((c) => c.field === 'description');
        expect(descriptionChange).toBeDefined();
        expect(descriptionChange?.newValue).toBe('Quarterly planning session');
      });

      it('should include linked cases in affected entities', async () => {
        const context = createMockContext();
        const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
        const input = {
          title: 'Case Review',
          appointmentType: 'MEETING' as const,
          startTime,
          endTime,
          attendeeIds: [],
          linkedCaseIds: ['case-1', 'case-2'],
        };

        const preview = await createAppointmentTool.generatePreview(input, context);

        expect(preview.affectedEntities).toHaveLength(3);
        const caseEntities = preview.affectedEntities.filter((e) => e.type === 'CASE');
        expect(caseEntities).toHaveLength(2);
        expect(caseEntities[0].action).toBe('UPDATE');
        expect(caseEntities[1].action).toBe('UPDATE');
      });

      it('should set HIGH impact for HEARING type', async () => {
        const context = createMockContext();
        const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
        const input = {
          title: 'Court Hearing',
          appointmentType: 'HEARING' as const,
          startTime,
          endTime,
          attendeeIds: [],
          linkedCaseIds: [],
        };

        const preview = await createAppointmentTool.generatePreview(input, context);

        expect(preview.estimatedImpact).toBe('HIGH');
      });

      it('should set HIGH impact for DEPOSITION type', async () => {
        const context = createMockContext();
        const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
        const input = {
          title: 'Deposition',
          appointmentType: 'DEPOSITION' as const,
          startTime,
          endTime,
          attendeeIds: [],
          linkedCaseIds: [],
        };

        const preview = await createAppointmentTool.generatePreview(input, context);

        expect(preview.estimatedImpact).toBe('HIGH');
      });

      it('should set MEDIUM impact for regular meeting', async () => {
        const context = createMockContext();
        const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
        const input = {
          title: 'Team Sync',
          appointmentType: 'MEETING' as const,
          startTime,
          endTime,
          attendeeIds: [],
          linkedCaseIds: [],
        };

        const preview = await createAppointmentTool.generatePreview(input, context);

        expect(preview.estimatedImpact).toBe('MEDIUM');
      });

      it('should include context userId in attendees', async () => {
        const context = createMockContext({ userId: 'organizer-123' });
        const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
        const input = {
          title: 'Team Meeting',
          appointmentType: 'MEETING' as const,
          startTime,
          endTime,
          attendeeIds: ['attendee-1', 'attendee-2'],
          linkedCaseIds: [],
        };

        const preview = await createAppointmentTool.generatePreview(input, context);

        const attendeesChange = preview.changes.find((c) => c.field === 'attendees');
        expect(attendeesChange?.newValue).toContain('organizer-123');
        expect(attendeesChange?.newValue).toContain('attendee-1');
        expect(attendeesChange?.newValue).toContain('attendee-2');
      });

      it('should have no warnings for normal business hours appointment', async () => {
        const context = createMockContext();
        // Use a specific date that's a weekday
        const startTime = new Date('2026-02-02T10:00:00'); // Monday
        const endTime = new Date('2026-02-02T11:00:00');
        const input = {
          title: 'Normal Meeting',
          appointmentType: 'MEETING' as const,
          startTime,
          endTime,
          attendeeIds: [],
          linkedCaseIds: [],
        };

        const preview = await createAppointmentTool.generatePreview(input, context);

        // Should have no warnings (or undefined)
        expect(preview.warnings?.length ?? 0).toBe(0);
      });
    });

    describe('rollback', () => {
      it('should successfully rollback a created appointment', async () => {
        const context = createMockContext();
        const executionResult = {
          id: 'appointment-123',
          title: 'Test Meeting',
          startTime: new Date(),
          endTime: new Date(Date.now() + 60 * 60 * 1000),
          appointmentType: 'MEETING',
          organizerId: 'user-123',
          attendeeIds: ['attendee-1'],
          createdAt: new Date(),
        };

        const result = await createAppointmentTool.rollback(
          'action-123',
          executionResult,
          context
        );

        expect(result.success).toBe(true);
        expect(result.actionId).toBe('action-123');
        expect(result.rolledBackAt).toBeInstanceOf(Date);
        expect(result.restoredState).toEqual({ cancelledAppointmentId: 'appointment-123' });
      });

      it('should handle rollback errors', async () => {
        const { agentLogger } = await import('../../logger');
        vi.mocked(agentLogger.log).mockRejectedValueOnce(new Error('Log error'));

        const context = createMockContext();
        const executionResult = {
          id: 'appointment-123',
          title: 'Test Meeting',
          startTime: new Date(),
          endTime: new Date(Date.now() + 60 * 60 * 1000),
          appointmentType: 'MEETING',
          organizerId: 'user-123',
          attendeeIds: [],
          createdAt: new Date(),
        };

        const result = await createAppointmentTool.rollback(
          'action-123',
          executionResult,
          context
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Log error');
      });

      it('should handle non-Error exceptions in rollback', async () => {
        const { agentLogger } = await import('../../logger');
        vi.mocked(agentLogger.log).mockRejectedValueOnce({ custom: 'error' });

        const context = createMockContext();
        const executionResult = {
          id: 'appointment-123',
          title: 'Test Meeting',
          startTime: new Date(),
          endTime: new Date(Date.now() + 60 * 60 * 1000),
          appointmentType: 'MEETING',
          organizerId: 'user-123',
          attendeeIds: [],
          createdAt: new Date(),
        };

        const result = await createAppointmentTool.rollback(
          'action-123',
          executionResult,
          context
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Rollback failed');
      });
    });
  });

  describe('createTools export', () => {
    it('should export createCaseTool', () => {
      expect(createTools.createCaseTool).toBe(createCaseTool);
    });

    it('should export createAppointmentTool', () => {
      expect(createTools.createAppointmentTool).toBe(createAppointmentTool);
    });

    it('should have exactly 2 tools', () => {
      expect(Object.keys(createTools)).toHaveLength(2);
    });
  });
});
