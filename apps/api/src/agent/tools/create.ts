/**
 * Create Agent Tools
 *
 * IFC-139: Agent tools for creating cases and appointments
 *
 * These tools allow AI agents to create new entities in the CRM.
 * All create operations require human approval before execution.
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
  CreateCaseInput,
  CreateCaseInputSchema,
  CreateAppointmentInput,
  CreateAppointmentInputSchema,
} from '../types';
import { agentLogger } from '../logger';
import { pendingActionsStore } from '../approval-workflow';

/**
 * Approval expiry time (30 minutes)
 */
const APPROVAL_EXPIRY_MS = 30 * 60 * 1000;

/**
 * Created case result structure
 */
export interface CreatedCaseResult {
  id: string;
  title: string;
  status: string;
  priority: string;
  clientId: string;
  assignedTo: string;
  createdAt: Date;
}

/**
 * Created appointment result structure
 */
export interface CreatedAppointmentResult {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  appointmentType: string;
  organizerId: string;
  attendeeIds: string[];
  createdAt: Date;
}

/**
 * Create Case Tool
 *
 * Creates a new legal case in the system.
 * This operation REQUIRES human approval before execution.
 */
export const createCaseTool: AgentToolDefinition<CreateCaseInput, CreatedCaseResult> = {
  name: 'create_case',
  description: 'Create a new legal case. Requires human approval before execution.',
  actionType: 'CREATE',
  entityTypes: ['CASE'],
  requiresApproval: true,
  inputSchema: CreateCaseInputSchema,

  async execute(
    input: CreateCaseInput,
    context: AgentAuthContext
  ): Promise<AgentToolResult<CreatedCaseResult>> {
    const startTime = performance.now();

    try {
      // Validate authorization
      if (!context.allowedEntityTypes.includes('CASE')) {
        return {
          success: false,
          error: 'Not authorized to create cases',
          requiresApproval: true,
          executionTimeMs: performance.now() - startTime,
        };
      }

      if (!context.allowedActionTypes.includes('CREATE')) {
        return {
          success: false,
          error: 'Not authorized to perform create actions',
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
        toolName: 'create_case',
        actionType: 'CREATE',
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
        toolName: 'create_case',
        actionType: 'CREATE',
        entityType: 'CASE',
        input,
        success: true,
        durationMs: performance.now() - startTime,
        approvalRequired: true,
        approvalStatus: 'PENDING',
        metadata: { actionId },
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
        toolName: 'create_case',
        actionType: 'CREATE',
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
    input: CreateCaseInput,
    context: AgentAuthContext
  ): Promise<ActionPreview> {
    const warnings: string[] = [];

    // Check for urgent priority
    if (input.priority === 'URGENT') {
      warnings.push('This case is marked as URGENT and will require immediate attention');
    }

    // Check if deadline is in the past
    if (input.deadline && input.deadline < new Date()) {
      warnings.push('Warning: Deadline is in the past');
    }

    // Check if deadline is very soon (within 24 hours)
    if (input.deadline) {
      const hoursUntilDeadline = (input.deadline.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntilDeadline > 0 && hoursUntilDeadline < 24) {
        warnings.push('Warning: Deadline is less than 24 hours away');
      }
    }

    return {
      summary: `Create new case: "${input.title}" for client ${input.clientId}`,
      changes: [
        {
          field: 'title',
          previousValue: null,
          newValue: input.title,
          changeType: 'ADD',
        },
        {
          field: 'description',
          previousValue: null,
          newValue: input.description || '',
          changeType: 'ADD',
        },
        {
          field: 'priority',
          previousValue: null,
          newValue: input.priority,
          changeType: 'ADD',
        },
        {
          field: 'clientId',
          previousValue: null,
          newValue: input.clientId,
          changeType: 'ADD',
        },
        {
          field: 'assignedTo',
          previousValue: null,
          newValue: input.assignedTo || context.userId,
          changeType: 'ADD',
        },
        ...(input.deadline
          ? [
              {
                field: 'deadline',
                previousValue: null,
                newValue: input.deadline.toISOString(),
                changeType: 'ADD' as const,
              },
            ]
          : []),
      ],
      affectedEntities: [
        {
          type: 'CASE',
          id: 'NEW',
          name: input.title,
          action: 'CREATE',
        },
      ],
      warnings: warnings.length > 0 ? warnings : undefined,
      estimatedImpact: input.priority === 'URGENT' || input.priority === 'HIGH' ? 'HIGH' : 'MEDIUM',
    };
  },

  async rollback(
    actionId: string,
    executionResult: CreatedCaseResult,
    context: AgentAuthContext
  ): Promise<RollbackResult> {
    try {
      // In a real implementation, this would soft-delete or mark the case as cancelled
      // For now, we simulate the rollback

      await agentLogger.log({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        toolName: 'create_case',
        actionType: 'DELETE',
        entityType: 'CASE',
        input: { caseId: executionResult.id, action: 'rollback' },
        success: true,
        durationMs: 0,
        approvalRequired: false,
        metadata: { originalActionId: actionId },
      });

      return {
        success: true,
        actionId,
        rolledBackAt: new Date(),
        restoredState: { deletedCaseId: executionResult.id },
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
 * Create Appointment Tool
 *
 * Creates a new appointment in the system.
 * This operation REQUIRES human approval before execution.
 */
export const createAppointmentTool: AgentToolDefinition<
  CreateAppointmentInput,
  CreatedAppointmentResult
> = {
  name: 'create_appointment',
  description: 'Create a new appointment/meeting. Requires human approval before execution.',
  actionType: 'CREATE',
  entityTypes: ['APPOINTMENT'],
  requiresApproval: true,
  inputSchema: CreateAppointmentInputSchema,

  async execute(
    input: CreateAppointmentInput,
    context: AgentAuthContext
  ): Promise<AgentToolResult<CreatedAppointmentResult>> {
    const startTime = performance.now();

    try {
      // Validate authorization
      if (!context.allowedEntityTypes.includes('APPOINTMENT')) {
        return {
          success: false,
          error: 'Not authorized to create appointments',
          requiresApproval: true,
          executionTimeMs: performance.now() - startTime,
        };
      }

      if (!context.allowedActionTypes.includes('CREATE')) {
        return {
          success: false,
          error: 'Not authorized to perform create actions',
          requiresApproval: true,
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Validate time range
      if (input.startTime >= input.endTime) {
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
        toolName: 'create_appointment',
        actionType: 'CREATE',
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
        toolName: 'create_appointment',
        actionType: 'CREATE',
        entityType: 'APPOINTMENT',
        input,
        success: true,
        durationMs: performance.now() - startTime,
        approvalRequired: true,
        approvalStatus: 'PENDING',
        metadata: { actionId },
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
        toolName: 'create_appointment',
        actionType: 'CREATE',
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
    input: CreateAppointmentInput,
    context: AgentAuthContext
  ): Promise<ActionPreview> {
    const warnings: string[] = [];
    const durationMinutes = Math.round(
      (input.endTime.getTime() - input.startTime.getTime()) / (1000 * 60)
    );

    // Check for very long appointments
    if (durationMinutes > 180) {
      warnings.push(`This is a long appointment (${durationMinutes} minutes)`);
    }

    // Check if appointment is in the past
    if (input.startTime < new Date()) {
      warnings.push('Warning: Appointment start time is in the past');
    }

    // Check for appointments outside business hours (before 8am or after 7pm)
    const startHour = input.startTime.getHours();
    const endHour = input.endTime.getHours();
    if (startHour < 8 || endHour > 19) {
      warnings.push('This appointment is scheduled outside typical business hours (8am-7pm)');
    }

    // Check for weekend appointments
    const dayOfWeek = input.startTime.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      warnings.push('This appointment is scheduled on a weekend');
    }

    return {
      summary: `Create appointment: "${input.title}" (${input.appointmentType}) on ${input.startTime.toLocaleDateString()} at ${input.startTime.toLocaleTimeString()}`,
      changes: [
        {
          field: 'title',
          previousValue: null,
          newValue: input.title,
          changeType: 'ADD',
        },
        {
          field: 'appointmentType',
          previousValue: null,
          newValue: input.appointmentType,
          changeType: 'ADD',
        },
        {
          field: 'startTime',
          previousValue: null,
          newValue: input.startTime.toISOString(),
          changeType: 'ADD',
        },
        {
          field: 'endTime',
          previousValue: null,
          newValue: input.endTime.toISOString(),
          changeType: 'ADD',
        },
        {
          field: 'duration',
          previousValue: null,
          newValue: `${durationMinutes} minutes`,
          changeType: 'ADD',
        },
        ...(input.location
          ? [
              {
                field: 'location',
                previousValue: null,
                newValue: input.location,
                changeType: 'ADD' as const,
              },
            ]
          : []),
        ...(input.description
          ? [
              {
                field: 'description',
                previousValue: null,
                newValue: input.description,
                changeType: 'ADD' as const,
              },
            ]
          : []),
        {
          field: 'attendees',
          previousValue: null,
          newValue: [context.userId, ...input.attendeeIds],
          changeType: 'ADD',
        },
        ...(input.linkedCaseIds.length > 0
          ? [
              {
                field: 'linkedCases',
                previousValue: null,
                newValue: input.linkedCaseIds,
                changeType: 'ADD' as const,
              },
            ]
          : []),
      ],
      affectedEntities: [
        {
          type: 'APPOINTMENT',
          id: 'NEW',
          name: input.title,
          action: 'CREATE',
        },
        // Add linked cases as affected entities
        ...input.linkedCaseIds.map((caseId) => ({
          type: 'CASE' as const,
          id: caseId,
          name: `Case ${caseId}`,
          action: 'UPDATE' as const,
        })),
      ],
      warnings: warnings.length > 0 ? warnings : undefined,
      estimatedImpact:
        input.appointmentType === 'HEARING' || input.appointmentType === 'DEPOSITION'
          ? 'HIGH'
          : 'MEDIUM',
    };
  },

  async rollback(
    actionId: string,
    executionResult: CreatedAppointmentResult,
    context: AgentAuthContext
  ): Promise<RollbackResult> {
    try {
      // In a real implementation, this would cancel the appointment
      // For now, we simulate the rollback

      await agentLogger.log({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        toolName: 'create_appointment',
        actionType: 'DELETE',
        entityType: 'APPOINTMENT',
        input: { appointmentId: executionResult.id, action: 'rollback' },
        success: true,
        durationMs: 0,
        approvalRequired: false,
        metadata: { originalActionId: actionId },
      });

      return {
        success: true,
        actionId,
        rolledBackAt: new Date(),
        restoredState: { cancelledAppointmentId: executionResult.id },
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
 * Export all create tools
 */
export const createTools = {
  createCaseTool,
  createAppointmentTool,
};
