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
import { getAgentTool, getForTenant, ToolDisabledError } from './tools';
import { PrismaAgentActionStore } from './prisma-action-store';
import { executeApprovedAction, prepareExecutionInput } from './approved-action-executor';
import { canCompensate, compensateApprovedAction } from './approved-action-compensator';
import type { Context } from '../context';
import { prisma as sharedPrisma } from '@intelliflow/db';

/**
 * PG-198: an approval was refused before the action was claimed — nothing ran and the
 * action is still pending (or already decided by someone else).
 */
export class ApprovalNotClaimedError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ApprovalNotClaimedError';
  }
}

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
// M4 (Epsilon3): sharedPrisma is wrapped in $extends — cast to the expected base type
// since the runtime behavior is identical.
export const actionStore = new PrismaAgentActionStore(sharedPrisma as never, DEFAULT_TENANT_ID);

// Legacy aliases for callers that import these directly
export const pendingActionsStore = {
  add: (a: PendingAction) => actionStore.add(a),
  get: (id: string, tenantId?: string) => actionStore.get(id, tenantId),
  update: (a: PendingAction, tenantId?: string) => actionStore.update(a, tenantId),
  delete: (id: string, tenantId?: string) => actionStore.delete(id, tenantId),
  findByUser: (userId: string, tenantId?: string) => actionStore.findByUser(userId, tenantId),
  findBySession: (sessionId: string) => actionStore.findBySession(sessionId),
  findPending: () => actionStore.findPending(),
  expireOld: (tenantId?: string) => actionStore.expireOld(tenantId),
};

export const executedActionsStore = {
  add: (a: ExecutedAction) => actionStore.addExecuted(a),
  get: (id: string, tenantId?: string) => actionStore.getExecuted(id, tenantId),
  findByRollbackToken: (token: string, tenantId?: string) =>
    actionStore.findByRollbackToken(token, tenantId),
  disableRollback: (id: string, tenantId?: string) => actionStore.disableRollback(id, tenantId),
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
   * Re-check tool enablement BEFORE execution.
   * When tenantId + prisma are available on the context we use the gated path;
   * background jobs that lack tenant context fall back to the plain registry lookup
   * (TODO: wire tenantId through background job contexts before invoking tools).
   * Extracted from approveAction() to keep its cognitive complexity under 15.
   */
  private async resolveApprovalTool(
    action: PendingAction,
    context: AgentAuthContext
  ): Promise<ReturnType<typeof getAgentTool>> {
    if (!context.tenantId || !context.prisma) {
      // Bypass rationale: background-job / cron execution path where no tRPC
      // request context is present (e.g. scheduled job retries, queue consumers).
      return getAgentTool(action.toolName);
    }
    try {
      return await getForTenant({
        name: action.toolName,
        tenantId: context.tenantId,
        prisma: context.prisma,
      });
    } catch (err) {
      if (err instanceof ToolDisabledError) {
        throw new Error(
          `Cannot execute approved action: tool "${action.toolName}" has been ` +
            `disabled for tenant ${context.tenantId} since the approval was requested.`,
          { cause: err }
        );
      }
      throw err;
    }
  }

  /**
   * Get all pending actions for a user
   */
  async getPendingActions(userId: string, tenantId?: string): Promise<PendingAction[]> {
    // Clean up expired actions first (scoped to the caller's tenant, matching the
    // findByUser filter below).
    await pendingActionsStore.expireOld(tenantId);
    // Pass the caller's tenant so list/count match the tenant stamped at creation;
    // omitted (background callers) falls back to the store's default tenant.
    return pendingActionsStore.findByUser(userId, tenantId);
  }

  /**
   * PG-198 (A2): approved actions whose execution was interrupted (left EXECUTING),
   * requested or approved by this user — shown to reviewers, never re-run.
   */
  async getInterruptedActions(userId: string, tenantId?: string): Promise<ExecutedAction[]> {
    return actionStore.findInterrupted(userId, tenantId);
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
  async getPendingAction(actionId: string, tenantId?: string): Promise<PendingAction | undefined> {
    return pendingActionsStore.get(actionId, tenantId);
  }

  /**
   * Everything that must succeed before an approved action may run: it exists, is
   * pending and unexpired, its tool is still enabled, the input is valid, and this
   * caller wins the atomic claim. Any failure here means nothing was claimed.
   */
  private async claimApproval(
    decision: ApprovalDecision,
    context: AgentAuthContext
  ): Promise<{ action: PendingAction; inputToExecute: Record<string, unknown> }> {
    const action = await pendingActionsStore.get(decision.actionId, context.tenantId);

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

    const tool = await this.resolveApprovalTool(action, context);
    if (!tool) {
      throw new Error(`Tool not found: ${action.toolName}`);
    }

    // Validate before claiming, so a bad modification leaves the action pending.
    const inputToExecute = prepareExecutionInput(
      action.toolName,
      tool.inputSchema,
      action.input,
      decision.modifiedInput
    );

    // Expiry is judged at the claim itself, not when approval started: the reads above
    // take time, and an action that expired meanwhile must not run.
    if (
      !(await actionStore.claimForExecution(action, decision.decidedBy, new Date(), inputToExecute))
    ) {
      throw new ApprovalNotClaimedError('Action is no longer pending (already decided or expired)');
    }

    return { action, inputToExecute };
  }

  /**
   * Approve and execute a pending action (PG-198 RF-1, #853).
   *
   * The action is claimed atomically (only one approver can win), the input that
   * will run is re-validated with the tool's schema, and the real mutation runs
   * through the target module's tRPC procedure on the approver's request
   * context. A failure is stored as FAILED with its reason — never as success.
   * A rollback token is issued only when the action succeeded and a real
   * compensation exists for it (#856): see approved-action-compensator.ts.
   */
  async approveAction(
    decision: ApprovalDecision,
    context: AgentAuthContext,
    requestCtx?: Context
  ): Promise<ExecutedAction> {
    let action: PendingAction;
    let inputToExecute: Record<string, unknown>;
    const claimedAt = new Date();
    try {
      ({ action, inputToExecute } = await this.claimApproval(decision, context));
    } catch (error) {
      // Nothing was claimed or run: callers (auto-approval) may leave it pending.
      throw error instanceof ApprovalNotClaimedError
        ? error
        : new ApprovalNotClaimedError(
            error instanceof Error ? error.message : String(error),
            error
          );
    }

    const outcome = await executeApprovedAction(action.toolName, inputToExecute, requestCtx, {
      requesterId: action.createdBy,
    });
    const durationMs = Date.now() - claimedAt.getTime();
    const rollbackAvailable =
      outcome.status === 'SUCCEEDED' && canCompensate(action.toolName, outcome.result);

    const executedAction: ExecutedAction = {
      ...action,
      input: inputToExecute,
      status: 'APPROVED',
      executionStatus: outcome.status,
      executedAt: new Date(),
      executionResult: outcome.result,
      executionError: outcome.error,
      approval: decision,
      rollbackAvailable,
      rollbackToken: rollbackAvailable ? randomUUID() : undefined,
    };

    await executedActionsStore.add(executedAction);

    await agentLogger.log({
      userId: context.userId,
      agentSessionId: context.agentSessionId,
      toolName: action.toolName,
      actionType: action.actionType,
      entityType: action.entityType,
      input: inputToExecute,
      output: outcome.result,
      success: outcome.status === 'SUCCEEDED',
      error: outcome.error,
      durationMs,
      approvalRequired: true,
      approvalStatus: 'APPROVED',
      approvedBy: decision.decidedBy,
      metadata: {
        originalActionId: action.id,
        modifiedInput: !!decision.modifiedInput,
        executionStatus: outcome.status,
        rollbackAvailable,
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
    const action = await pendingActionsStore.get(decision.actionId, context.tenantId);

    if (!action) {
      throw new Error(`Pending action not found: ${decision.actionId}`);
    }

    if (action.status !== 'PENDING') {
      throw new Error(`Action is not pending: ${action.status}`);
    }

    // Status-guarded (PG-198): loses cleanly to a concurrent approval or expiry.
    if (
      !(await actionStore.rejectIfPending(action, decision.decidedBy, decision.reason, new Date()))
    ) {
      throw new Error('Action is no longer pending (already decided or expired)');
    }
    action.status = 'REJECTED';

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
   * Roll back an executed action (#856).
   *
   * The token is looked up in the caller's tenant only, the rollback is claimed
   * atomically (two concurrent requests cannot both run it), and the undo itself runs
   * through the target module's own procedure on the requester's request context. A
   * compensation that fails changes nothing, so the claim is given back for a retry.
   */
  async rollbackAction(
    request: RollbackRequest,
    context: AgentAuthContext,
    requestCtx?: Context
  ): Promise<RollbackResult> {
    const fail = (error: string): RollbackResult => ({
      success: false,
      actionId: request.actionId,
      error,
    });
    const tenantId = context.tenantId ?? DEFAULT_TENANT_ID;
    const executedAction = await executedActionsStore.findByRollbackToken(
      request.rollbackToken,
      tenantId
    );

    if (!executedAction || executedAction.id !== request.actionId) {
      return fail('Invalid rollback token or action not found');
    }

    // Check rollback window
    const executedAt = executedAction.executedAt;
    if (executedAt && Date.now() - executedAt.getTime() > this.rollbackWindowMs) {
      await executedActionsStore.disableRollback(executedAction.id, tenantId);
      return fail('Rollback window has expired (1 hour limit)');
    }

    // Tenant tool enablement is deliberately not re-checked: an admin may disable a tool
    // after approval, and its executed actions must still be undoable.
    if (!canCompensate(executedAction.toolName, executedAction.executionResult)) {
      return fail('Tool does not support rollback');
    }

    if (!(await actionStore.claimRollback(executedAction.id, tenantId, request.rollbackToken))) {
      return fail('Rollback is no longer available for this action');
    }

    const outcome = await compensateApprovedAction(
      executedAction.toolName,
      executedAction.executionResult,
      requestCtx
    );
    const rolledBackAt = new Date();

    if (outcome.success) {
      await actionStore.markRolledBack(executedAction.id, tenantId, {
        rolledBackBy: request.requestedBy,
        rolledBackAt,
        reason: request.reason,
        restoredState: outcome.restoredState,
      });
    } else {
      await actionStore.releaseRollback(executedAction.id, tenantId);
    }

    await agentLogger.log({
      userId: context.userId,
      agentSessionId: context.agentSessionId,
      toolName: executedAction.toolName,
      actionType: 'DELETE', // Rollback is effectively a delete/undo
      entityType: executedAction.entityType,
      input: { action: 'rollback', reason: request.reason },
      output: outcome,
      success: outcome.success,
      error: outcome.error,
      durationMs: 0,
      approvalRequired: false,
      metadata: {
        originalActionId: executedAction.id,
        rollbackReason: request.reason,
      },
    });

    return outcome.success
      ? {
          success: true,
          actionId: executedAction.id,
          rolledBackAt,
          restoredState: outcome.restoredState,
        }
      : fail(outcome.error ?? 'Rollback failed');
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
