/**
 * Approval Workflow Module
 *
 * IFC-139: Human approval flow for agent actions
 *
 * This module manages pending actions that require human approval before execution.
 * It provides:
 * - Storage and retrieval of pending actions
 * - Approval/rejection workflow
 * - Execution of approved actions
 * - Rollback capability for executed actions
 * - Diff preview generation
 */

import { randomUUID } from 'crypto';
import {
  PendingAction,
  ApprovalDecision,
  ExecutedAction,
  RollbackResult,
  RollbackRequest,
  AgentAuthContext,
  ApprovalStatus,
  EntityType,
} from './types';
import { agentLogger } from './logger';
import { getAgentTool } from './tools';

/**
 * In-memory store for pending actions
 * In production, this would be backed by a database
 */
class PendingActionsStore {
  private actions: Map<string, PendingAction> = new Map();

  async add(action: PendingAction): Promise<void> {
    this.actions.set(action.id, action);
  }

  async get(id: string): Promise<PendingAction | undefined> {
    const action = this.actions.get(id);
    if (action && action.expiresAt < new Date()) {
      // Action has expired, update status
      action.status = 'EXPIRED';
      await this.update(action);
      return action;
    }
    return action;
  }

  async update(action: PendingAction): Promise<void> {
    this.actions.set(action.id, action);
  }

  async delete(id: string): Promise<boolean> {
    return this.actions.delete(id);
  }

  async findByUser(userId: string): Promise<PendingAction[]> {
    const now = new Date();
    return Array.from(this.actions.values()).filter(
      (action) =>
        action.createdBy === userId &&
        action.status === 'PENDING' &&
        action.expiresAt > now
    );
  }

  async findBySession(sessionId: string): Promise<PendingAction[]> {
    const now = new Date();
    return Array.from(this.actions.values()).filter(
      (action) =>
        action.agentSessionId === sessionId &&
        action.status === 'PENDING' &&
        action.expiresAt > now
    );
  }

  async findPending(): Promise<PendingAction[]> {
    const now = new Date();
    return Array.from(this.actions.values()).filter(
      (action) => action.status === 'PENDING' && action.expiresAt > now
    );
  }

  async expireOld(): Promise<number> {
    const now = new Date();
    let expiredCount = 0;

    for (const [id, action] of this.actions.entries()) {
      if (action.status === 'PENDING' && action.expiresAt < now) {
        action.status = 'EXPIRED';
        this.actions.set(id, action);
        expiredCount++;
      }
    }

    return expiredCount;
  }
}

/**
 * Store for executed actions (for rollback capability)
 */
class ExecutedActionsStore {
  private actions: Map<string, ExecutedAction> = new Map();

  async add(action: ExecutedAction): Promise<void> {
    this.actions.set(action.id, action);
  }

  async get(id: string): Promise<ExecutedAction | undefined> {
    return this.actions.get(id);
  }

  async findByRollbackToken(token: string): Promise<ExecutedAction | undefined> {
    return Array.from(this.actions.values()).find(
      (action) => action.rollbackToken === token && action.rollbackAvailable
    );
  }

  async disableRollback(id: string): Promise<void> {
    const action = this.actions.get(id);
    if (action) {
      action.rollbackAvailable = false;
      this.actions.set(id, action);
    }
  }
}

/**
 * Store for rollback records
 */
interface RollbackRecord {
  actionId: string;
  entityType: EntityType;
  entityId: string;
  previousState: Record<string, unknown>;
  rolledBackBy: string;
  rolledBackAt: Date;
}

class RollbackStore {
  private records: Map<string, RollbackRecord> = new Map();

  async add(record: RollbackRecord): Promise<void> {
    this.records.set(record.actionId, record);
  }

  async get(actionId: string): Promise<RollbackRecord | undefined> {
    return this.records.get(actionId);
  }
}

// Export singleton instances
export const pendingActionsStore = new PendingActionsStore();
export const executedActionsStore = new ExecutedActionsStore();
export const rollbackStore = new RollbackStore();

/**
 * Approval Workflow Service
 *
 * Manages the lifecycle of agent actions requiring human approval:
 * 1. Action created by agent tool -> PENDING
 * 2. Human reviews and approves/rejects -> APPROVED/REJECTED
 * 3. If approved, action is executed -> action result stored
 * 4. If needed, action can be rolled back (within rollback window)
 */
export class ApprovalWorkflowService {
  private readonly rollbackWindowMs = 60 * 60 * 1000; // 1 hour rollback window

  /**
   * Get all pending actions for a user
   */
  async getPendingActions(userId: string): Promise<PendingAction[]> {
    // Clean up expired actions first
    await pendingActionsStore.expireOld();
    return pendingActionsStore.findByUser(userId);
  }

  /**
   * Get all pending actions for an agent session
   */
  async getPendingActionsForSession(sessionId: string): Promise<PendingAction[]> {
    await pendingActionsStore.expireOld();
    return pendingActionsStore.findBySession(sessionId);
  }

  /**
   * Get a specific pending action by ID
   */
  async getPendingAction(actionId: string): Promise<PendingAction | undefined> {
    return pendingActionsStore.get(actionId);
  }

  /**
   * Approve and execute a pending action
   */
  async approveAction(
    decision: ApprovalDecision,
    context: AgentAuthContext
  ): Promise<ExecutedAction> {
    const action = await pendingActionsStore.get(decision.actionId);

    if (!action) {
      throw new Error(`Pending action not found: ${decision.actionId}`);
    }

    if (action.status !== 'PENDING') {
      throw new Error(`Action is not pending: ${action.status}`);
    }

    if (action.expiresAt < new Date()) {
      action.status = 'EXPIRED';
      await pendingActionsStore.update(action);
      throw new Error('Action has expired');
    }

    // Update action status
    action.status = 'APPROVED';
    await pendingActionsStore.update(action);

    // Get the tool to execute
    const tool = getAgentTool(action.toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${action.toolName}`);
    }

    // Use modified input if provided
    const inputToExecute = decision.modifiedInput || action.input;

    // Execute the approved action
    let executionResult: unknown;
    let executionError: string | undefined;

    try {
      // In a real implementation, this would call the actual service/use case
      // For now, we create a placeholder result
      executionResult = {
        success: true,
        message: 'Action executed successfully',
        entityId: randomUUID(),
        timestamp: new Date(),
      };
    } catch (error) {
      executionError = error instanceof Error ? error.message : 'Execution failed';
    }

    // Generate rollback token if action supports rollback
    const rollbackToken = tool.rollback ? randomUUID() : undefined;

    // Create executed action record
    const executedAction: ExecutedAction = {
      ...action,
      executedAt: new Date(),
      executionResult,
      executionError,
      approval: decision,
      rollbackAvailable: !!tool.rollback && !executionError,
      rollbackToken,
    };

    // Store executed action
    await executedActionsStore.add(executedAction);

    // Log the approval and execution
    await agentLogger.log({
      userId: context.userId,
      agentSessionId: context.agentSessionId,
      toolName: action.toolName,
      actionType: action.actionType,
      entityType: action.entityType,
      input: inputToExecute,
      output: executionResult,
      success: !executionError,
      error: executionError,
      durationMs: 0,
      approvalRequired: true,
      approvalStatus: 'APPROVED',
      approvedBy: decision.decidedBy,
      metadata: {
        originalActionId: action.id,
        modifiedInput: !!decision.modifiedInput,
        rollbackAvailable: executedAction.rollbackAvailable,
      },
    });

    return executedAction;
  }

  /**
   * Reject a pending action
   */
  async rejectAction(
    decision: ApprovalDecision,
    context: AgentAuthContext
  ): Promise<PendingAction> {
    const action = await pendingActionsStore.get(decision.actionId);

    if (!action) {
      throw new Error(`Pending action not found: ${decision.actionId}`);
    }

    if (action.status !== 'PENDING') {
      throw new Error(`Action is not pending: ${action.status}`);
    }

    // Update action status
    action.status = 'REJECTED';
    await pendingActionsStore.update(action);

    // Log the rejection
    await agentLogger.log({
      userId: context.userId,
      agentSessionId: context.agentSessionId,
      toolName: action.toolName,
      actionType: action.actionType,
      entityType: action.entityType,
      input: action.input,
      success: true,
      durationMs: 0,
      approvalRequired: true,
      approvalStatus: 'REJECTED',
      metadata: {
        originalActionId: action.id,
        rejectionReason: decision.reason,
      },
    });

    return action;
  }

  /**
   * Request rollback of an executed action
   */
  async rollbackAction(
    request: RollbackRequest,
    context: AgentAuthContext
  ): Promise<RollbackResult> {
    // Find executed action by rollback token
    const executedAction = await executedActionsStore.findByRollbackToken(request.rollbackToken);

    if (!executedAction) {
      return {
        success: false,
        actionId: request.actionId,
        error: 'Invalid rollback token or action not found',
      };
    }

    if (!executedAction.rollbackAvailable) {
      return {
        success: false,
        actionId: request.actionId,
        error: 'Rollback is no longer available for this action',
      };
    }

    // Check rollback window
    const executedAt = executedAction.executedAt;
    if (executedAt && Date.now() - executedAt.getTime() > this.rollbackWindowMs) {
      await executedActionsStore.disableRollback(executedAction.id);
      return {
        success: false,
        actionId: request.actionId,
        error: 'Rollback window has expired (1 hour limit)',
      };
    }

    // Get the tool to perform rollback
    const tool = getAgentTool(executedAction.toolName);
    if (!tool || !tool.rollback) {
      return {
        success: false,
        actionId: request.actionId,
        error: 'Tool does not support rollback',
      };
    }

    try {
      // Execute rollback
      const result = await tool.rollback(
        executedAction.id,
        executedAction.executionResult,
        context
      );

      if (result.success) {
        // Disable further rollbacks
        await executedActionsStore.disableRollback(executedAction.id);
      }

      // Log the rollback
      await agentLogger.log({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        toolName: executedAction.toolName,
        actionType: 'DELETE', // Rollback is effectively a delete/undo
        entityType: executedAction.entityType,
        input: { action: 'rollback', reason: request.reason },
        output: result,
        success: result.success,
        error: result.error,
        durationMs: 0,
        approvalRequired: false,
        metadata: {
          originalActionId: executedAction.id,
          rollbackReason: request.reason,
        },
      });

      return result;
    } catch (error) {
      return {
        success: false,
        actionId: request.actionId,
        error: error instanceof Error ? error.message : 'Rollback failed',
      };
    }
  }

  /**
   * Get the diff preview for a pending action
   * Returns the action's preview which contains change details
   */
  getDiffPreview(action: PendingAction): {
    summary: string;
    changes: Array<{
      field: string;
      before: unknown;
      after: unknown;
      type: 'ADD' | 'MODIFY' | 'DELETE';
    }>;
    warnings: string[];
    impactLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  } {
    return {
      summary: action.preview.summary,
      changes: action.preview.changes.map((change) => ({
        field: change.field,
        before: change.previousValue,
        after: change.newValue,
        type: change.changeType,
      })),
      warnings: action.preview.warnings || [],
      impactLevel: action.preview.estimatedImpact || 'MEDIUM',
    };
  }

  /**
   * Get statistics about pending/executed actions
   */
  async getActionStatistics(
    userId?: string
  ): Promise<{
    pending: number;
    approved: number;
    rejected: number;
    expired: number;
    rollbacksAvailable: number;
  }> {
    await pendingActionsStore.expireOld();

    const allPending = userId
      ? await pendingActionsStore.findByUser(userId)
      : await pendingActionsStore.findPending();

    // In a real implementation, we would query from the database
    // For now, we return placeholder stats
    return {
      pending: allPending.length,
      approved: 0, // Would query from executed actions
      rejected: 0, // Would query from rejected actions
      expired: 0, // Would query from expired actions
      rollbacksAvailable: 0, // Would count actions with rollbackAvailable=true
    };
  }
}

// Export singleton instance
export const approvalWorkflowService = new ApprovalWorkflowService();
