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

import { randomUUID } from 'crypto';
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
      // Validate authorization
      if (!context.allowedEntityTypes.includes('CASE')) {
        return {
          success: false,
          error: 'Not authorized to update cases',
          requiresApproval: true,
          executionTimeMs: performance.now() - startTime,
        };
      }

      if (!context.allowedActionTypes.includes('UPDATE')) {
        return {
          success: false,
          error: 'Not authorized to perform update actions',
          requiresApproval: true,
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Check action limit
      if (context.actionCount >= context.maxActionsPerSession) {
        return {
          success: false,
          error: 'Maximum actions per session exceeded',
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
        input: input as unknown as Record<string, unknown>,
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
    const warnings: string[] = [];
    const changes = [];

    // Note: In a real implementation, we would fetch the current case state
    // to show actual before/after diffs. For now, we show the intended changes.

    if (input.title !== undefined) {
      changes.push({
        field: 'title',
        previousValue: '(current value)',
        newValue: input.title,
        changeType: 'MODIFY' as const,
      });
    }

    if (input.description !== undefined) {
      changes.push({
        field: 'description',
        previousValue: '(current value)',
        newValue: input.description,
        changeType: 'MODIFY' as const,
      });
    }

    if (input.priority !== undefined) {
      changes.push({
        field: 'priority',
        previousValue: '(current value)',
        newValue: input.priority,
        changeType: 'MODIFY' as const,
      });

      if (input.priority === 'URGENT') {
        warnings.push('Changing priority to URGENT will trigger immediate attention notifications');
      }
    }

    if (input.status !== undefined) {
      changes.push({
        field: 'status',
        previousValue: '(current value)',
        newValue: input.status,
        changeType: 'MODIFY' as const,
      });

      if (input.status === 'CLOSED') {
        warnings.push('Closing this case is a significant action that may affect related entities');
      }

      if (input.status === 'CANCELLED') {
        warnings.push('Cancelling this case is irreversible in most workflows');
      }
    }

    if (input.deadline !== undefined) {
      changes.push({
        field: 'deadline',
        previousValue: '(current value)',
        newValue: input.deadline.toISOString(),
        changeType: 'MODIFY' as const,
      });

      // Check if new deadline is in the past
      if (input.deadline < new Date()) {
        warnings.push('Warning: New deadline is in the past');
      }

      // Check if new deadline is very soon
      const hoursUntil = (input.deadline.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntil > 0 && hoursUntil < 24) {
        warnings.push('Warning: New deadline is less than 24 hours away');
      }
    }

    if (input.assignedTo !== undefined) {
      changes.push({
        field: 'assignedTo',
        previousValue: '(current value)',
        newValue: input.assignedTo,
        changeType: 'MODIFY' as const,
      });
      warnings.push('Reassigning the case will notify the new assignee');
    }

    // Determine impact level
    let estimatedImpact: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (input.status === 'CLOSED' || input.status === 'CANCELLED') {
      estimatedImpact = 'HIGH';
    } else if (input.priority === 'URGENT' || input.priority === 'HIGH') {
      estimatedImpact = 'HIGH';
    } else if (input.assignedTo !== undefined || input.deadline !== undefined) {
      estimatedImpact = 'MEDIUM';
    }

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
      // Validate authorization
      if (!context.allowedEntityTypes.includes('APPOINTMENT')) {
        return {
          success: false,
          error: 'Not authorized to update appointments',
          requiresApproval: true,
          executionTimeMs: performance.now() - startTime,
        };
      }

      if (!context.allowedActionTypes.includes('UPDATE')) {
        return {
          success: false,
          error: 'Not authorized to perform update actions',
          requiresApproval: true,
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Validate time range if both times provided
      if (input.startTime && input.endTime && input.startTime >= input.endTime) {
        return {
          success: false,
          error: 'Start time must be before end time',
          requiresApproval: true,
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Check action limit
      if (context.actionCount >= context.maxActionsPerSession) {
        return {
          success: false,
          error: 'Maximum actions per session exceeded',
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
        input: input as unknown as Record<string, unknown>,
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
    const warnings: string[] = [];
    const changes = [];

    if (input.title !== undefined) {
      changes.push({
        field: 'title',
        previousValue: '(current value)',
        newValue: input.title,
        changeType: 'MODIFY' as const,
      });
    }

    if (input.description !== undefined) {
      changes.push({
        field: 'description',
        previousValue: '(current value)',
        newValue: input.description,
        changeType: 'MODIFY' as const,
      });
    }

    if (input.startTime !== undefined) {
      changes.push({
        field: 'startTime',
        previousValue: '(current value)',
        newValue: input.startTime.toISOString(),
        changeType: 'MODIFY' as const,
      });

      // Check if new time is in the past
      if (input.startTime < new Date()) {
        warnings.push('Warning: New start time is in the past');
      }

      // Check for outside business hours
      const hour = input.startTime.getHours();
      if (hour < 8 || hour > 19) {
        warnings.push('New time is outside typical business hours (8am-7pm)');
      }

      // Check for weekend
      const day = input.startTime.getDay();
      if (day === 0 || day === 6) {
        warnings.push('New appointment time is on a weekend');
      }

      warnings.push('Rescheduling will notify all attendees of the time change');
    }

    if (input.endTime !== undefined) {
      changes.push({
        field: 'endTime',
        previousValue: '(current value)',
        newValue: input.endTime.toISOString(),
        changeType: 'MODIFY' as const,
      });
    }

    if (input.location !== undefined) {
      changes.push({
        field: 'location',
        previousValue: '(current value)',
        newValue: input.location,
        changeType: 'MODIFY' as const,
      });
      warnings.push('Location change will notify all attendees');
    }

    if (input.appointmentType !== undefined) {
      changes.push({
        field: 'appointmentType',
        previousValue: '(current value)',
        newValue: input.appointmentType,
        changeType: 'MODIFY' as const,
      });
    }

    if (input.notes !== undefined) {
      changes.push({
        field: 'notes',
        previousValue: '(current value)',
        newValue: input.notes,
        changeType: 'MODIFY' as const,
      });
    }

    // Determine impact level
    let estimatedImpact: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (input.startTime !== undefined || input.endTime !== undefined) {
      estimatedImpact = 'HIGH'; // Rescheduling affects all attendees
    } else if (input.location !== undefined) {
      estimatedImpact = 'MEDIUM';
    }

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
