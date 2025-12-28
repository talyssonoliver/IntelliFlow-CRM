/**
 * Draft Message Agent Tool
 *
 * IFC-139: Agent tool for drafting messages (emails, SMS, notes)
 *
 * This tool allows AI agents to draft messages for leads, contacts, or accounts.
 * Draft operations require human approval before sending.
 *
 * Following hexagonal architecture, this tool prepares messages that will be
 * processed by the messaging service after approval.
 */

import { randomUUID } from 'crypto';
import {
  AgentToolDefinition,
  AgentToolResult,
  AgentAuthContext,
  ActionPreview,
  PendingAction,
  RollbackResult,
  DraftMessageInput,
  DraftMessageInputSchema,
} from '../types';
import { agentLogger } from '../logger';
import { pendingActionsStore } from '../approval-workflow';

/**
 * Approval expiry time (30 minutes)
 */
const APPROVAL_EXPIRY_MS = 30 * 60 * 1000;

/**
 * Drafted message result structure
 */
export interface DraftedMessageResult {
  id: string;
  type: 'EMAIL' | 'SMS' | 'NOTE';
  recipientType: 'LEAD' | 'CONTACT' | 'ACCOUNT';
  recipientId: string;
  subject?: string;
  body: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'SCHEDULED' | 'SENT';
  scheduledFor?: Date;
  createdAt: Date;
}

/**
 * Draft Message Tool
 *
 * Creates a draft message for a lead, contact, or account.
 * This operation REQUIRES human approval before the message is sent.
 * Messages can be reviewed, edited, and approved or rejected through the approval workflow.
 */
export const draftMessageTool: AgentToolDefinition<DraftMessageInput, DraftedMessageResult> = {
  name: 'draft_message',
  description:
    'Draft an email, SMS, or internal note for a lead, contact, or account. Requires human approval before sending.',
  actionType: 'DRAFT',
  entityTypes: ['MESSAGE', 'LEAD', 'CONTACT', 'ACCOUNT'],
  requiresApproval: true,
  inputSchema: DraftMessageInputSchema,

  async execute(
    input: DraftMessageInput,
    context: AgentAuthContext
  ): Promise<AgentToolResult<DraftedMessageResult>> {
    const startTime = performance.now();

    try {
      // Validate authorization for message drafting
      if (!context.allowedActionTypes.includes('DRAFT')) {
        return {
          success: false,
          error: 'Not authorized to draft messages',
          requiresApproval: true,
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Validate authorization for the recipient entity type
      const recipientEntityType = input.recipientType as 'LEAD' | 'CONTACT' | 'ACCOUNT';
      if (!context.allowedEntityTypes.includes(recipientEntityType)) {
        return {
          success: false,
          error: `Not authorized to send messages to ${input.recipientType}`,
          requiresApproval: true,
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Validate email requires subject
      if (input.type === 'EMAIL' && !input.subject) {
        return {
          success: false,
          error: 'Email messages require a subject',
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
        toolName: 'draft_message',
        actionType: 'DRAFT',
        entityType: 'MESSAGE',
        input: input as unknown as Record<string, unknown>,
        preview,
        status: 'PENDING',
        createdAt: now,
        expiresAt: new Date(now.getTime() + APPROVAL_EXPIRY_MS),
        createdBy: context.userId,
        agentSessionId: context.agentSessionId,
        metadata: {
          recipientType: input.recipientType,
          recipientId: input.recipientId,
          messageType: input.type,
        },
      };

      // Store pending action for approval
      await pendingActionsStore.add(pendingAction);

      // Log the pending action
      await agentLogger.log({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        toolName: 'draft_message',
        actionType: 'DRAFT',
        entityType: 'MESSAGE',
        input,
        success: true,
        durationMs: performance.now() - startTime,
        approvalRequired: true,
        approvalStatus: 'PENDING',
        metadata: { actionId, recipientType: input.recipientType, recipientId: input.recipientId },
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
        toolName: 'draft_message',
        actionType: 'DRAFT',
        entityType: 'MESSAGE',
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
    input: DraftMessageInput,
    _context: AgentAuthContext
  ): Promise<ActionPreview> {
    const warnings: string[] = [];
    const changes = [];

    // Add message type
    changes.push({
      field: 'type',
      previousValue: null,
      newValue: input.type,
      changeType: 'ADD' as const,
    });

    // Add recipient info
    changes.push({
      field: 'recipient',
      previousValue: null,
      newValue: `${input.recipientType}: ${input.recipientId}`,
      changeType: 'ADD' as const,
    });

    // Add subject for emails
    if (input.subject) {
      changes.push({
        field: 'subject',
        previousValue: null,
        newValue: input.subject,
        changeType: 'ADD' as const,
      });
    }

    // Add message body
    changes.push({
      field: 'body',
      previousValue: null,
      newValue: input.body,
      changeType: 'ADD' as const,
    });

    // Check message length
    if (input.type === 'SMS' && input.body.length > 160) {
      warnings.push(
        `SMS message is ${input.body.length} characters. Messages over 160 characters may be split into multiple SMS.`
      );
    }

    if (input.type === 'EMAIL' && input.body.length > 5000) {
      warnings.push('Email body is quite long. Consider splitting into multiple emails.');
    }

    // Check for scheduling
    if (input.scheduledFor) {
      changes.push({
        field: 'scheduledFor',
        previousValue: null,
        newValue: input.scheduledFor.toISOString(),
        changeType: 'ADD' as const,
      });

      if (input.scheduledFor < new Date()) {
        warnings.push('Warning: Scheduled time is in the past');
      }

      // Check for outside business hours
      const hour = input.scheduledFor.getHours();
      if (hour < 8 || hour > 18) {
        warnings.push('Scheduled time is outside typical business hours (8am-6pm)');
      }
    }

    // Check for template usage
    if (input.templateId) {
      changes.push({
        field: 'templateId',
        previousValue: null,
        newValue: input.templateId,
        changeType: 'ADD' as const,
      });
    }

    // Content warnings
    const bodyLower = input.body.toLowerCase();

    // Check for potential sensitive content
    if (bodyLower.includes('confidential') || bodyLower.includes('private')) {
      warnings.push('Message contains potentially confidential content - please review carefully');
    }

    // Check for unsubscribe link in marketing emails
    if (input.type === 'EMAIL' && !bodyLower.includes('unsubscribe')) {
      warnings.push('Consider adding an unsubscribe link for marketing emails (compliance)');
    }

    // Determine impact level
    let estimatedImpact: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';

    if (input.type === 'EMAIL') {
      estimatedImpact = 'MEDIUM'; // Emails are trackable and reversible in perception
    } else if (input.type === 'SMS') {
      estimatedImpact = 'HIGH'; // SMS is harder to "unsend" and has immediate visibility
    } else if (input.type === 'NOTE') {
      estimatedImpact = 'LOW'; // Internal notes have lower external impact
    }

    const affectedEntities = [
      {
        type: 'MESSAGE' as const,
        id: 'NEW',
        name: input.subject || `${input.type} to ${input.recipientType}`,
        action: 'CREATE' as const,
      },
      {
        type: input.recipientType as 'LEAD' | 'CONTACT' | 'ACCOUNT',
        id: input.recipientId,
        name: `${input.recipientType} ${input.recipientId}`,
        action: 'UPDATE' as const, // Adding a message affects the recipient's activity
      },
    ];

    // Create summary
    let summary = `Draft ${input.type.toLowerCase()}`;
    if (input.subject) {
      summary += `: "${input.subject}"`;
    }
    summary += ` to ${input.recipientType.toLowerCase()} ${input.recipientId}`;
    if (input.scheduledFor) {
      summary += ` (scheduled for ${input.scheduledFor.toLocaleString()})`;
    }

    return {
      summary,
      changes,
      affectedEntities,
      warnings: warnings.length > 0 ? warnings : undefined,
      estimatedImpact,
    };
  },

  async rollback(
    actionId: string,
    executionResult: DraftedMessageResult,
    context: AgentAuthContext
  ): Promise<RollbackResult> {
    try {
      // For drafts, rollback means marking the message as cancelled/deleted
      // If the message was already sent, rollback is not possible

      if (executionResult.status === 'SENT') {
        return {
          success: false,
          actionId,
          error: 'Cannot rollback a message that has already been sent',
        };
      }

      await agentLogger.log({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        toolName: 'draft_message',
        actionType: 'DELETE',
        entityType: 'MESSAGE',
        input: { messageId: executionResult.id, action: 'rollback' },
        success: true,
        durationMs: 0,
        approvalRequired: false,
        metadata: { originalActionId: actionId },
      });

      return {
        success: true,
        actionId,
        rolledBackAt: new Date(),
        restoredState: { cancelledMessageId: executionResult.id },
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
 * Export draft message tools
 */
export const draftMessageTools = {
  draftMessageTool,
};
