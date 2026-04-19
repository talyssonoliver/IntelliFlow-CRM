/**
 * Update Agent Tools
 *
 * IFC-139: Agent tools for updating cases and appointments
 *
 * These tools allow AI agents to update existing entities in the CRM.
 * All update operations require human approval before execution.
 *
 * Following hexagonal architecture, these tools call application services (use cases)
 * rather than repositories directly.
 */

import { randomUUID } from 'node:crypto';
import {
  AgentToolDefinition,
  AgentToolResult,
  AgentAuthContext,
  ActionPreview,
  PendingAction,
  RollbackResult,
  UpdateCaseInput,
  UpdateCaseInputSchema,
  UpdateAppointmentInput,
  UpdateAppointmentInputSchema,
} from '../types';
import { agentLogger } from '../logger';
import { pendingActionsStore, rollbackStore } from '../approval-workflow';

/**
 * Approval expiry time (30 minutes)
 */
const APPROVAL_EXPIRY_MS = 30 * 60 * 1000;

// ── Preview-building helpers (reduce cognitive complexity in generatePreview) ──

type ChangeEntry = {
  field: string;
  previousValue: string;
  newValue: string;
  changeType: 'MODIFY';
};

function makeChange(field: string, newValue: string): ChangeEntry {
  return { field, previousValue: '(current value)', newValue, changeType: 'MODIFY' };
}

/**
 * Build case change list and warnings from UpdateCaseInput fields.
 */
function applyCasePriorityChange(
  priority: string,
  changes: ChangeEntry[],
  warnings: string[]
): void {
  changes.push(makeChange('priority', priority));
  if (priority === 'URGENT') {
    warnings.push('Changing priority to URGENT will trigger immediate attention notifications');
  }
}

function applyCaseStatusChange(status: string, changes: ChangeEntry[], warnings: string[]): void {
  changes.push(makeChange('status', status));
  if (status === 'CLOSED') {
    warnings.push('Closing this case is a significant action that may affect related entities');
  }
  if (status === 'CANCELLED') {
    warnings.push('Cancelling this case is irreversible in most workflows');
  }
}

function applyCaseDeadlineChange(deadline: Date, changes: ChangeEntry[], warnings: string[]): void {
  changes.push(makeChange('deadline', deadline.toISOString()));
  if (deadline < new Date()) {
    warnings.push('Warning: New deadline is in the past');
  }
  const hoursUntil = (deadline.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursUntil > 0 && hoursUntil < 24) {
    warnings.push('Warning: New deadline is less than 24 hours away');
  }
}

function buildCasePreviewParts(input: UpdateCaseInput): {
  changes: ChangeEntry[];
  warnings: string[];
} {
  const changes: ChangeEntry[] = [];
  const warnings: string[] = [];

  if (input.title !== undefined) changes.push(makeChange('title', input.title));
  if (input.description !== undefined) changes.push(makeChange('description', input.description));
  if (input.priority !== undefined) applyCasePriorityChange(input.priority, changes, warnings);
  if (input.status !== undefined) applyCaseStatusChange(input.status, changes, warnings);
  if (input.deadline !== undefined) applyCaseDeadlineChange(input.deadline, changes, warnings);

  if (input.assignedTo !== undefined) {
    changes.push(makeChange('assignedTo', input.assignedTo));
    warnings.push('Reassigning the case will notify the new assignee');
  }

  return { changes, warnings };
}

/**
 * Compute estimated impact for a case update.
 */
function computeCaseImpact(input: UpdateCaseInput): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (input.status === 'CLOSED' || input.status === 'CANCELLED') return 'HIGH';
  if (input.priority === 'URGENT' || input.priority === 'HIGH') return 'HIGH';
  if (input.assignedTo !== undefined || input.deadline !== undefined) return 'MEDIUM';
  return 'LOW';
}

/**
 * Build appointment change list and warnings from UpdateAppointmentInput fields.
 */
function applyAppointmentStartTimeChange(
  startTime: Date,
  changes: ChangeEntry[],
  warnings: string[]
): void {
  changes.push(makeChange('startTime', startTime.toISOString()));
  if (startTime < new Date()) warnings.push('Warning: New start time is in the past');
  const hour = startTime.getUTCHours();
  if (hour < 8 || hour > 19) warnings.push('New time is outside typical business hours (8am-7pm)');
  const day = startTime.getUTCDay();
  if (day === 0 || day === 6) warnings.push('New appointment time is on a weekend');
  warnings.push('Rescheduling will notify all attendees of the time change');
}

function buildAppointmentPreviewParts(input: UpdateAppointmentInput): {
  changes: ChangeEntry[];
  warnings: string[];
} {
  const changes: ChangeEntry[] = [];
  const warnings: string[] = [];

  if (input.title !== undefined) changes.push(makeChange('title', input.title));
  if (input.description !== undefined) changes.push(makeChange('description', input.description));
  if (input.startTime !== undefined) {
    applyAppointmentStartTimeChange(input.startTime, changes, warnings);
  }
  if (input.endTime !== undefined) changes.push(makeChange('endTime', input.endTime.toISOString()));

  if (input.location !== undefined) {
    changes.push(makeChange('location', input.location));
    warnings.push('Location change will notify all attendees');
  }

  if (input.appointmentType !== undefined) {
    changes.push(makeChange('appointmentType', input.appointmentType));
  }

  if (input.notes !== undefined) changes.push(makeChange('notes', input.notes));

  return { changes, warnings };
}

/**
 * Compute estimated impact for an appointment update.
 */
function computeAppointmentImpact(input: UpdateAppointmentInput): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (input.startTime !== undefined || input.endTime !== undefined) return 'HIGH';
  if (input.location !== undefined) return 'MEDIUM';
  return 'LOW';
}

/**
 * Updated case result structure
 */
export interface UpdatedCaseResult {
  id: string;
  title: string;
  status: string;
  priority: string;
  previousState: {
    title?: string;
    status?: string;
    priority?: string;
    description?: string;
    deadline?: Date;
    assignedTo?: string;
  };
  updatedAt: Date;
}

/**
 * Updated appointment result structure
 */
export interface UpdatedAppointmentResult {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  previousState: {
    title?: string;
    startTime?: Date;
    endTime?: Date;
    description?: string;
    location?: string;
    appointmentType?: string;
  };
  updatedAt: Date;
}

/**
 * Validate authorization guards for update tools.
 * Returns an error message if a guard fails, or null if all pass.
 */
function validateUpdateGuards(
  entityType: 'CASE' | 'APPOINTMENT',
  context: AgentAuthContext,
  extraCheck?: string | null
): string | null {
  if (!context.allowedEntityTypes.includes(entityType)) {
    return `Not authorized to update ${entityType.toLowerCase()}s`;
  }
  if (!context.allowedActionTypes.includes('UPDATE')) {
    return 'Not authorized to perform update actions';
  }
  if (extraCheck) return extraCheck;
  if (context.actionCount >= context.maxActionsPerSession) {
    return 'Maximum actions per session exceeded';
  }
  return null;
}

/**
 * Update Case Tool
 *
 * Updates an existing legal case in the system.
 * This operation REQUIRES human approval before execution.
 * Stores previous state for rollback capability.
 */
export const updateCaseTool: AgentToolDefinition<UpdateCaseInput, UpdatedCaseResult> = {
  name: 'update_case',
  description: 'Update an existing legal case. Requires human approval before execution.',
  actionType: 'UPDATE',
  entityTypes: ['CASE'],
  requiresApproval: true,
  inputSchema: UpdateCaseInputSchema,

  async execute(
    input: UpdateCaseInput,
    context: AgentAuthContext
  ): Promise<AgentToolResult<UpdatedCaseResult>> {
    const startTime = performance.now();

    try {
      const guardError = validateUpdateGuards('CASE', context);
      if (guardError) {
        return {
          success: false,
          error: guardError,
          requiresApproval: true,
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Generate preview and create pending action
      const preview = await this.generatePreview(input, context);
      const actionId = randomUUID();
      const now = new Date();

      const pendingAction: PendingAction = {
        id: actionId,
        toolName: 'update_case',
        actionType: 'UPDATE',
        entityType: 'CASE',
        input: { ...input },
        preview,
        status: 'PENDING',
        createdAt: now,
        expiresAt: new Date(now.getTime() + APPROVAL_EXPIRY_MS),
        createdBy: context.userId,
        agentSessionId: context.agentSessionId,
      };

      // Store pending action for approval
      await pendingActionsStore.add(pendingAction);

      // Log the pending action
      await agentLogger.log({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        toolName: 'update_case',
        actionType: 'UPDATE',
        entityType: 'CASE',
        input,
        success: true,
        durationMs: performance.now() - startTime,
        approvalRequired: true,
        approvalStatus: 'PENDING',
        metadata: { actionId, caseId: input.id },
      });

      return {
        success: true,
        requiresApproval: true,
        actionId,
        executionTimeMs: performance.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await agentLogger.log({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        toolName: 'update_case',
        actionType: 'UPDATE',
        entityType: 'CASE',
        input,
        success: false,
        error: errorMessage,
        durationMs: performance.now() - startTime,
        approvalRequired: true,
      });

      return {
        success: false,
        error: errorMessage,
        requiresApproval: true,
        executionTimeMs: performance.now() - startTime,
      };
    }
  },

  async generatePreview(
    input: UpdateCaseInput,
    _context: AgentAuthContext
  ): Promise<ActionPreview> {
    // Note: In a real implementation, we would fetch the current case state
    // to show actual before/after diffs. For now, we show the intended changes.
    const { changes, warnings } = buildCasePreviewParts(input);
    const estimatedImpact = computeCaseImpact(input);

    return {
      summary: `Update case ${input.id}: ${changes.map((c) => c.field).join(', ')}`,
      changes,
      affectedEntities: [
        {
          type: 'CASE',
          id: input.id,
          name: input.title || `Case ${input.id}`,
          action: 'UPDATE',
        },
      ],
      warnings: warnings.length > 0 ? warnings : undefined,
      estimatedImpact,
    };
  },

  async rollback(
    actionId: string,
    executionResult: UpdatedCaseResult,
    context: AgentAuthContext
  ): Promise<RollbackResult> {
    try {
      const previousState = executionResult.previousState;

      // Store rollback info
      await rollbackStore.add({
        actionId,
        entityType: 'CASE',
        entityId: executionResult.id,
        previousState,
        rolledBackBy: context.userId,
        rolledBackAt: new Date(),
      });

      await agentLogger.log({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        toolName: 'update_case',
        actionType: 'UPDATE',
        entityType: 'CASE',
        input: { caseId: executionResult.id, action: 'rollback', previousState },
        success: true,
        durationMs: 0,
        approvalRequired: false,
        metadata: { originalActionId: actionId },
      });

      return {
        success: true,
        actionId,
        rolledBackAt: new Date(),
        restoredState: previousState,
      };
    } catch (error) {
      return {
        success: false,
        actionId,
        error: error instanceof Error ? error.message : 'Rollback failed',
      };
    }
  },
};

/**
 * Update Appointment Tool
 *
 * Updates an existing appointment in the system.
 * This operation REQUIRES human approval before execution.
 * Stores previous state for rollback capability.
 */
export const updateAppointmentTool: AgentToolDefinition<
  UpdateAppointmentInput,
  UpdatedAppointmentResult
> = {
  name: 'update_appointment',
  description: 'Update an existing appointment. Requires human approval before execution.',
  actionType: 'UPDATE',
  entityTypes: ['APPOINTMENT'],
  requiresApproval: true,
  inputSchema: UpdateAppointmentInputSchema,

  async execute(
    input: UpdateAppointmentInput,
    context: AgentAuthContext
  ): Promise<AgentToolResult<UpdatedAppointmentResult>> {
    const startTime = performance.now();

    try {
      const timeRangeError =
        input.startTime && input.endTime && input.startTime >= input.endTime
          ? 'Start time must be before end time'
          : null;
      const guardError = validateUpdateGuards('APPOINTMENT', context, timeRangeError);
      if (guardError) {
        return {
          success: false,
          error: guardError,
          requiresApproval: true,
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Generate preview and create pending action
      const preview = await this.generatePreview(input, context);
      const actionId = randomUUID();
      const now = new Date();

      const pendingAction: PendingAction = {
        id: actionId,
        toolName: 'update_appointment',
        actionType: 'UPDATE',
        entityType: 'APPOINTMENT',
        input: { ...input },
        preview,
        status: 'PENDING',
        createdAt: now,
        expiresAt: new Date(now.getTime() + APPROVAL_EXPIRY_MS),
        createdBy: context.userId,
        agentSessionId: context.agentSessionId,
      };

      // Store pending action for approval
      await pendingActionsStore.add(pendingAction);

      // Log the pending action
      await agentLogger.log({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        toolName: 'update_appointment',
        actionType: 'UPDATE',
        entityType: 'APPOINTMENT',
        input,
        success: true,
        durationMs: performance.now() - startTime,
        approvalRequired: true,
        approvalStatus: 'PENDING',
        metadata: { actionId, appointmentId: input.id },
      });

      return {
        success: true,
        requiresApproval: true,
        actionId,
        executionTimeMs: performance.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await agentLogger.log({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        toolName: 'update_appointment',
        actionType: 'UPDATE',
        entityType: 'APPOINTMENT',
        input,
        success: false,
        error: errorMessage,
        durationMs: performance.now() - startTime,
        approvalRequired: true,
      });

      return {
        success: false,
        error: errorMessage,
        requiresApproval: true,
        executionTimeMs: performance.now() - startTime,
      };
    }
  },

  async generatePreview(
    input: UpdateAppointmentInput,
    _context: AgentAuthContext
  ): Promise<ActionPreview> {
    const { changes, warnings } = buildAppointmentPreviewParts(input);
    const estimatedImpact = computeAppointmentImpact(input);

    return {
      summary: `Update appointment ${input.id}: ${changes.map((c) => c.field).join(', ')}`,
      changes,
      affectedEntities: [
        {
          type: 'APPOINTMENT',
          id: input.id,
          name: input.title || `Appointment ${input.id}`,
          action: 'UPDATE',
        },
      ],
      warnings: warnings.length > 0 ? warnings : undefined,
      estimatedImpact,
    };
  },

  async rollback(
    actionId: string,
    executionResult: UpdatedAppointmentResult,
    context: AgentAuthContext
  ): Promise<RollbackResult> {
    try {
      const previousState = executionResult.previousState;

      // Store rollback info
      await rollbackStore.add({
        actionId,
        entityType: 'APPOINTMENT',
        entityId: executionResult.id,
        previousState,
        rolledBackBy: context.userId,
        rolledBackAt: new Date(),
      });

      await agentLogger.log({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        toolName: 'update_appointment',
        actionType: 'UPDATE',
        entityType: 'APPOINTMENT',
        input: { appointmentId: executionResult.id, action: 'rollback', previousState },
        success: true,
        durationMs: 0,
        approvalRequired: false,
        metadata: { originalActionId: actionId },
      });

      return {
        success: true,
        actionId,
        rolledBackAt: new Date(),
        restoredState: previousState,
      };
    } catch (error) {
      return {
        success: false,
        actionId,
        error: error instanceof Error ? error.message : 'Rollback failed',
      };
    }
  },
};

/**
 * Export all update tools
 */
export const updateTools = {
  updateCaseTool,
  updateAppointmentTool,
};
