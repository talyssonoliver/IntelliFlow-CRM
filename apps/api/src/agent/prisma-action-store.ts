/**
 * Prisma-backed Action Store
 *
 * Replaces the in-memory PendingActionsStore, ExecutedActionsStore, and
 * RollbackStore from approval-workflow.ts with a single Prisma-backed
 * implementation using the AgentAction model.
 *
 * Field mapping:
 *   PendingAction.toolName     → AgentAction.actionType
 *   PendingAction.input        → AgentAction.previousState (JSON)
 *   PendingAction.preview      → AgentAction.proposedState (JSON)
 *   PendingAction.preview.summary → AgentAction.description
 *   PendingAction.entityType   → AgentAction.entityType (lowercased)
 *   PendingAction.createdBy    → AgentAction.agentId
 *   PendingAction.agentSessionId → AgentAction.agentName
 *   PendingAction.status       → AgentAction.status (mapped to AgentActionStatus enum)
 *
 * @module agent/prisma-action-store
 * @task IFC-139
 */

import type { PrismaClient } from '@intelliflow/db';
import { confidenceToPercent } from '@intelliflow/domain';
import type { PendingAction, ExecutedAction, ApprovalStatus, ExecutionStatus } from './types';

/** An approved action still EXECUTING after this long was interrupted (crash/restart). */
const INTERRUPTED_AFTER_MS = 5 * 60 * 1000;

// Infer the AgentAction row type from Prisma's findUnique return
type AgentAction = NonNullable<Awaited<ReturnType<PrismaClient['agentAction']['findUnique']>>>;

// Map between approval-workflow statuses and Prisma AgentActionStatus enum
const STATUS_TO_DB: Record<ApprovalStatus, string> = {
  PENDING: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
};

const STATUS_FROM_DB: Record<string, ApprovalStatus> = {
  PENDING_APPROVAL: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  ROLLED_BACK: 'REJECTED', // close enough for workflow purposes
};

export class PrismaAgentActionStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tenantId: string
  ) {}

  // ---------------------------------------------------------------------------
  // PendingActionsStore API
  // ---------------------------------------------------------------------------

  async add(action: PendingAction): Promise<void> {
    await this.prisma.agentAction.create({
      data: {
        id: action.id,
        actionType: action.toolName,
        description: action.preview.summary,
        aiReasoning: JSON.stringify(action.metadata ?? {}),
        // RF-2 (#854): the caller's real confidence (0-100) or NULL — never derived from impact.
        confidenceScore: this.toConfidenceScore(action.confidence),
        status: STATUS_TO_DB[action.status] as any,
        entityId: (action.input.entityId as string) ?? action.id,
        entityType: action.entityType.toLowerCase(),
        entityName: action.preview.affectedEntities?.[0]?.name ?? action.entityType,
        previousState: action.input as any,
        proposedState: action.preview as any,
        agentId: action.createdBy,
        agentName: action.agentSessionId,
        expiresAt: action.expiresAt,
        // Stamp the action's OWN tenant when the caller supplied it (the tRPC
        // request path now does), so reads/approvals can enforce tenant ownership.
        // Falls back to the store's default only for legacy/background callers
        // that don't yet thread a tenant — see getPendingAction guard in the router.
        tenantId: action.tenantId ?? this.tenantId,
      },
    });
  }

  async get(id: string): Promise<PendingAction | undefined> {
    const row = await this.prisma.agentAction.findUnique({ where: { id } });
    if (!row) return undefined;

    const action = this.toPendingAction(row);

    // Check expiry
    if (action.status === 'PENDING' && action.expiresAt < new Date()) {
      action.status = 'EXPIRED';
      await this.update(action);
    }

    return action;
  }

  async update(action: PendingAction): Promise<void> {
    await this.prisma.agentAction.update({
      where: { id: action.id },
      data: {
        status: STATUS_TO_DB[action.status] as any,
        previousState: action.input as any,
        proposedState: action.preview as any,
        reviewedAt:
          action.status === 'APPROVED' || action.status === 'REJECTED' ? new Date() : undefined,
      },
    });
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.agentAction.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List a user's pending actions. `tenantId` defaults to the store's default
   * tenant (background/process callers), but request paths pass the caller's real
   * tenant so the filter matches the tenant stamped at creation (see `add`).
   * Without this, actions created for a non-default tenant would be invisible
   * to the list/count endpoints.
   */
  async findByUser(userId: string, tenantId: string = this.tenantId): Promise<PendingAction[]> {
    const rows = await this.prisma.agentAction.findMany({
      where: {
        // PG-198: the requester's own actions plus those escalated to this user.
        OR: [{ agentId: userId }, { escalatedTo: userId }],
        status: 'PENDING_APPROVAL' as any,
        expiresAt: { gt: new Date() },
        tenantId,
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toPendingAction(r));
  }

  async findBySession(sessionId: string): Promise<PendingAction[]> {
    const rows = await this.prisma.agentAction.findMany({
      where: {
        agentName: sessionId,
        status: 'PENDING_APPROVAL' as any,
        expiresAt: { gt: new Date() },
        tenantId: this.tenantId,
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toPendingAction(r));
  }

  async findPending(): Promise<PendingAction[]> {
    const rows = await this.prisma.agentAction.findMany({
      where: {
        status: 'PENDING_APPROVAL' as any,
        expiresAt: { gt: new Date() },
        tenantId: this.tenantId,
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toPendingAction(r));
  }

  /**
   * Mark a tenant's expired pending actions as EXPIRED. `tenantId` defaults to the
   * store's default tenant (background/process callers); request paths pass the
   * caller's real tenant so their own expired actions are also cleaned up — without
   * this, a non-default tenant's expired actions are never flipped to EXPIRED (they
   * stay PENDING_APPROVAL, only hidden from lists by the expiresAt filter).
   */
  async expireOld(tenantId: string = this.tenantId): Promise<number> {
    const result = await this.prisma.agentAction.updateMany({
      where: {
        status: 'PENDING_APPROVAL' as any,
        expiresAt: { lt: new Date() },
        tenantId,
      },
      data: { status: 'EXPIRED' as any },
    });
    return result.count;
  }

  /**
   * PG-198 (RF-1, #853): atomically take a pending, unexpired action for execution.
   * Only one caller can win (status-guarded update), so an action never runs twice.
   */
  async claimForExecution(
    action: PendingAction,
    reviewedBy: string,
    now: Date,
    executedInput: Record<string, unknown> = action.input
  ): Promise<boolean> {
    const result = await this.prisma.agentAction.updateMany({
      where: {
        id: action.id,
        tenantId: action.tenantId ?? this.tenantId,
        status: 'PENDING_APPROVAL' as any,
        expiresAt: { gt: now },
      },
      data: {
        status: 'APPROVED' as any,
        reviewedAt: now,
        reviewedBy,
        // The input that is about to run is recorded atomically with EXECUTING, so an
        // interrupted execution still shows what actually ran.
        proposedState: { ...action.preview, executionStatus: 'EXECUTING', executedInput } as any,
      },
    });
    return result.count === 1;
  }

  /**
   * PG-198: reject a still-pending action with the same status guard the approval
   * claim uses, so an approval and a rejection can never both win.
   */
  async rejectIfPending(
    action: PendingAction,
    reviewedBy: string,
    reason: string | undefined,
    now: Date
  ): Promise<boolean> {
    const result = await this.prisma.agentAction.updateMany({
      where: {
        id: action.id,
        tenantId: action.tenantId ?? this.tenantId,
        status: 'PENDING_APPROVAL' as any,
      },
      data: {
        status: 'REJECTED' as any,
        reviewedAt: now,
        reviewedBy,
        feedback: reason ?? null,
      },
    });
    return result.count === 1;
  }

  /**
   * Approved actions whose execution never finished (left EXECUTING by a crash),
   * requested or approved by this user. They are shown, never re-run.
   */
  async findInterrupted(
    userId: string,
    tenantId: string = this.tenantId
  ): Promise<ExecutedAction[]> {
    const rows = await this.prisma.agentAction.findMany({
      where: {
        tenantId,
        status: 'APPROVED' as any,
        proposedState: { path: ['executionStatus'], equals: 'EXECUTING' },
        reviewedAt: { lt: new Date(Date.now() - INTERRUPTED_AFTER_MS) },
        OR: [{ agentId: userId }, { reviewedBy: userId }],
      },
      orderBy: { reviewedAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.toExecutedAction(r));
  }

  // ---------------------------------------------------------------------------
  // ExecutedActionsStore API
  // ---------------------------------------------------------------------------

  async addExecuted(action: ExecutedAction): Promise<void> {
    await this.prisma.agentAction.update({
      where: { id: action.id },
      data: {
        status: 'APPROVED' as any,
        reviewedAt: action.executedAt ?? new Date(),
        reviewedBy: action.approval?.decidedBy,
        feedback: action.approval?.reason,
        proposedState: {
          ...(action.preview as any),
          executionStatus: action.executionStatus,
          // The input that actually ran (approver modifications included); the
          // original proposal stays in previousState.
          executedInput: action.input,
          executionResult: action.executionResult,
          executionError: action.executionError,
          rollbackAvailable: action.rollbackAvailable,
          rollbackToken: action.rollbackToken,
        } as any,
      },
    });
  }

  async getExecuted(id: string): Promise<ExecutedAction | undefined> {
    const row = await this.prisma.agentAction.findUnique({ where: { id } });
    if (!row || row.status !== ('APPROVED' as any)) return undefined;
    return this.toExecutedAction(row);
  }

  async findByRollbackToken(token: string): Promise<ExecutedAction | undefined> {
    // Rollback token is stored inside proposedState JSON (no generated column yet).
    // Filter on the JSON path directly (proposedState->>"rollbackToken") so the DB
    // returns only the matching row(s) — this is correctness-critical: without it,
    // a `take: 500` bound would silently miss a valid token belonging to an action
    // older than the 500 most-recent for a busy tenant. The take + orderBy remain
    // as a defensive upper bound on the (now token-matched, normally ≤1) result set;
    // the in-memory check below still verifies rollbackAvailable.
    // Long-term: a generated/virtual column or partial index on the same path would
    // let this drop the in-memory loop entirely.
    const rows = await this.prisma.agentAction.findMany({
      where: {
        status: 'APPROVED' as any,
        tenantId: this.tenantId,
        proposedState: { path: ['rollbackToken'], equals: token },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    for (const row of rows) {
      const proposed = row.proposedState as Record<string, unknown> | null;
      if (proposed?.rollbackToken === token && proposed?.rollbackAvailable) {
        return this.toExecutedAction(row);
      }
    }
    return undefined;
  }

  async disableRollback(id: string): Promise<void> {
    const row = await this.prisma.agentAction.findUnique({ where: { id } });
    if (!row) return;

    const proposed = (row.proposedState as Record<string, unknown>) ?? {};
    proposed.rollbackAvailable = false;
    await this.prisma.agentAction.update({
      where: { id },
      data: { proposedState: proposed as any },
    });
  }

  async findAllExecuted(): Promise<ExecutedAction[]> {
    const rows = await this.prisma.agentAction.findMany({
      where: {
        status: 'APPROVED' as any,
        tenantId: this.tenantId,
      },
      orderBy: { reviewedAt: 'desc' },
    });
    return rows.map((r) => this.toExecutedAction(r));
  }

  // ---------------------------------------------------------------------------
  // Mappers
  // ---------------------------------------------------------------------------

  private toPendingAction(row: AgentAction): PendingAction {
    const proposed = (row.proposedState as Record<string, unknown>) ?? {};
    const input = (row.previousState as Record<string, unknown>) ?? {};

    return {
      id: row.id,
      tenantId: row.tenantId,
      toolName: row.actionType,
      actionType: this.inferActionType(row.actionType),
      entityType: row.entityType.toUpperCase() as any,
      input,
      preview: {
        summary: row.description,
        changes: (proposed.changes as any[]) ?? [],
        affectedEntities: (proposed.affectedEntities as any[]) ?? [],
        warnings: (proposed.warnings as string[]) ?? [],
        estimatedImpact: this.toImpact(proposed.estimatedImpact),
      },
      confidence: row.confidenceScore === null ? undefined : row.confidenceScore / 100,
      escalatedAt: row.escalatedAt ?? undefined,
      escalatedTo: row.escalatedTo ?? undefined,
      status: STATUS_FROM_DB[row.status] ?? 'PENDING',
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      createdBy: row.agentId,
      agentSessionId: row.agentName,
      metadata: row.aiReasoning ? this.safeParseJson(row.aiReasoning) : undefined,
    };
  }

  private toExecutedAction(row: AgentAction): ExecutedAction {
    const pending = this.toPendingAction(row);
    const proposed = (row.proposedState as Record<string, unknown>) ?? {};

    return {
      ...pending,
      input: (proposed.executedInput as Record<string, unknown> | undefined) ?? pending.input,
      executionStatus: proposed.executionStatus as ExecutionStatus | undefined,
      executedAt: row.reviewedAt ?? undefined,
      executionResult: proposed.executionResult,
      executionError: proposed.executionError as string | undefined,
      approval: row.reviewedBy
        ? {
            actionId: row.id,
            decision: 'APPROVE' as const,
            decidedBy: row.reviewedBy,
            reason: row.feedback ?? undefined,
            decidedAt: row.reviewedAt ?? new Date(),
          }
        : undefined,
      rollbackAvailable: (proposed.rollbackAvailable as boolean) ?? false,
      rollbackToken: proposed.rollbackToken as string | undefined,
    };
  }

  /** 0..1 → whole percent (floored, so 0.899 never reads as 90); invalid/absent → null. */
  private toConfidenceScore(confidence: unknown): number | null {
    const percent = confidenceToPercent(confidence);
    return percent === null ? null : Math.floor(percent);
  }

  /** The impact stored with the preview; anything else is unknown. */
  private toImpact(value: unknown): 'LOW' | 'MEDIUM' | 'HIGH' | undefined {
    return value === 'LOW' || value === 'MEDIUM' || value === 'HIGH' ? value : undefined;
  }

  private inferActionType(actionType: string): 'SEARCH' | 'CREATE' | 'UPDATE' | 'DELETE' | 'DRAFT' {
    const lower = actionType.toLowerCase();
    if (lower.includes('create') || lower.includes('add')) return 'CREATE';
    if (lower.includes('delete') || lower.includes('remove')) return 'DELETE';
    if (lower.includes('search') || lower.includes('find')) return 'SEARCH';
    if (lower.includes('draft')) return 'DRAFT';
    return 'UPDATE';
  }

  private safeParseJson(str: string): Record<string, unknown> | undefined {
    try {
      return JSON.parse(str);
    } catch {
      return { raw: str };
    }
  }
}
