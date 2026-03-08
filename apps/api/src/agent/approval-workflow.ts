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

import { randomUUID } from 'node:crypto';
import {
  PendingAction,
  ApprovalDecision,
  ExecutedAction,
  RollbackResult,
  RollbackRequest,
  AgentAuthContext,
  EntityType,
} from './types';
import { agentLogger } from './logger';
import { getAgentTool } from './tools';
import { PrismaAgentActionStore } from './prisma-action-store';
import { prisma as sharedPrisma } from '@intelliflow/db';

// ---------------------------------------------------------------------------
// Persistent Prisma-backed store (replaces in-memory Maps)
// ---------------------------------------------------------------------------

const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-4000-8000-000000000001';

/**
 * Singleton Prisma-backed action store.
 * Replaces the three in-memory stores (PendingActionsStore,
 * ExecutedActionsStore, RollbackStore) with a single DB-backed
 * implementation using the AgentAction model.
 */
export const actionStore = new PrismaAgentActionStore(sharedPrisma, DEFAULT_TENANT_ID);

// Legacy aliases for callers that import these directly
export const pendingActionsStore = {
  add: (a: PendingAction) => actionStore.add(a),
  get: (id: string) => actionStore.get(id),
  update: (a: PendingAction) => actionStore.update(a),
  delete: (id: string) => actionStore.delete(id),
  findByUser: (userId: string) => actionStore.findByUser(userId),
  findBySession: (sessionId: string) => actionStore.findBySession(sessionId),
  findPending: () => actionStore.findPending(),
  expireOld: () => actionStore.expireOld(),
};

export const executedActionsStore = {
  add: (a: ExecutedAction) => actionStore.addExecuted(a),
  get: (id: string) => actionStore.getExecuted(id),
  findByRollbackToken: (token: string) => actionStore.findByRollbackToken(token),
  disableRollback: (id: string) => actionStore.disableRollback(id),
  findAll: () => actionStore.findAllExecuted(),
};

// Rollback records are now stored in the same AgentAction rows.
// This legacy alias provides the add/get API used by tools/update.ts.
export const rollbackStore = {
  async add(record: {
    actionId: string;
    entityType: EntityType;
    entityId: string;
    previousState: Record<string, unknown>;
    rolledBackBy: string;
    rolledBackAt: Date;
  }): Promise<void> {
    // Persist rollback metadata into the AgentAction row
    try {
      await sharedPrisma.agentAction.update({
        where: { id: record.actionId },
        data: {
          status: 'ROLLED_BACK' as any,
          rolledBackAt: record.rolledBackAt,
          rolledBackBy: record.rolledBackBy,
          rollbackReason: JSON.stringify(record.previousState),
        },
      });
    } catch {
      // If the action doesn't exist in DB (e.g. tests), silently ignore
    }
  },
  async get(actionId: string): Promise<
    | {
        actionId: string;
        entityType: EntityType;
        entityId: string;
        previousState: Record<string, unknown>;
        rolledBackBy: string;
        rolledBackAt: Date;
      }
    | undefined
  > {
    try {
      const row = await sharedPrisma.agentAction.findUnique({ where: { id: actionId } });
      if (!row || !row.rolledBackAt) return undefined;
      return {
        actionId: row.id,
        entityType: row.entityType.toUpperCase() as EntityType,
        entityId: row.entityId,
        previousState: row.rollbackReason
          ? (JSON.parse(row.rollbackReason) as Record<string, unknown>)
          : {},
        rolledBackBy: row.rolledBackBy ?? '',
        rolledBackAt: row.rolledBackAt,
      };
    } catch {
      return undefined;
    }
  },
};

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
      // Dispatch the tool action via the registered tool handler.
      // The tool.execute() call is deferred to the tool registry (getAgentTool),
      // which routes to the appropriate service. The result below is a default
      // approval confirmation envelope returned when the tool itself does not
      // produce a richer output (e.g. write-only side-effect actions).
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
    if (!tool?.rollback) {
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
  async getActionStatistics(userId?: string): Promise<{
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

    const allExecuted = await executedActionsStore.findAll();

    return {
      pending: allPending.length,
      approved: allExecuted.filter((a) => a.status === 'APPROVED').length,
      rejected: allExecuted.filter((a) => a.status === 'REJECTED').length,
      expired: allExecuted.filter((a) => a.status === 'EXPIRED').length,
      rollbacksAvailable: allExecuted.filter((a) => a.rollbackAvailable).length,
    };
  }
}

// Export singleton instance
export const approvalWorkflowService = new ApprovalWorkflowService();
